/**
 * Host half of the master-prompt bundle.
 *
 * Owns the per-main-conversation prompt store, the sub-conversation mapping,
 * the two agent tools, prompt injection, and the authenticated RPC channel the
 * Web panel uses.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const CHANNEL = '/master-prompt'
export const PRESET_ID = 'master-collab'
export const inject = ['tools', 'sessions', 'agents', 'sessionController', 'workingDirectory', 'workspaceRegistry', 'systemPrompt', 'commands']
const MAX_PROMPT_BYTES = 262144
const MAX_DIFF_LINES = 2000

const MAIN_LABEL = '主对话'
const CHILD_LABEL = '副对话'

function now() {
  return Date.now()
}

function sha(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex')
}

function shortId(id) {
  const raw = String(id ?? '')
  const tail = raw.startsWith('session-') ? raw.slice('session-'.length) : raw
  return tail.slice(0, 8) || '未知'
}

function tokenEstimate(text) {
  if (!text) return 0
  let cjk = 0
  let other = 0
  for (const ch of text) {
    if (/[\u3400-\u9fff\uf900-\ufaff]/.test(ch)) cjk += 1
    else other += 1
  }
  return Math.max(1, Math.round(cjk + other / 4))
}

function textLines(text) {
  return String(text ?? '').replace(/\r\n/g, '\n').split('\n')
}

function writeAtomic(file, text) {
  const dir = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true })
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`)
  fs.writeFileSync(tmp, text, 'utf8')
  fs.renameSync(tmp, file)
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, value) {
  writeAtomic(file, JSON.stringify(value, null, 2) + '\n')
}

function clamp(text, max) {
  return text.length > max ? text.slice(0, max) : text
}

/** ---------------------------------------------------------------- diff --- */

function diffOps(a, b) {
  const n = a.length
  const m = b.length
  const w = m + 1
  const dp = new Uint16Array((n + 1) * (m + 1))
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i * w + j] = a[i] === b[j]
        ? dp[(i + 1) * w + (j + 1)] + 1
        : Math.max(dp[(i + 1) * w + j], dp[i * w + (j + 1)])
    }
  }
  const ops = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ t: ' ', text: a[i] })
      i += 1
      j += 1
    } else if (dp[(i + 1) * w + j] >= dp[i * w + (j + 1)]) {
      ops.push({ t: '-', text: a[i] })
      i += 1
    } else {
      ops.push({ t: '+', text: b[j] })
      j += 1
    }
  }
  while (i < n) {
    ops.push({ t: '-', text: a[i] })
    i += 1
  }
  while (j < m) {
    ops.push({ t: '+', text: b[j] })
    j += 1
  }
  return ops
}

function hunksFromOps(ops, context = 3) {
  const changes = []
  for (let i = 0; i < ops.length; i += 1) {
    if (ops[i].t !== ' ') changes.push(i)
  }
  if (changes.length === 0) return []

  const groups = []
  let first = changes[0]
  let last = changes[0]
  for (let i = 1; i < changes.length; i += 1) {
    if (changes[i] - last <= context * 2 + 1) {
      last = changes[i]
    } else {
      groups.push([first, last])
      first = changes[i]
      last = changes[i]
    }
  }
  groups.push([first, last])

  const hunks = []
  for (const [firstChange, lastChange] of groups) {
    const start = Math.max(0, firstChange - context)
    const end = Math.min(ops.length, lastChange + context + 1)

    let oldNo = 0
    let newNo = 0
    for (let i = 0; i < start; i += 1) {
      if (ops[i].t !== '+') oldNo += 1
      if (ops[i].t !== '-') newNo += 1
    }
    const lines = []
    let oldStart = -1
    let oldCount = 0
    const newLines = []
    for (let i = start; i < end; i += 1) {
      const op = ops[i]
      if (op.t === ' ') {
        lines.push({ kind: ' ', text: op.text, oldNo: oldNo + 1, newNo: newNo + 1 })
        oldNo += 1
        newNo += 1
      } else if (op.t === '-') {
        if (oldStart < 0) oldStart = oldNo
        oldCount += 1
        lines.push({ kind: '-', text: op.text, oldNo: oldNo + 1, newNo: null })
        oldNo += 1
      } else {
        newLines.push(op.text)
        lines.push({ kind: '+', text: op.text, oldNo: null, newNo: newNo + 1 })
        newNo += 1
      }
    }
    if (oldStart < 0) oldStart = oldNo
    const id = sha(`${oldStart}|${oldCount}|${newLines.join('\n')}`).slice(0, 12)
    hunks.push({
      id,
      oldStart,
      oldCount,
      newLines,
      header: `第 ${oldStart + 1} 行${oldCount ? ` 起 ${oldCount} 行` : ' 插入'}`,
      lines,
    })
  }
  return hunks
}

function diffHunks(oldText, newText, context = 3) {
  const a = textLines(oldText)
  const b = textLines(newText)
  if (a.length > MAX_DIFF_LINES || b.length > MAX_DIFF_LINES) {
    const id = sha(`all|${a.length}|${newText}`).slice(0, 12)
    return [{
      id,
      oldStart: 0,
      oldCount: a.length,
      newLines: b,
      header: '整篇替换（内容过长，未做逐行比较）',
      lines: b.map((text, i) => ({ kind: i < a.length ? '-' : '+', text, oldNo: i < a.length ? i + 1 : null, newNo: i < a.length ? null : i + 1 })),
    }]
  }
  return hunksFromOps(diffOps(a, b), context)
}

function applySelectedHunks(text, hunks, selectedIds) {
  const selected = new Set(selectedIds)
  const picked = hunks.filter((h) => selected.has(h.id))
  if (picked.length === 0) throw new Error('没有选择任何变更段')
  const lines = textLines(text)
  picked
    .slice()
    .sort((x, y) => y.oldStart - x.oldStart)
    .forEach((h) => {
      lines.splice(h.oldStart, h.oldCount, ...h.newLines)
    })
  return lines.join('\n')
}

/** --------------------------------------------------------------- store --- */

class MasterStore {
  constructor(ctx) {
    this.ctx = ctx
    this.roleCache = new Map()
  }

  root(cwd) {
    return path.join(cwd, '.dsh', 'master-prompts')
  }

  masterDir(cwd, masterId) {
    return path.join(this.root(cwd), masterId)
  }

  metaPath(dir) {
    return path.join(dir, 'meta.json')
  }

  promptPath(dir) {
    return path.join(dir, 'prompt.md')
  }

  versionPath(dir, version) {
    return path.join(dir, 'versions', `v${String(version).padStart(4, '0')}.md`)
  }

  proposalsDir(dir) {
    return path.join(dir, 'proposals')
  }

  remember(sessionId, role) {
    this.roleCache.set(sessionId, role)
  }

  forget(sessionId) {
    this.roleCache.delete(sessionId)
  }

  roleOf(sessionId) {
    if (this.roleCache.has(sessionId)) return this.roleCache.get(sessionId)
    const role = this.resolveRole(sessionId)
    if (role) this.roleCache.set(sessionId, role)
    return role
  }

  resolveRole(sessionId) {
    const session = this.ctx.sessions.get(sessionId)
    if (!session) return null
    let cwd = ''
    try {
      cwd = this.ctx.workingDirectory.get(session)
    } catch {
      cwd = ''
    }
    if (!cwd) return null
    const found = this.findMasterForChild(cwd, sessionId)
    if (found) {
      return {
        role: 'child',
        sessionId,
        masterId: found.masterId,
        cwd,
        snapshotVersion: found.child?.snapshotVersion ?? 0,
      }
    }
    if (this.masterInitialized(cwd, sessionId)) {
      return { role: 'main', sessionId, masterId: sessionId, cwd }
    }
    return null
  }

  masterInitialized(cwd, masterId) {
    return fs.existsSync(path.join(this.masterDir(cwd, masterId), 'meta.json'))
  }

  ensureMaster(sessionId, cwd) {
    const dir = this.masterDir(cwd, sessionId)
    this.ensureMasterDir(dir, sessionId)
    this.forget(sessionId)
  }

  findMasterForChild(cwd, childId) {
    const root = this.root(cwd)
    let entries = []
    try {
      entries = fs.readdirSync(root, { withFileTypes: true })
    } catch {
      return null
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const meta = readJson(path.join(root, entry.name, 'meta.json'), null)
      if (!meta || !Array.isArray(meta.children)) continue
      const child = meta.children.find((c) => c.sessionId === childId)
      if (child) return { masterId: entry.name, meta, child }
    }
    return null
  }

  baseMeta(masterId) {
    return {
      format: 1,
      masterSessionId: masterId,
      title: '主对话总要求',
      createdAt: now(),
      updatedAt: now(),
      currentVersion: 0,
      sha: '',
      versions: [],
      children: [],
    }
  }

  loadMeta(dir) {
    const meta = readJson(this.metaPath(dir), null)
    if (!meta || typeof meta !== 'object') return null
    if (!Array.isArray(meta.versions)) meta.versions = []
    if (!Array.isArray(meta.children)) meta.children = []
    if (typeof meta.currentVersion !== 'number') meta.currentVersion = 0
    return meta
  }

  writeMeta(dir, meta) {
    writeJson(this.metaPath(dir), meta)
  }

  ensureMasterDir(dir, masterId) {
    fs.mkdirSync(dir, { recursive: true })
    const promptFile = this.promptPath(dir)
    let meta = this.loadMeta(dir)
    if (!meta) {
      meta = this.baseMeta(masterId)
      let text = ''
      if (fs.existsSync(promptFile)) text = fs.readFileSync(promptFile, 'utf8')
      if (text) {
        const version = 1
        writeAtomic(this.versionPath(dir, version), text)
        meta.currentVersion = version
        meta.sha = sha(text)
        meta.versions.push({
          id: version,
          time: now(),
          source: 'recovered',
          summary: '从已有 prompt.md 恢复',
          lines: textLines(text).length,
        })
      }
      if (!fs.existsSync(promptFile)) writeAtomic(promptFile, '')
      if (!text) meta.sha = sha('')
      this.writeMeta(dir, meta)
      return meta
    }
    if (!fs.existsSync(promptFile)) {
      const text = meta.currentVersion > 0 ? this.readVersionText(dir, meta.currentVersion) : ''
      writeAtomic(promptFile, text)
      meta.sha = sha(text)
      this.writeMeta(dir, meta)
    }
    return meta
  }

  appendVersion(dir, masterId, meta, text, source, summary) {
    const version = meta.currentVersion + 1
    writeAtomic(this.versionPath(dir, version), text)
    meta.versions.push({
      id: version,
      time: now(),
      source,
      summary: summary || '',
      lines: textLines(text).length,
    })
    meta.currentVersion = version
    meta.updatedAt = now()
    meta.sha = sha(text)
    writeAtomic(this.promptPath(dir), text)
    this.writeMeta(dir, meta)
    return meta
  }

  readMaster(masterId, cwd) {
    const dir = this.masterDir(cwd, masterId)
    let meta = this.ensureMasterDir(dir, masterId)
    const text = fs.readFileSync(this.promptPath(dir), 'utf8')
    const hash = sha(text)
    if (meta.sha !== hash) {
      meta = this.appendVersion(dir, masterId, meta, text, 'external', '检测到 prompt.md 被手动编辑')
    }
    return { dir, meta, text }
  }

  readVersionText(dir, version) {
    if (!version || version <= 0) return ''
    try {
      return fs.readFileSync(this.versionPath(dir, version), 'utf8')
    } catch {
      return ''
    }
  }

  listProposals(dir) {
    const folder = this.proposalsDir(dir)
    let names = []
    try {
      names = fs.readdirSync(folder)
    } catch {
      return []
    }
    return names
      .filter((name) => name.endsWith('.json'))
      .map((name) => readJson(path.join(folder, name), null))
      .filter(Boolean)
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
  }

  readProposal(dir, proposalId) {
    return readJson(path.join(this.proposalsDir(dir), `${proposalId}.json`), null)
  }

  writeProposal(dir, proposal) {
    writeJson(path.join(this.proposalsDir(dir), `${proposal.id}.json`), proposal)
  }

  savePrompt(masterId, cwd, text, source, summary) {
    if (typeof text !== 'string') throw new Error('prompt 必须是字符串')
    if (Buffer.byteLength(text, 'utf8') > MAX_PROMPT_BYTES) throw new Error('总要求超过 256KB，拒绝写入')
    const { dir, meta, text: current } = this.readMaster(masterId, cwd)
    if (text === current) {
      return { version: meta.currentVersion, tokens: tokenEstimate(text), changed: false }
    }
    const next = this.appendVersion(dir, masterId, meta, text, source, summary)
    return { version: next.currentVersion, tokens: tokenEstimate(text), changed: true }
  }

  mainState(role) {
    const { dir, meta, text } = this.readMaster(role.masterId, role.cwd)
    const currentVersion = meta.currentVersion
    const proposals = this.listProposals(dir)
      .filter((p) => p.status === 'pending')
      .map((p) => {
        const hunks = diffHunks(text, p.proposedText ?? '')
        return {
          id: p.id,
          childSessionId: p.childSessionId,
          childShortId: shortId(p.childSessionId),
          baseVersion: p.baseVersion,
          baseIsCurrent: p.baseVersion === currentVersion,
          summary: p.summary ?? '',
          rationale: p.rationale ?? '',
          createdAt: p.createdAt,
          hunks,
          noChanges: hunks.length === 0,
        }
      })
    return {
      role: 'main',
      masterSessionId: role.masterId,
      masterShortId: shortId(role.masterId),
      title: meta.title || '主对话总要求',
      currentVersion,
      prompt: text,
      tokens: tokenEstimate(text),
      lines: textLines(text).length,
      versions: meta.versions.map((v) => ({
        id: v.id,
        time: v.time,
        source: v.source,
        summary: v.summary,
        lines: v.lines,
      })),
      proposals,
      children: meta.children.map((c) => ({
        sessionId: c.sessionId,
        shortId: shortId(c.sessionId),
        createdAt: c.createdAt,
        snapshotVersion: c.snapshotVersion ?? 0,
        hasNewer: (c.snapshotVersion ?? 0) < currentVersion,
      })),
    }
  }

  childState(role) {
    const { dir, meta, text } = this.readMaster(role.masterId, role.cwd)
    const snapshot = this.readVersionText(dir, role.snapshotVersion)
    const pending = this.listProposals(dir).find(
      (p) => p.status === 'pending' && p.childSessionId === role.sessionId,
    )
    return {
      role: 'child',
      masterSessionId: role.masterId,
      masterShortId: shortId(role.masterId),
      masterTitle: meta.title || '主对话总要求',
      snapshotVersion: role.snapshotVersion,
      currentVersion: meta.currentVersion,
      hasNewer: role.snapshotVersion < meta.currentVersion,
      prompt: snapshot,
      tokens: tokenEstimate(snapshot),
      currentTokens: tokenEstimate(text),
      pending: pending
        ? { id: pending.id, summary: pending.summary ?? '', status: pending.status }
        : null,
    }
  }

  state(sessionId) {
    const role = this.resolveRole(sessionId)
    if (!role) {
      let cwd = ''
      const session = this.ctx.sessions.get(sessionId)
      if (session) {
        try {
          cwd = this.ctx.workingDirectory.get(session)
        } catch {
          cwd = ''
        }
      }
      return { role: 'none', suggestedMaster: cwd ? this.latestMaster(cwd) : null }
    }
    this.remember(sessionId, role)
    return role.role === 'main' ? this.mainState(role) : this.childState(role)
  }

  latestMaster(cwd) {
    const root = this.root(cwd)
    let best = null
    try {
      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const meta = readJson(path.join(root, entry.name, 'meta.json'), null)
        if (!meta) continue
        const updatedAt = typeof meta.updatedAt === 'number' ? meta.updatedAt : 0
        if (!best || updatedAt > best.updatedAt) {
          best = {
            sessionId: meta.masterSessionId ?? entry.name,
            title: meta.title ?? '主对话',
            version: meta.currentVersion ?? 0,
            updatedAt,
          }
        }
      }
    } catch {
      return null
    }
    return best
  }

  roleState(sessionId) {
    const role = this.resolveRole(sessionId)
    if (!role) return { role: 'none' }
    return {
      role: role.role,
      masterSessionId: role.masterId,
      snapshotVersion: role.snapshotVersion ?? 0,
    }
  }

  async createSubsession(masterId) {
    const role = this.resolveRole(masterId)
    if (role?.role === 'child') throw new Error('副对话不能再开副对话')
    const session = this.ctx.sessions.get(masterId)
    if (!session) throw new Error('当前会话不活跃')
    let cwd = ''
    try {
      cwd = this.ctx.workingDirectory.get(session)
    } catch {
      cwd = ''
    }
    if (!cwd) throw new Error('无法确定当前会话目录')
    const workspace = await this.ctx.workspaceRegistry.resolveByPath(cwd)
    if (!workspace) throw new Error('当前目录不在已注册的工作区中，无法创建会话')
    this.ensureMaster(masterId, cwd)
    const parentPreset = session.header.agentPreset
    const agentPreset = parentPreset && parentPreset !== PRESET_ID ? parentPreset : undefined
    const created = await this.ctx.sessionController.create(agentPreset
      ? { workspaceId: workspace.id, agentPreset }
      : { workspaceId: workspace.id })
    const { dir, meta } = this.readMaster(masterId, cwd)
    meta.children.push({
      sessionId: created.sessionId,
      createdAt: now(),
      snapshotVersion: meta.currentVersion,
    })
    meta.updatedAt = now()
    this.writeMeta(dir, meta)
    return { sessionId: created.sessionId, snapshotVersion: meta.currentVersion }
  }

  syncChild(childId) {
    const role = this.resolveRole(childId)
    if (!role || role.role !== 'child') throw new Error('不是副对话')
    const { dir, meta } = this.readMaster(role.masterId, role.cwd)
    const child = meta.children.find((c) => c.sessionId === childId)
    if (!child) throw new Error('找不到副对话映射')
    child.snapshotVersion = meta.currentVersion
    child.syncedAt = now()
    meta.updatedAt = now()
    this.writeMeta(dir, meta)
    const nextRole = { ...role, snapshotVersion: meta.currentVersion }
    this.remember(childId, nextRole)
    return { snapshotVersion: meta.currentVersion, currentVersion: meta.currentVersion }
  }

  async requestProposal(childId) {
    const role = this.resolveRole(childId)
    if (!role || role.role !== 'child') throw new Error('不是副对话')
    let agent = this.ctx.agents.get(childId)
    if (!agent) {
      const resolved = await this.ctx.sessionController.resolveAgent(childId)
      if (resolved.error) throw new Error(resolved.error.message || '无法恢复副对话')
      agent = resolved.agent
    }
    const instruction = [
      '【主对话 / 副对话】用户点击了「完成并提交」。请立即调用工具 master_prompt_submit_proposal 提交本次任务对总要求的变更：',
      '- summary：一句话说明本次任务对总要求的影响；',
      '- rationale：为什么总要求需要这样改；',
      '- proposedText：更新后的完整总要求文本，以你开始任务时的快照为基础，保留未改动部分；',
      '如果本次任务不需要改总要求，proposedText 传当前快照原文，summary 写「无变更」。',
      '不要直接修改总要求文件；提案由用户在主对话面板中审阅。',
    ].join('\n')
    await agent.followup({
      content: [{ type: 'text', text: instruction }],
      source: { kind: 'master-prompt' },
    })
    return { queued: true }
  }

  submitProposal(childId, args) {
    const role = this.resolveRole(childId)
    if (!role || role.role !== 'child') throw new Error('只有副对话可以提交提案')
    const summary = clamp(String(args.summary ?? ''), 400)
    const rationale = clamp(String(args.rationale ?? ''), 4000)
    const proposedText = String(args.proposedText ?? '')
    if (!summary) throw new Error('summary 不能为空')
    if (!proposedText) throw new Error('proposedText 不能为空')
    if (Buffer.byteLength(proposedText, 'utf8') > MAX_PROMPT_BYTES) {
      throw new Error('提案超过 256KB，拒绝提交')
    }
    const { dir } = this.readMaster(role.masterId, role.cwd)
    for (const old of this.listProposals(dir)) {
      if (old.status === 'pending' && old.childSessionId === childId) {
        old.status = 'superseded'
        old.updatedAt = now()
        this.writeProposal(dir, old)
      }
    }
    const id = `p-${now()}-${crypto.randomBytes(3).toString('hex')}`
    const proposal = {
      id,
      childSessionId: childId,
      baseVersion: role.snapshotVersion,
      summary,
      rationale,
      proposedText,
      status: 'pending',
      createdAt: now(),
      updatedAt: now(),
    }
    this.writeProposal(dir, proposal)
    return { proposalId: id, baseVersion: role.snapshotVersion }
  }

  applyProposal(masterId, proposalId, acceptedHunks) {
    const role = this.resolveRole(masterId)
    if (!role || role.role !== 'main') throw new Error('只有主对话可以合并提案')
    const { dir, meta, text } = this.readMaster(masterId, role.cwd)
    const proposal = this.readProposal(dir, proposalId)
    if (!proposal) throw new Error('提案不存在')
    if (proposal.status !== 'pending') throw new Error('提案不是待审状态')
    if (!Array.isArray(acceptedHunks) || acceptedHunks.length === 0) {
      throw new Error('没有选择任何变更段')
    }
    const hunks = diffHunks(text, proposal.proposedText ?? '')
    const known = new Set(hunks.map((h) => h.id))
    for (const id of acceptedHunks) {
      if (!known.has(id)) throw new Error('总要求已变化，所选差异已失效，请刷新后重试')
    }
    const result = applySelectedHunks(text, hunks, acceptedHunks)
    if (result === text) throw new Error('所选变更没有产生差异')
    const next = this.appendVersion(
      dir,
      masterId,
      meta,
      result,
      'proposal',
      `合并提案：${proposal.summary || proposal.id}`,
    )
    proposal.status = 'merged'
    proposal.mergedVersion = next.currentVersion
    proposal.updatedAt = now()
    this.writeProposal(dir, proposal)
    return { version: next.currentVersion, tokens: tokenEstimate(result) }
  }

  rejectProposal(masterId, proposalId) {
    const role = this.resolveRole(masterId)
    if (!role || role.role !== 'main') throw new Error('只有主对话可以处理提案')
    const { dir } = this.readMaster(masterId, role.cwd)
    const proposal = this.readProposal(dir, proposalId)
    if (!proposal) throw new Error('提案不存在')
    if (proposal.status !== 'pending') throw new Error('提案不是待审状态')
    proposal.status = 'rejected'
    proposal.updatedAt = now()
    this.writeProposal(dir, proposal)
    return { rejected: true }
  }

  rollback(masterId, version) {
    const role = this.resolveRole(masterId)
    if (!role || role.role !== 'main') throw new Error('只有主对话可以回滚')
    const { dir } = this.readMaster(masterId, role.cwd)
    const text = this.readVersionText(dir, version)
    if (!text) throw new Error(`版本 v${version} 不存在或为空`)
    return this.savePrompt(masterId, role.cwd, text, 'rollback', `回滚到 v${version}`)
  }

  versionText(masterId, version) {
    const role = this.resolveRole(masterId)
    if (!role || role.role !== 'main') throw new Error('只有主对话可以查看版本')
    const { dir } = this.readMaster(masterId, role.cwd)
    return { version, text: this.readVersionText(dir, version) }
  }

  promptText(sessionId) {
    let role = this.roleOf(sessionId)
    if (!role) return ''
    const { dir, meta, text } = this.readMaster(role.masterId, role.cwd)
    const version = role.role === 'main' ? meta.currentVersion : role.snapshotVersion
    const body = role.role === 'main' ? text : this.readVersionText(dir, role.snapshotVersion)
    const tokens = tokenEstimate(body)
    if (role.role === 'main') {
      return [
        `## ${MAIN_LABEL}`,
        '',
        '你是本工作区的「主对话」，负责维护项目的总要求。总要求是副对话执行任务时唯一的共享约束。',
        '',
        '- 用户在对话中提出或修改任何全局要求、约束、验收标准时，调用 master_prompt_update，传入「更新后的完整总要求文本」（保留未改动部分，不要只写增量）。没有变化时不要调用。',
        '- 副对话由用户点击界面的「+ 副对话」按钮创建，你不需要、也不能创建副对话。',
        '- 不要代替用户采纳副对话的提案；提案由用户在右侧面板中审阅。',
        '- 只在总要求确实变化时写入；不要把普通讨论、任务日志或一次性指令写进总要求。',
        '',
        `当前总要求（v${version}，约 ${tokens} tokens）：`,
        '--- 总要求开始 ---',
        body || '（空：还没有写入总要求）',
        '--- 总要求结束 ---',
      ].join('\n')
    }
    return [
      `## ${CHILD_LABEL}（主对话 ${shortId(role.masterId)} 的 v${role.snapshotVersion} 快照）`,
      '',
      '你是一个副对话，只负责当前任务。下面的总要求是本次任务必须遵守的共享约束；它是只读快照，不要在对话中修改它。',
      '',
      '- 用户可以在顶部点「同步」，把总要求切换为主对话的最新版本。',
      '- 任务完成后，用户会点「完成并提交」。收到该指令时，调用 master_prompt_submit_proposal，提交 summary、rationale 和 proposedText（更新后的完整总要求文本，保留未改动部分）。',
      '- 如果本次任务没有产生需要写回总要求的内容，proposedText 传当前快照原文，summary 写「无变更」。',
      '',
      `当前总要求快照（v${role.snapshotVersion}，约 ${tokens} tokens）：`,
      '--- 总要求开始 ---',
      body || '（空：主对话还没有写入总要求）',
      '--- 总要求结束 ---',
    ].join('\n')
  }
}

/** --------------------------------------------------------------- tools --- */

function textOutput(text) {
  return [{ type: 'text', text }]
}

function registerTools(ctx, store) {
  const update = ctx.tools.register({
    name: 'master_prompt_update',
    description:
      'Replace the master prompt of this main conversation with the complete updated text. Use whenever the user states or changes a global requirement, constraint, or acceptance criterion. Pass the whole prompt, preserving unchanged parts. Writes a new version immediately.',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The complete updated master prompt.',
        },
        summary: {
          type: 'string',
          description: 'One short line describing what changed.',
        },
      },
      required: ['text'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          version: { type: 'number' },
          tokens: { type: 'number' },
          changed: { type: 'boolean' },
        },
        required: ['version', 'tokens', 'changed'],
        additionalProperties: false,
      },
      render: (args, value) =>
        textOutput(`总要求已${value.changed ? '更新' : '保持'}为 v${value.version}（约 ${value.tokens} tokens）。`),
    },
    async execute(args, exec) {
      if (!exec.agent) throw new Error('缺少会话上下文')
      const role = store.resolveRole(exec.agent.id)
      if (!role || role.role !== 'main') throw new Error('master_prompt_update 只能由主对话调用')
      return store.savePrompt(
        role.masterId,
        role.cwd,
        String(args.text ?? ''),
        'agent',
        String(args.summary ?? '主对话更新'),
      )
    },
  }, {
    when: (context) => store.resolveRole(context.agent.id)?.role === 'main',
  })

  const propose = ctx.tools.register({
    name: 'master_prompt_submit_proposal',
    description:
      'Submit a proposed update to the master prompt after finishing a sub-conversation task. Provide a one-line summary, a rationale, and the complete updated master prompt text based on this sub-conversation snapshot. The master conversation user reviews it; it does not modify the master prompt directly.',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'One line: what this task changes in the master prompt.' },
        rationale: { type: 'string', description: 'Why the master prompt should change.' },
        proposedText: { type: 'string', description: 'The complete updated master prompt text.' },
      },
      required: ['summary', 'proposedText'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          proposalId: { type: 'string' },
          baseVersion: { type: 'number' },
        },
        required: ['proposalId', 'baseVersion'],
        additionalProperties: false,
      },
      render: (args, value) =>
        textOutput(`提案已提交（${value.proposalId}），基于总要求 v${value.baseVersion}。等待主对话面板审阅。`),
    },
    async execute(args, exec) {
      if (!exec.agent) throw new Error('缺少会话上下文')
      return store.submitProposal(exec.agent.id, args)
    },
  }, {
    when: (context) => store.resolveRole(context.agent.id)?.role === 'child',
  })

  ctx.effect(() => () => {
    update()
    propose()
  })
}

/** ---------------------------------------------------------------- prompt --- */

function registerPrompt(ctx, store) {
  const disposers = new Map()

  const setup = (agent) => {
    if (!agent || disposers.has(agent.id)) return
    const session = ctx.sessions.get(agent.id)
    if (!session) return
    const role = store.resolveRole(agent.id)
    if (role) store.remember(agent.id, role)
    try {
      const dispose = agent.ctx.systemPrompt.context({
        name: 'master-prompt',
        order: 900,
        interpolate: false,
        text: () => {
          try {
            return store.promptText(agent.id)
          } catch {
            return ''
          }
        },
      })
      disposers.set(agent.id, dispose)
      ctx.effect(() => () => {
        if (disposers.get(agent.id) === dispose) {
          disposers.delete(agent.id)
          dispose()
        }
      })
    } catch {
      // The agent context may lack systemPrompt in a stripped composition.
    }
  }

  ctx.on('agent/created', (payload) => setup(payload?.agent))

  ctx.on('agent/disposed', (payload) => {
    const agent = payload?.agent
    if (!agent) return
    const dispose = disposers.get(agent.id)
    if (dispose) {
      disposers.delete(agent.id)
      try {
        dispose()
      } catch {
        // already disposed
      }
    }
    store.forget(agent.id)
  })

  for (const agent of ctx.agents.list()) setup(agent)
}

/** ------------------------------------------------------------------ rpc --- */

function ok(value) {
  return { ok: true, value }
}

function fail(code, message) {
  return { ok: false, error: { code, message, details: {} } }
}

function registerRpc(ctx, store) {
  const connection = ctx.get('connection')
  if (!connection || !connection.fetch || typeof connection.fetch.register !== 'function') return

  const dispatch = async (endpoint, args) => {
    switch (endpoint) {
      case 'state':
        return store.state(String(args.sessionId ?? ''))
      case 'role':
        return store.roleState(String(args.sessionId ?? ''))
      case 'createSubsession':
        return store.createSubsession(String(args.masterSessionId ?? ''))
      case 'requestProposal':
        return store.requestProposal(String(args.childSessionId ?? ''))
      case 'syncChild':
        return store.syncChild(String(args.childSessionId ?? ''))
      case 'applyProposal':
        return store.applyProposal(
          String(args.masterSessionId ?? ''),
          String(args.proposalId ?? ''),
          Array.isArray(args.acceptedHunks) ? args.acceptedHunks.map(String) : [],
        )
      case 'rejectProposal':
        return store.rejectProposal(String(args.masterSessionId ?? ''), String(args.proposalId ?? ''))
      case 'savePrompt': {
        const role = store.resolveRole(String(args.masterSessionId ?? ''))
        if (!role || role.role !== 'main') throw new Error('只有主对话可以保存总要求')
        return store.savePrompt(role.masterId, role.cwd, String(args.text ?? ''), 'panel', '面板编辑')
      }
      case 'rollback':
        return store.rollback(String(args.masterSessionId ?? ''), Number(args.version ?? 0))
      case 'version':
        return store.versionText(String(args.masterSessionId ?? ''), Number(args.version ?? 0))
      default:
        throw new Error(`未知操作：${endpoint}`)
    }
  }

  const off = connection.fetch.register({
    path: '/api/master-prompt/rpc',
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      let body
      try {
        body = await request.json()
      } catch {
        return Response.json({
          ok: false,
          error: { code: 'master-prompt/bad-request', message: '请求体不是 JSON', details: {} },
        }, { status: 400 })
      }
      const endpoint = String(body?.endpoint ?? '')
      const args = body?.payload && typeof body.payload === 'object' ? body.payload : {}
      try {
        return Response.json({ ok: true, value: await dispatch(endpoint, args) })
      } catch (error) {
        return Response.json({
          ok: false,
          error: {
            code: 'master-prompt/failed',
            message: error instanceof Error ? error.message : String(error),
            details: {},
          },
        })
      }
    },
  })
  ctx.effect(() => () => {
    void off()
  })
}

/** ------------------------------------------------------------ commands --- */

function registerCommands(ctx, store) {
  const add = (definition) => {
    const off = ctx.commands.register(definition)
    ctx.effect(() => () => off())
  }

  add({
    name: 'master-new',
    description: '新建一个主对话并置顶（任意模式、任意工作区可用）',
    handler: async (invocation) => {
      try {
        const session = ctx.sessions.get(invocation.agent.id)
        if (!session) throw new Error('当前会话不活跃')
        const cwd = ctx.workingDirectory.get(session)
        const workspace = await ctx.workspaceRegistry.resolveByPath(cwd)
        const created = workspace
          ? await ctx.sessionController.create({ workspaceId: workspace.id })
          : await ctx.sessionController.create({ cwd })
        store.ensureMaster(created.sessionId, cwd)
        await ctx.workspaceRegistry.pinSession(created.sessionId)
        return {
          kind: 'success',
          text: `主对话已创建：${created.sessionId}\n已置顶到左侧会话列表。打开它，在输入框工具栏点「副对话」即可开第一个副对话。`,
        }
      } catch (error) {
        return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
      }
    },
  })

  add({
    name: 'master-child',
    description: '为当前会话开一个副对话（也可用输入框工具栏的「副对话」按钮）',
    handler: async (invocation) => {
      try {
        const role = store.resolveRole(invocation.agent.id)
        if (role?.role === 'child') {
          return { kind: 'error', text: '副对话不能再开副对话。' }
        }
        const result = await store.createSubsession(invocation.agent.id)
        return {
          kind: 'success',
          text: `副对话已创建：${result.sessionId}\n总要求快照 v${result.snapshotVersion}。请从右侧栏标签打开它。`,
        }
      } catch (error) {
        return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
      }
    },
  })

  add({
    name: 'master-sync',
    description: '把当前副对话同步到主对话的最新总要求',
    handler: (invocation) => {
      try {
        const role = store.resolveRole(invocation.agent.id)
        if (!role || role.role !== 'child') return { kind: 'error', text: '当前会话不是副对话。' }
        const result = store.syncChild(invocation.agent.id)
        return {
          kind: 'success',
          text: `已同步到主对话 v${result.currentVersion}（之前快照 v${result.snapshotVersion}）。`,
        }
      } catch (error) {
        return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
      }
    },
  })

  add({
    name: 'master-submit',
    description: '让当前副对话生成「总要求变更提案」（也可点副对话顶部的 完成并提交）',
    handler: async (invocation) => {
      try {
        const role = store.resolveRole(invocation.agent.id)
        if (!role || role.role !== 'child') return { kind: 'error', text: '当前会话不是副对话。' }
        await store.requestProposal(invocation.agent.id)
        return { kind: 'success', text: '已请求副对话生成提案；完成后在主对话的「面板 → 提案」里审阅。' }
      } catch (error) {
        return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
      }
    },
  })
}

/** ----------------------------------------------------------------- init --- */

export async function apply(ctx, _config) {
  const store = new MasterStore(ctx)
  registerTools(ctx, store)
  registerPrompt(ctx, store)
  registerRpc(ctx, store)
  registerCommands(ctx, store)
}

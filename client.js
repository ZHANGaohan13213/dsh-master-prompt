window.__ModuleLoader__.load({
  id: 'dsh-master-prompt',
  factory(require) {
    const React = require('react')
    const { useState, useEffect, useRef } = React
    const h = React.createElement

    const CHANNEL = '/master-prompt'
    const store = {
      open: false,
      masterId: null,
      sessionId: null,
      listeners: new Set(),
    }
    const roleCache = new Map()
    const CHILD_HOST = 'masterprompt'

    function shortSession(id) {
      return String(id ?? '').replace(/^session-/, '').slice(0, 8)
    }

    function childAddress(childId, masterId) {
      const query = new URLSearchParams({ parent: String(masterId) })
      return `dsh-resource://${CHILD_HOST}/session/${encodeURIComponent(String(childId))}?${query}`
    }

    function parseChildAddress(value) {
      let url
      try {
        url = new URL(value)
      } catch {
        return undefined
      }
      if (url.protocol !== 'dsh-resource:' || url.hostname.toLowerCase() !== CHILD_HOST) return undefined
      const parts = url.pathname.split('/').filter(Boolean)
      if (parts.length !== 2 || parts[0] !== 'session') return undefined
      const parent = url.searchParams.get('parent')
      if (!parent) return undefined
      try {
        return { parentSessionId: parent, childSessionId: decodeURIComponent(parts[1]) }
      } catch {
        return undefined
      }
    }

    function waitForAbort(signal) {
      if (signal.aborted) return Promise.resolve()
      return new Promise((resolve) => {
        signal.addEventListener('abort', resolve, { once: true })
      })
    }

    function notify() {
      for (const listener of store.listeners) {
        try {
          listener()
        } catch {
          /* a crashed listener must not break the others */
        }
      }
    }

    function useStore() {
      const [, force] = useState(0)
      useEffect(() => {
        const listener = () => force((value) => value + 1)
        store.listeners.add(listener)
        return () => {
          store.listeners.delete(listener)
        }
      }, [])
      return store
    }

    function fmtTokens(value) {
      const n = Number(value) || 0
      return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`
    }

    function fmtTime(value) {
      try {
        return new Date(value).toLocaleString('zh-CN', { hour12: false })
      } catch {
        return ''
      }
    }

    const ui = {
      bar: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        width: '100%',
        maxWidth: '860px',
        margin: '0 auto',
        padding: '2px 12px 8px',
        fontSize: '13px',
        color: 'var(--dsw-alias-label-secondary)',
        flexWrap: 'wrap',
      },
      spacer: { flex: 1 },
      pill: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        borderRadius: '999px',
        background: 'var(--dsw-alias-bg-layer-2)',
        border: '1px solid var(--dsw-alias-border-l1)',
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: '12px',
        whiteSpace: 'nowrap',
      },
      button: {
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        borderRadius: '6px',
        padding: '3px 10px',
        fontSize: '12px',
        lineHeight: 1.6,
        cursor: 'pointer',
      },
      primary: {
        border: '1px solid var(--dsw-alias-brand-primary)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
      },
      danger: {
        color: 'var(--dsw-alias-state-error-primary)',
        borderColor: 'var(--dsw-alias-state-error-primary)',
        background: 'transparent',
      },
      ghost: {
        background: 'transparent',
        borderColor: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
      },
      error: {
        color: 'var(--dsw-alias-state-error-primary)',
        fontSize: '12px',
        padding: '4px 12px',
      },
      drawer: {
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 'min(460px, 94vw)',
        background: 'var(--dsw-alias-bg-overlay)',
        borderLeft: '1px solid var(--dsw-alias-border-l1)',
        boxShadow: '-12px 0 32px rgba(0, 0, 0, 0.18)',
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
        pointerEvents: 'auto',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: '13px',
      },
      drawerHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '12px 14px',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
      },
      drawerTitle: { fontWeight: 600, fontSize: '14px' },
      drawerSub: { color: 'var(--dsw-alias-label-secondary)', fontSize: '12px' },
      tabs: {
        display: 'flex',
        gap: '4px',
        padding: '8px 12px',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
        flexWrap: 'wrap',
      },
      tab: {
        border: '1px solid transparent',
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
        borderRadius: '6px',
        padding: '4px 10px',
        fontSize: '12px',
        cursor: 'pointer',
      },
      tabActive: {
        background: 'var(--dsw-alias-bg-layer-2)',
        borderColor: 'var(--dsw-alias-border-l1)',
        color: 'var(--dsw-alias-label-primary)',
      },
      body: { flex: 1, overflow: 'auto', padding: '12px 14px 24px' },
      section: { marginBottom: '18px' },
      sectionTitle: { fontWeight: 600, fontSize: '13px', marginBottom: '8px' },
      card: {
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: '8px',
        padding: '10px',
        marginBottom: '10px',
        background: 'var(--dsw-alias-bg-layer-1)',
      },
      cardHead: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' },
      meta: { color: 'var(--dsw-alias-label-secondary)', fontSize: '12px' },
      warn: { color: 'var(--dsw-alias-state-warn-primary)', fontSize: '12px' },
      diff: {
        margin: '8px 0 0',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: '6px',
        overflow: 'hidden',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: '12px',
        lineHeight: 1.55,
      },
      hunkHead: {
        padding: '4px 8px',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: '11px',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
      },
      line: { display: 'flex', gap: '6px', padding: '0 8px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' },
      lineNo: { width: '28px', color: 'var(--dsw-alias-label-secondary)', textAlign: 'right', flex: '0 0 auto', opacity: 0.7 },
      textarea: {
        width: '100%',
        minHeight: '240px',
        boxSizing: 'border-box',
        resize: 'vertical',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: '8px',
        background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)',
        padding: '10px',
        fontSize: '13px',
        lineHeight: 1.6,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      },
      empty: { color: 'var(--dsw-alias-label-secondary)', fontSize: '12px', padding: '12px 0' },
      chip: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '1px 7px',
        borderRadius: '999px',
        border: '1px solid var(--dsw-alias-border-l1)',
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: '11px',
      },
      btnRow: { display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' },
      pre: {
        maxHeight: '260px',
        overflow: 'auto',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        background: 'var(--dsw-alias-bg-base)',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: '6px',
        padding: '8px',
        fontSize: '12px',
        margin: '8px 0 0',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      },
    }

    function Btn(props) {
      const style = { ...ui.button, ...(props.kind === 'primary' ? ui.primary : null), ...(props.kind === 'danger' ? ui.danger : null), ...(props.kind === 'ghost' ? ui.ghost : null) }
      return h('button', {
        type: 'button',
        style: { ...style, opacity: props.disabled ? 0.5 : 1, cursor: props.disabled ? 'default' : 'pointer' },
        onClick: props.disabled ? undefined : props.onClick,
        title: props.title,
      }, props.children)
    }

    function diffLineStyle(kind) {
      if (kind === '-') {
        return { background: 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent)' }
      }
      if (kind === '+') {
        return { background: 'color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent)' }
      }
      return null
    }

    function DiffHunk(props) {
      const hunk = props.hunk
      return h('div', { style: { borderTop: props.first ? 'none' : '1px solid var(--dsw-alias-border-l1)' } },
        h('div', { style: ui.hunkHead },
          h('input', {
            type: 'checkbox',
            checked: props.checked,
            onChange: (event) => props.onToggle(hunk.id, event.target.checked),
          }),
          h('span', null, hunk.header),
        ),
        hunk.lines.map((line, index) => h('div', {
          key: `${hunk.id}-${index}`,
          style: { ...ui.line, ...(diffLineStyle(line.kind) || {}) },
        },
          h('span', { style: ui.lineNo }, line.oldNo ?? ''),
          h('span', { style: ui.lineNo }, line.newNo ?? ''),
          h('span', { style: { flex: 1 } }, `${line.kind}${line.text}`),
        )),
      )
    }

    function App(ctx) {
      const ctxRef = { current: ctx }
      const getConn = () => {
        try {
          return ctxRef.current.get('connection') ?? ctxRef.current.connection
        } catch {
          return undefined
        }
      }
      const call = async (endpoint, payload) => {
        const response = await fetch('/api/master-prompt/rpc', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint, payload }),
        })
        let result = null
        try {
          result = await response.json()
        } catch {
          result = null
        }
        if (!response.ok || !result || result.ok !== true) {
          throw new Error(result?.error?.message || `请求失败（HTTP ${response.status}）`)
        }
        return result.value
      }
      const openSession = (sessionId) => {
        try {
          const workspace = ctxRef.current.uiWorkspace
            ?? ctxRef.current.get('uiWorkspace')
          if (workspace && typeof workspace.openSession === 'function') {
            workspace.openSession(sessionId)
            return true
          }
        } catch {
          /* ignore */
        }
        return false
      }
      const openChildTab = (childId, masterId) => {
        try {
          const right = ctxRef.current.sidebarRight ?? ctxRef.current.get('sidebarRight')
          if (!right || typeof right.openResource !== 'function') return false
          right.openResource(childAddress(childId, masterId))
          return true
        } catch {
          return false
        }
      }

      function Bar(rawProps) {
        const props = rawProps ?? {}
        const sessionId = props.session?.sessionId ?? props.sessionId
        const running = Boolean(props.session?.running)
        const [state, setState] = useState(null)
        const [error, setError] = useState('')
        const [busy, setBusy] = useState(false)
        const [requested, setRequested] = useState(false)

        const load = async () => {
          try {
            const next = await call('state', { sessionId })
            setState(next)
            setError('')
            if (next.role === 'main') {
              store.masterId = sessionId
            } else if (next.role === 'child') {
              store.masterId = next.masterSessionId
            }
            return next
          } catch (err) {
            setError(err.message || String(err))
            return null
          }
        }

        useEffect(() => {
          let alive = true
          if (store.sessionId !== sessionId) {
            store.sessionId = sessionId
            store.open = false
            notify()
          }
          load()
          const timer = setInterval(() => {
            if (alive) load()
          }, 4000)
          return () => {
            alive = false
            clearInterval(timer)
          }
        }, [sessionId])

        useEffect(() => {
          if (requested && state?.role === 'child' && state.pending) setRequested(false)
        }, [requested, state])

        if (!sessionId) {
          return h('div', { style: { width: '100%' } },
            h('div', { style: ui.bar },
              h('span', {
                style: {
                  ...ui.pill,
                  color: 'var(--dsw-alias-state-error-primary)',
                  borderColor: 'var(--dsw-alias-state-error-primary)',
                },
              }, '主对话 / 副对话：缺少会话标识'),
            ),
          )
        }

        if (!state) {
          if (!error) {
            return h('div', { style: { width: '100%' } },
              h('div', { style: ui.bar },
                h('span', { style: ui.pill }, '主对话 / 副对话…'),
              ),
            )
          }
          return h('div', { style: { width: '100%' } },
            h('div', { style: ui.bar },
              h('span', {
                style: {
                  ...ui.pill,
                  color: 'var(--dsw-alias-state-error-primary)',
                  borderColor: 'var(--dsw-alias-state-error-primary)',
                },
              }, `主对话 / 副对话：${error}`),
            ),
          )
        }
        if (state.role === 'none') return null
        const isMain = state.role === 'main'

        const createChild = async () => {
          setBusy(true)
          setError('')
          try {
            const result = await call('createSubsession', { masterSessionId: sessionId })
            if (!openChildTab(result.sessionId, sessionId)) {
              setError(`副对话已创建（${String(result.sessionId).slice(0, 16)}），但右栏打开失败`)
            }
            await load()
          } catch (err) {
            setError(err.message || String(err))
          } finally {
            setBusy(false)
          }
        }

        const openPanel = () => {
          store.open = true
          store.masterId = isMain ? sessionId : state.masterSessionId
          store.sessionId = sessionId
          notify()
        }

        const sync = async () => {
          setBusy(true)
          setError('')
          try {
            await call('syncChild', { childSessionId: sessionId })
            await load()
          } catch (err) {
            setError(err.message || String(err))
          } finally {
            setBusy(false)
          }
        }

        const submit = async () => {
          setBusy(true)
          setError('')
          try {
            await call('requestProposal', { childSessionId: sessionId })
            setRequested(true)
          } catch (err) {
            setError(err.message || String(err))
          } finally {
            setBusy(false)
          }
        }

        return h('div', { style: { width: '100%' } },
          h('div', { style: ui.bar },
            isMain
              ? h('span', { style: ui.pill }, `总要求 v${state.currentVersion}`)
              : h('span', { style: ui.pill }, `快照 v${state.snapshotVersion} · 主对话 ${state.masterShortId}`),
            h('span', { style: ui.pill }, `≈${fmtTokens(isMain ? state.tokens : state.tokens)} tokens`),
            isMain
              ? h('span', { style: ui.pill }, `提案 ${state.proposals.length}`)
              : state.hasNewer
                ? h('span', { style: { ...ui.pill, color: 'var(--dsw-alias-state-warn-primary)', borderColor: 'var(--dsw-alias-state-warn-primary)' } }, `可同步到 v${state.currentVersion}`)
                : h('span', { style: ui.pill }, '已是最新'),
            h('div', { style: ui.spacer }),
            error ? h('span', { style: ui.error }, error) : null,
            isMain
              ? h(Btn, { kind: 'primary', onClick: createChild, disabled: busy }, busy ? '创建中…' : '+ 副对话')
              : h(Btn, {
                  kind: 'primary',
                  onClick: submit,
                  disabled: busy || running,
                  title: running ? '副对话正在运行，结束后再提交' : '让副对话生成变更提案',
                }, requested ? '已请求…' : '完成并提交'),
            !isMain && state.hasNewer
              ? h(Btn, { onClick: sync, disabled: busy || running }, '同步')
              : null,
            h(Btn, {
              onClick: isMain
                ? openPanel
                : () => {
                    if (!openSession(state.masterSessionId)) {
                      setError(`请从左侧打开主对话 ${state.masterShortId}`)
                    }
                  },
            }, isMain ? '面板' : '回主对话'),
          ),
        )
      }

      function FixedChatConversationView(props) {
        return h(React.Fragment, null, props.renderSlot('conversation.session', { view: 'chat' }))
      }

      function ChildConversationPanel(props) {
        const {
          sessionId, useSession, useConversation, useSessions, renderFactorySlot,
        } = props
        const session = useSession((value) => value)
        const shellPhase = useConversation((value) => value).activeTargets.size > 0
          || (!session.blank && !session.awaitingFirstTurn)
          || session.running
          ? 'active'
          : session.promptAttempted ? 'engaging' : 'blank'
        const summaryBlank = useSessions((state) => state.byId[sessionId]?.blank)
        const settling = shellPhase === 'blank' && session.openState === 'loading' && summaryBlank !== true
        const hero = shellPhase === 'blank' && (session.openState === 'open' || summaryBlank === true)
        return renderFactorySlot('conversation.content', {
          variant: 'embedded',
          phase: settling ? 'settling' : hero ? 'hero' : 'active',
          hero,
        }, { slots: { views: FixedChatConversationView } })
      }

      function ChildChatBody(props) {
        const { tab } = props.useTabInfo()
        const resource = props.useResource(tab.contentId)
        const parsed = parseChildAddress(tab.contentId)
        const childId = parsed?.childSessionId
        const [busy, setBusy] = useState(false)
        const [message, setMessage] = useState('')

        const submit = async () => {
          if (!childId) return
          setBusy(true)
          setMessage('')
          try {
            await call('requestProposal', { childSessionId: childId })
            setMessage('已请求提案，完成后在主对话面板审阅')
          } catch (err) {
            setMessage(err.message || String(err))
          } finally {
            setBusy(false)
          }
        }

        return h('div', {
          style: {
            height: '100%',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
          },
        },
          h('div', {
            style: {
              ...ui.bar,
              maxWidth: 'none',
              margin: 0,
              padding: '6px 10px',
              borderBottom: '1px solid var(--dsw-alias-border-l1)',
              flexWrap: 'nowrap',
            },
          },
            h('span', { style: ui.pill }, `副对话 ${shortSession(childId)}`),
            h('div', { style: ui.spacer }),
            message ? h('span', { style: ui.meta }, message) : null,
            h(Btn, {
              kind: 'primary',
              onClick: submit,
              disabled: busy || !childId,
            }, busy ? '提交中…' : '完成并提交'),
          ),
          h('div', { style: { flex: 1, minHeight: 0 } },
            resource.value === undefined
              ? h('div', { style: ui.empty }, '加载副对话…')
              : h(props.SessionProvider, {
                  session: resource.value.reference,
                }, props.renderSlot('masterprompt.chat', {})),
          ),
        )
      }

      function MiniBar(rawProps) {
        const props = rawProps ?? {}
        const sessionId = props.session?.sessionId ?? props.sessionId
        const running = Boolean(props.session?.running)
        const [state, setState] = useState(null)
        const [error, setError] = useState('')
        const [busy, setBusy] = useState(false)
        const [requested, setRequested] = useState(false)

        const load = async () => {
          if (!sessionId) return
          try {
            const next = await call('state', { sessionId })
            setState(next)
            setError('')
          } catch (err) {
            setError(err.message || String(err))
          }
        }

        useEffect(() => {
          if (!sessionId) return undefined
          let alive = true
          load()
          const timer = setInterval(() => {
            if (alive) load()
          }, 4000)
          return () => {
            alive = false
            clearInterval(timer)
          }
        }, [sessionId])

        useEffect(() => {
          if (requested && state?.role === 'child' && state.pending) setRequested(false)
        }, [requested, state])

        const createChild = async () => {
          setBusy(true)
          setError('')
          try {
            const result = await call('createSubsession', { masterSessionId: sessionId })
            if (!openChildTab(result.sessionId, sessionId)) {
              setError('右栏打开失败')
            }
            await load()
          } catch (err) {
            setError(err.message || String(err))
          } finally {
            setBusy(false)
          }
        }

        const openPanel = () => {
          store.open = true
          store.masterId = sessionId
          store.sessionId = sessionId
          notify()
        }

        const submit = async () => {
          setBusy(true)
          setError('')
          try {
            await call('requestProposal', { childSessionId: sessionId })
            setRequested(true)
          } catch (err) {
            setError(err.message || String(err))
          } finally {
            setBusy(false)
          }
        }

        const sync = async () => {
          setBusy(true)
          setError('')
          try {
            await call('syncChild', { childSessionId: sessionId })
            await load()
          } catch (err) {
            setError(err.message || String(err))
          } finally {
            setBusy(false)
          }
        }

        const goMaster = () => {
          if (state?.masterSessionId) openSession(state.masterSessionId)
        }

        if (!sessionId) return null
        const role = state?.role ?? 'none'

        const mini = (label, onClick, options = {}) => h('button', {
          type: 'button',
          onClick,
          disabled: busy || options.disabled,
          title: options.title,
          style: {
            border: '1px solid var(--dsw-alias-border-l1)',
            background: 'transparent',
            color: options.primary
              ? 'var(--dsw-alias-brand-primary)'
              : 'var(--dsw-alias-label-secondary)',
            borderRadius: '5px',
            padding: '1px 7px',
            fontSize: '11px',
            lineHeight: '16px',
            cursor: busy || options.disabled ? 'default' : 'pointer',
            whiteSpace: 'nowrap',
            opacity: busy || options.disabled ? 0.55 : 1,
          },
        }, label)

        const buttons = []
        if (role === 'child') {
          buttons.push(mini(requested ? '已请求…' : '完成并提交', submit, {
            primary: true,
            disabled: running,
            title: running ? '副对话正在运行，结束后再提交' : '生成总要求变更提案',
          }))
          if (state.hasNewer) buttons.push(mini('同步', sync, { title: '同步主对话最新总要求' }))
          buttons.push(mini('回主对话', goMaster, { title: '切回主对话' }))
        } else {
          buttons.push(mini('+ 副对话', createChild, { primary: true, title: '开一个副对话，在右栏打开' }))
          if (role === 'main') buttons.push(mini('面板', openPanel, { title: '提案 / 总要求 / 版本' }))
        }
        if (error) {
          buttons.push(h('span', {
            title: error,
            style: { color: 'var(--dsw-alias-state-error-primary)', fontSize: '11px' },
          }, '!'))
        }
        return h('span', {
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            flexWrap: 'nowrap',
          },
        }, buttons)
      }

      function SessionRowLeading(props = {}) {
        const sessionId = props.sessionId
        const [roleInfo, setRoleInfo] = useState(() => roleCache.get(sessionId) ?? null)

        useEffect(() => {
          let alive = true
          const cached = roleCache.get(sessionId)
          if (cached !== undefined) {
            setRoleInfo(cached)
            return undefined
          }
          call('role', { sessionId })
            .then((result) => {
              const info = result ?? { role: 'none' }
              roleCache.set(sessionId, info)
              if (alive) setRoleInfo(info)
            })
            .catch(() => {
              roleCache.set(sessionId, { role: 'none' })
              if (alive) setRoleInfo({ role: 'none' })
            })
          return () => {
            alive = false
          }
        }, [sessionId])

        if (!roleInfo || roleInfo.role !== 'child') return null
        return h('span', {
          style: {
            color: 'var(--dsw-alias-label-secondary)',
            fontSize: '11px',
            opacity: 0.8,
            lineHeight: 1,
          },
        }, '└')
      }

      function SessionRowAction(rawProps) {
        const props = rawProps ?? {}
        const sessionId = props.sessionId
        const [roleInfo, setRoleInfo] = useState(() => roleCache.get(sessionId) ?? null)
        const [busy, setBusy] = useState(false)

        useEffect(() => {
          let alive = true
          const cached = roleCache.get(sessionId)
          if (cached !== undefined) {
            setRoleInfo(cached)
            return undefined
          }
          call('role', { sessionId })
            .then((result) => {
              const info = result ?? { role: 'none' }
              roleCache.set(sessionId, info)
              if (alive) setRoleInfo(info)
            })
            .catch(() => {
              roleCache.set(sessionId, { role: 'none' })
              if (alive) setRoleInfo({ role: 'none' })
            })
          return () => {
            alive = false
          }
        }, [sessionId])

        if (!roleInfo || roleInfo.role === 'none') return null
        const isMain = roleInfo.role === 'main'

        const openRight = (childId, masterId) => {
          if (store.sessionId === masterId) {
            if (!openChildTab(childId, masterId)) {
              window.alert('无法在主对话右栏打开副对话')
            }
            return
          }
          openSession(masterId)
          window.setTimeout(() => {
            try {
              openChildTab(childId, masterId)
            } catch {
              /* ignore */
            }
          }, 450)
        }

        const create = async () => {
          setBusy(true)
          try {
            const result = await call('createSubsession', { masterSessionId: sessionId })
            openRight(result.sessionId, sessionId)
          } catch (err) {
            window.alert(err.message || String(err))
          } finally {
            setBusy(false)
          }
        }

        const openChild = () => {
          openRight(sessionId, roleInfo.masterSessionId)
        }

        return h('button', {
          type: 'button',
          title: isMain ? '开副对话' : '在主对话右栏打开',
          disabled: busy,
          onClick: isMain ? create : openChild,
          style: {
            border: 'none',
            background: 'transparent',
            color: 'var(--dsw-alias-label-secondary)',
            cursor: busy ? 'default' : 'pointer',
            fontSize: '14px',
            lineHeight: 1,
            padding: '0 4px',
          },
        }, busy ? '…' : isMain ? '+' : '↗')
      }

      function Panel() {
        const view = useStore()
        const [tab, setTab] = useState('proposals')
        const [state, setState] = useState(null)
        const [error, setError] = useState('')
        const [message, setMessage] = useState('')
        const [busy, setBusy] = useState(false)
        const [draft, setDraft] = useState('')
        const [dirty, setDirty] = useState(false)
        const [selected, setSelected] = useState({})
        const [viewing, setViewing] = useState(null)

        const masterId = view.masterId

        const load = async () => {
          if (!masterId) return
          try {
            const next = await call('state', { sessionId: masterId })
            setState(next)
            setError('')
            if (!dirty && next.role === 'main') setDraft(next.prompt)
          } catch (err) {
            setError(err.message || String(err))
          }
        }

        useEffect(() => {
          if (!view.open || !masterId) {
            setState(null)
            return undefined
          }
          let alive = true
          load()
          const timer = setInterval(() => {
            if (alive) load()
          }, 2500)
          return () => {
            alive = false
            clearInterval(timer)
          }
        }, [view.open, masterId, dirty])

        if (!view.open) return null

        const close = () => {
          store.open = false
          notify()
        }

        const apply = async (proposal) => {
          const chosen = proposal.hunks
            .filter((hunk) => selected[proposal.id]?.[hunk.id] !== false)
            .map((hunk) => hunk.id)
          if (chosen.length === 0) {
            setError('请至少勾选一段变更')
            return
          }
          setBusy(true)
          setError('')
          try {
            const result = await call('applyProposal', {
              masterSessionId: masterId,
              proposalId: proposal.id,
              acceptedHunks: chosen,
            })
            setMessage(`已合并为 v${result.version}`)
            setSelected((current) => {
              const next = { ...current }
              delete next[proposal.id]
              return next
            })
            await load()
          } catch (err) {
            setError(err.message || String(err))
          } finally {
            setBusy(false)
          }
        }

        const reject = async (proposal) => {
          setBusy(true)
          setError('')
          try {
            await call('rejectProposal', { masterSessionId: masterId, proposalId: proposal.id })
            setMessage('提案已拒绝')
            await load()
          } catch (err) {
            setError(err.message || String(err))
          } finally {
            setBusy(false)
          }
        }

        const save = async () => {
          setBusy(true)
          setError('')
          try {
            const result = await call('savePrompt', { masterSessionId: masterId, text: draft })
            setMessage(`已保存为 v${result.version}`)
            setDirty(false)
            await load()
          } catch (err) {
            setError(err.message || String(err))
          } finally {
            setBusy(false)
          }
        }

        const rollback = async (version) => {
          if (!window.confirm(`回滚到 v${version}？会生成一个新版本，历史保留。`)) return
          setBusy(true)
          setError('')
          try {
            const result = await call('rollback', { masterSessionId: masterId, version })
            setMessage(`已回滚，新版本 v${result.version}`)
            setDirty(false)
            await load()
          } catch (err) {
            setError(err.message || String(err))
          } finally {
            setBusy(false)
          }
        }

        const showVersion = async (version) => {
          try {
            const result = await call('version', { masterSessionId: masterId, version })
            setViewing(result)
          } catch (err) {
            setError(err.message || String(err))
          }
        }

        const body = []
        if (!state) {
          body.push(h('div', { key: 'loading', style: ui.empty }, error || '加载中…'))
        } else if (state.role !== 'main') {
          body.push(h('div', { key: 'none', style: ui.empty }, '当前会话不是主对话。从主对话打开面板。'))
        } else if (tab === 'proposals') {
          body.push(h('div', { key: 'children', style: ui.section },
            h('div', { style: ui.sectionTitle }, `副对话 ${state.children.length} 个`),
            state.children.length === 0
              ? h('div', { style: ui.empty }, '还没有副对话。点上方「+ 副对话」创建。')
              : h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
                  state.children.map((child) =>
                    h('span', {
                      key: child.sessionId,
                      style: {
                        ...ui.chip,
                        ...(child.hasNewer
                          ? { color: 'var(--dsw-alias-state-warn-primary)', borderColor: 'var(--dsw-alias-state-warn-primary)' }
                          : null),
                      },
                    }, `${child.shortId} · v${child.snapshotVersion}${child.hasNewer ? ` → ${state.currentVersion}` : ''}`),
                  ),
                ),
          ))

          body.push(h('div', { key: 'proposals', style: ui.section },
            h('div', { style: ui.sectionTitle }, `待审提案 ${state.proposals.length} 个`),
            state.proposals.length === 0
              ? h('div', { style: ui.empty }, '没有待审提案。副对话点「完成并提交」后会出现在这里。')
              : state.proposals.map((proposal) =>
                  h('div', { key: proposal.id, style: ui.card },
                    h('div', { style: ui.cardHead },
                      h('span', { style: { fontWeight: 600 } }, proposal.summary || '（无摘要）'),
                      h('span', { style: ui.meta }, `副对话 ${proposal.childShortId}`),
                      h('span', { style: ui.meta }, `基于 v${proposal.baseVersion}`),
                      proposal.baseIsCurrent
                        ? null
                        : h('span', { style: ui.warn }, `已按当前 v${state.currentVersion} 重算差异`),
                    ),
                    proposal.rationale
                      ? h('div', { style: { ...ui.meta, marginTop: '4px' } }, proposal.rationale)
                      : null,
                    proposal.noChanges
                      ? h('div', { style: ui.empty }, '这条提案相对当前总要求没有差异。')
                      : h('div', { style: ui.diff },
                          proposal.hunks.map((hunk, index) =>
                            h(DiffHunk, {
                              key: hunk.id,
                              hunk,
                              first: index === 0,
                              checked: selected[proposal.id]?.[hunk.id] !== false,
                              onToggle: (id, value) =>
                                setSelected((current) => ({
                                  ...current,
                                  [proposal.id]: { ...(current[proposal.id] || {}), [id]: value },
                                })),
                            }),
                          ),
                        ),
                    h('div', { style: ui.btnRow },
                      h(Btn, { kind: 'primary', onClick: () => apply(proposal), disabled: busy || proposal.noChanges }, '应用选中段'),
                      h(Btn, { kind: 'danger', onClick: () => reject(proposal), disabled: busy }, '拒绝'),
                    ),
                  ),
                ),
          ))
        } else if (tab === 'prompt') {
          const text = draft
          const lines = text ? text.split('\n').length : 0
          const cjk = (text.match(/[\u3400-\u9fff]/g) || []).length
          const estimate = Math.max(0, Math.round(cjk + (text.length - cjk) / 4))
          body.push(h('div', { key: 'editor', style: ui.section },
            h('div', { style: ui.sectionTitle }, '总要求全文'),
            h('div', { style: { ...ui.meta, marginBottom: '6px' } },
              `v${state.currentVersion} · ${lines} 行 · 约 ${fmtTokens(estimate)} tokens${dirty ? ' · 有未保存修改' : ''}`,
            ),
            h('textarea', {
              style: ui.textarea,
              value: draft,
              onChange: (event) => {
                setDraft(event.target.value)
                setDirty(true)
              },
            }),
            h('div', { style: ui.btnRow },
              h(Btn, { kind: 'primary', onClick: save, disabled: busy || !dirty }, '保存为新版本'),
              h(Btn, {
                onClick: () => {
                  setDraft(state.prompt)
                  setDirty(false)
                },
                disabled: busy || !dirty,
              }, '放弃修改'),
            ),
            h('div', { style: { ...ui.meta, marginTop: '8px' } },
              '提示：直接编辑工作区里的 prompt.md 也会被识别为「手动编辑」版本。',
            ),
          ))
        } else {
          body.push(h('div', { key: 'versions', style: ui.section },
            h('div', { style: ui.sectionTitle }, `版本历史（${state.versions.length}）`),
            state.versions.length === 0
              ? h('div', { style: ui.empty }, '还没有版本。写入第一个总要求后会生成 v1。')
              : state.versions.slice().reverse().map((version) =>
                  h('div', { key: version.id, style: ui.card },
                    h('div', { style: ui.cardHead },
                      h('span', { style: { fontWeight: 600 } }, `v${version.id}`),
                      h('span', { style: ui.meta }, fmtTime(version.time)),
                      h('span', { style: ui.meta }, version.source),
                      h('span', { style: ui.meta }, `${version.lines} 行`),
                    ),
                    version.summary ? h('div', { style: { ...ui.meta, marginTop: '4px' } }, version.summary) : null,
                    h('div', { style: ui.btnRow },
                      h(Btn, { onClick: () => showVersion(version.id), disabled: busy }, '查看'),
                      h(Btn, { onClick: () => rollback(version.id), disabled: busy }, '回滚'),
                    ),
                    viewing && viewing.version === version.id
                      ? h('pre', { style: ui.pre }, viewing.text || '（空）')
                      : null,
                  ),
                ),
          ))
        }

        return h('div', { style: ui.drawer },
          h('div', { style: ui.drawerHeader },
            h('div', { style: { flex: 1 } },
              h('div', { style: ui.drawerTitle }, state ? `总要求 · v${state.currentVersion}` : '总要求'),
              h('div', { style: ui.drawerSub }, state ? `主对话 ${state.masterShortId} · 约 ${fmtTokens(state.tokens)} tokens` : '加载中…'),
            ),
            h(Btn, { kind: 'ghost', onClick: close }, '关闭'),
          ),
          h('div', { style: ui.tabs },
            h('button', {
              type: 'button',
              style: { ...ui.tab, ...(tab === 'proposals' ? ui.tabActive : null) },
              onClick: () => setTab('proposals'),
            }, '提案'),
            h('button', {
              type: 'button',
              style: { ...ui.tab, ...(tab === 'prompt' ? ui.tabActive : null) },
              onClick: () => setTab('prompt'),
            }, '总要求'),
            h('button', {
              type: 'button',
              style: { ...ui.tab, ...(tab === 'versions' ? ui.tabActive : null) },
              onClick: () => setTab('versions'),
            }, '版本'),
          ),
          error ? h('div', { style: ui.error }, error) : null,
          message ? h('div', { style: { ...ui.error, color: 'var(--dsw-alias-state-success-primary)' } }, message) : null,
          h('div', { style: ui.body }, body),
        )
      }

      class SlotBoundary extends React.Component {
        constructor(props) {
          super(props)
          this.state = { error: null }
        }

        static getDerivedStateFromError(error) {
          return { error }
        }

        componentDidCatch(error) {
          try {
            console.error('master-prompt slot error', error)
          } catch {
            /* ignore */
          }
        }

        render() {
          if (this.state.error) {
            return h('div', {
              style: {
                width: '100%',
                maxWidth: '860px',
                margin: '0 auto',
                padding: '4px 12px',
                color: 'var(--dsw-alias-state-error-primary)',
                fontSize: '12px',
              },
            }, `主对话 / 副对话组件错误：${String(this.state.error?.message ?? this.state.error)}`)
          }
          return this.props.children
        }
      }

      function BarEntry(props) {
        return h(SlotBoundary, null, h(Bar, props ?? {}))
      }

      function PanelEntry(props) {
        return h(SlotBoundary, null, h(Panel, props ?? {}))
      }

      function RowEntry(props) {
        return h(SlotBoundary, null, h(SessionRowAction, props ?? {}))
      }

      function MiniBarEntry(props) {
        return h(SlotBoundary, null, h(MiniBar, props ?? {}))
      }

      function ChildChatEntry(props) {
        return h(SlotBoundary, null, h(ChildChatBody, props ?? {}))
      }

      function LeadingEntry(props) {
        return h(SlotBoundary, null, h(SessionRowLeading, props ?? {}))
      }

      return {
        Bar,
        BarEntry,
        MiniBar,
        MiniBarEntry,
        Panel,
        PanelEntry,
        SessionRowAction,
        RowEntry,
        ChildChatEntry,
        ChildConversationPanel,
        LeadingEntry,
        call,
      }
    }

    return {
      inject: ['slots', 'uiWorkspace', 'sidebarRight', 'sidebarRightTabs', 'resources', 'sessions'],
      apply(ctx) {
        const app = App(ctx)

        ctx.effect(() => ctx.resources.register({
          protocol: CHILD_HOST,
          async *open(address, { signal }) {
            const parsed = parseChildAddress(address)
            if (!parsed) throw new Error(`master-prompt: invalid child address ${address}`)
            const reference = ctx.sessions.retain(parsed.childSessionId, { source: 'sidebarChat', signal })
            try {
              yield { ok: true, value: { address: parsed, reference } }
              await waitForAbort(signal)
            } finally {
              reference.release()
            }
          },
        }), 'master-prompt: child chat resources')

        ctx.effect(() => ctx.sidebarRightTabs.register({
          id: 'dsh-master-prompt/child-chat',
          kind: 'masterprompt-child',
          patterns: [`dsh-resource://${CHILD_HOST}/**`],
          priority: 'builtin',
          multiple: true,
          keepMounted: true,
          canOpen: (address) => parseChildAddress(address) !== undefined,
          title: (address) => {
            const parsed = parseChildAddress(address)
            return parsed ? `副对话 ${shortSession(parsed.childSessionId)}` : '副对话'
          },
        }), 'master-prompt: child chat type')

        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: 'dsh-master-prompt/child-chat',
          children: { 'masterprompt.chat': { kind: 'single', scope: 'session' } },
        }, app.ChildChatEntry)), 'master-prompt: child chat body')

        ctx.effect(() => ctx.slots.inject('masterprompt.chat', () => ctx.slots.register({
          name: 'masterprompt.chat',
        }, app.ChildConversationPanel)), 'master-prompt: child chat conversation')

        ctx.slots.inject('conversation.input.right', () =>
          ctx.slots.register({
            name: 'conversation.input.right',
            id: 'master-prompt-mini',
            order: 10,
          }, app.MiniBarEntry),
        )

        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register({
            name: 'shell.overlay',
            id: 'master-prompt-panel',
            order: 80,
          }, app.PanelEntry),
        )
      },
    }
  },
})

# Publishing this plugin

## 1. Push the public GitHub repository

Target repository: `https://github.com/ZHANGaohan13213/dsh-master-prompt` (public).

```sh
cd D:\DeepSeekH\plugin-src\dsh-master-prompt-repo
git remote add origin https://github.com/ZHANGaohan13213/dsh-master-prompt.git
git push -u origin main --tags
```

After the push, add the `dsh-plugin` topic to the repository (required by the market listing).

With GitHub CLI:

```sh
gh repo create ZHANGaohan13213/dsh-master-prompt --public --source . --remote origin --push
gh repo edit ZHANGaohan13213/dsh-master-prompt --add-topic dsh-plugin
```

## 2. Submit to the DSH plugin market

The market reads `awesome-dsh-plugin/awesome-dsh-plugin`; listing is a pull request, not an upload.

1. Fork `awesome-dsh-plugin/awesome-dsh-plugin`.
2. Copy `market/ZHANGaohan13213__dsh-master-prompt.yml` into the fork at
   `data/plugins/ZHANGaohan13213__dsh-master-prompt.yml`.
3. Open a pull request against `main`.

With GitHub CLI:

```sh
gh repo fork awesome-dsh-plugin/awesome-dsh-plugin --clone=true
# inside the clone:
cp D:\DeepSeekH\plugin-src\dsh-master-prompt-repo\market\ZHANGaohan13213__dsh-master-prompt.yml data/plugins/
git add data/plugins/ZHANGaohan13213__dsh-master-prompt.yml
git commit -m "Add ZHANGaohan13213/dsh-master-prompt"
git push -u origin HEAD
gh pr create --repo awesome-dsh-plugin/awesome-dsh-plugin --title "Add ZHANGaohan13213/dsh-master-prompt" --body "Adds the dsh-master-prompt plugin."
```

## 3. Repository-age gate

The market requires the plugin repository to be at least **1 day old**. A pull request
opened earlier still works: the submission gate reports the age and re-runs later, so
the PR can stay open and qualify by itself.

## 4. What the entry contains

- `category: session`
- bilingual `description.en` / `description.zh`
- `icon` pointing at `assets/icon-180.png` on `main`

The plugin package itself declares `dsh.bundle` and no `private` flag, so the market
can install it from the Git repository.

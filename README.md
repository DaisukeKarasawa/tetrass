# Tetrass

**Animated contribution graph (“grass”)** as SVG for your GitHub profile README. The picture matches your profile **Overview** heatmap (same days, same activity levels); only a drop-style animation is added on top.

## Update SVGs with GitHub Actions

Add a workflow that runs this repo’s **composite action**, then commits the generated files (similar to [Platane/snk](https://github.com/Platane/snk)).

Replace `DaisukeKarasawa/tetrass` and `@main` with the repository and ref you want to pin.

```yaml
name: Generate Tetrass

on:
  workflow_dispatch:
  schedule:
    - cron: "0 2 * * *"

permissions:
  contents: write

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5

      - uses: DaisukeKarasawa/tetrass/action@main
        with:
          github_user_name: ${{ github.repository_owner }}
          outputs: |
            img/tetrass.svg
            img/tetrass-dark.svg?palette=github-dark

      - uses: stefanzweifel/git-auto-commit-action@04702edda442b2e678b25b537cec683a1493fcb9 # v7.1.0
        with:
          commit_message: "chore: update Tetrass SVG"
          file_pattern: "img/*.svg"
```

You do **not** need `npm ci` in this workflow. The action uses the job’s default `GITHUB_TOKEN` to read your public contribution calendar.

### Inputs

| Input | Required | Description |
|--------|----------|-------------|
| `github_user_name` | yes | GitHub username whose **public** contribution calendar is drawn (usually `${{ github.repository_owner }}`). |
| `outputs` | yes | One path per line, relative to the repo root. Add `?palette=github-dark` on a line for a dark-theme SVG (e.g. `img/tetrass-dark.svg?palette=github-dark`). |

## Embed in your profile README

Replace `YOUR_USER`, `YOUR_REPO`, and `main` with your account, profile repository name, and default branch:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/main/img/tetrass-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/main/img/tetrass.svg">
  <img alt="Contribution activity animation" src="https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/main/img/tetrass.svg">
</picture>
```

Light and dark are **two files**; the HTML above picks the right one for the visitor’s theme.

## Optional: generate on your own computer

If you **clone this repository** and want SVGs locally:

```bash
npm ci
npm run build
export GITHUB_TOKEN=ghp_...   # personal token with permission to read your user via the API
export GITHUB_LOGIN=yourname  # or GITHUB_REPOSITORY_OWNER
npm run generate:tetrass
```

By default this writes `img/tetrass.svg` and `img/tetrass-dark.svg`. To choose other paths, set `TETRASS_OUTPUTS` (same multiline format as the action’s `outputs`).

To try the generator **without** calling the API, use a built-in sample calendar:

```bash
TETRASS_USE_SAMPLE=1 npm run generate:tetrass
```

Run `npm test` after changing code.

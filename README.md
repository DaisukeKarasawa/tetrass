# Tetrass

Deterministic (no randomness) **animated GitHub contribution graph** (“grass”) as SVG for your profile README.

**Premise:** the static heatmap is the same as on your GitHub profile **Overview** — **53×7** visible cells, one square per day, **`contributionLevel` → four green intensities** (`0..4`) in the same positions. Animation is layered on that board only; it does not change which days are empty vs coloured or their levels.

Animation: the year is split into **nine vertical bands** — eight **`6×7`** blocks and one **`5×7`** block (left → right). Each band **drops from above** with internal day positions fixed; bands run **sequentially** so earlier weeks land before later ones. The discrete timeline is built by [`src/grass/scriptedDropPlanner.ts`](src/grass/scriptedDropPlanner.ts) (per-week-column falls merged in lockstep within each band). See [`AGENTS.md`](AGENTS.md) for board vs band-local coordinates (`row 1` = Sunday).

## Use from your profile repository (recommended, snk-style)

Add a workflow that calls this repo’s **composite action** (same idea as [Platane/snk](https://github.com/Platane/snk)): one step generates SVGs; another commits them.

Replace `DaisukeKarasawa/tetrass` and `@main` with this repository and the branch or tag you want to pin.

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

**Inputs**

| Input | Required | Description |
|--------|----------|-------------|
| `github_user_name` | yes | GitHub login whose public contribution calendar is used (strict week-grid correspondence). |
| `outputs` | yes | Multiline paths relative to the repo root. Append `?palette=github-dark` for the dark theme (snk-compatible naming). |

The action runs `node` on a bundled script; it does **not** require `npm ci` in the consumer workflow.

## README embed

Replace `YOUR_USER` and `YOUR_REPO` with your GitHub username and profile repo name:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/main/img/tetrass-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/main/img/tetrass.svg">
  <img alt="Tetrass contribution animation" src="https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/main/img/tetrass.svg">
</picture>
```

Use your default branch name in place of `main` if it differs.

## How it works

1. Fetches the contribution calendar from the GitHub GraphQL API (`contributionCount` + **`contributionLevel`**) — the same fields Overview uses. The composite action uses `GITHUB_TOKEN` (`github.token`) and fails fast if it is missing unless you enable sample/offline mode. Locally, provide `GITHUB_TOKEN` for real data, set `TETRASS_USE_SAMPLE=1` (or `TETRASS_OFFLINE=1`) for offline sample data, or set `TETRASS_ALLOW_UNAUTH_FALLBACK=1` (CLI only) to allow a sample fallback when an unauthenticated fetch fails.
2. Maps contributions to a GitHub-native weekly grid: **x = week index, y = weekday**, **53 visible weeks** (right-aligned when history is shorter), so the level board matches Overview placement.
3. Splits columns into **nine bands** `6+6+6+6+6+6+6+6+5` and builds a **fixed timeline** of discrete SMIL steps (no Tetris / line-clear simulation).
4. Renders **static SVG files** (not Canvas): each cell is a rounded rect; **light** and **dark** are **separate outputs** (use a `<picture>` / `prefers-color-scheme` embed as in this README), not a single file with `@media (prefers-color-scheme: dark)` inside the SVG.
5. Writes the SVG files you listed under `outputs`.

Compared to projects like [Platane/snk](https://github.com/Platane/snk) (Canvas demo + CSS-variable SVG + snake path), Tetrass focuses on **Overview-faithful levels and grid** and a **nine-band drop** animation only.

## Local generation (this repo / development)

```bash
npm ci
npm run build
export GITHUB_TOKEN=ghp_...   # required for real contribution data (recommended in CI)
export GITHUB_LOGIN=yourname  # or GITHUB_REPOSITORY_OWNER
npm run generate:tetrass
```

Default output paths are `img/tetrass.svg` and `img/tetrass-dark.svg`. Override with `TETRASS_OUTPUTS` (same multiline format as the action):

```bash
export TETRASS_OUTPUTS="./out/a.svg
./out/b.svg?palette=github-dark"
npm run generate:tetrass
```

Offline / CI without API:

```bash
TETRASS_USE_SAMPLE=1 npm run generate:tetrass
```

Sample/offline mode uses a deterministic calendar with varied `contributionLevel` values so the animation stays non-trivial.

### Tests

`npm test` covers mapping, nine-band splitting, palette sanitization, SMIL `fill` timelines, and a small integration check that the sample pipeline writes an SVG with the expected grid rect count and contribution colours.

CLI-only: if you intentionally run without `GITHUB_TOKEN` and want a deterministic sample when the public GraphQL request fails, set `TETRASS_ALLOW_UNAUTH_FALLBACK=1` (not recommended for workflows that should reflect real contributions).

## CodeRabbit review operations (for this repo)

This repository includes a Tetrass-specific CodeRabbit setup in [`.coderabbit.yaml`](.coderabbit.yaml)
focused on:

- Action contract integrity (`action/action.yml` <-> parser <-> workflow <-> README)
- Deterministic output (same input → same SVG) and safe output paths
- Noise reduction (generated SVG/bundle/dependency trees)

Recommended local loop:

```bash
mkdir -p .coderabbit
coderabbit --prompt-only -t uncommitted 2>&1 | tee .coderabbit/last-prompt-only.txt
```

Triage policy:

- Blocking: contract breaks, path traversal risk, invariant regressions, secret leaks
- Should-fix: docs/workflow drift, weak failure behavior
- Nit/style: defer unless explicitly promoted

Suggested pass limit: **2-3 loops max**. If the same finding repeats, refine policy text in
`.coderabbit.yaml` instead of continuing the loop.

### Warning to error escalation policy

Pre-merge checks start in `warning` mode to minimize rollout friction. Promote a specific check
to `error` only when all conditions are satisfied:

1. The check has produced stable, actionable results across recent PRs (no frequent false positives).
2. The team agrees the check should block merges.
3. The remediation path is clear and documented in README and/or code comments.

Current governance setting:

- `reviews.pre_merge_checks.override_requested_reviewers_only: true`

## Releasing the action

The composite action lives in [`action/action.yml`](action/action.yml) and runs [`action/index.mjs`](action/index.mjs), which is produced by `npm run build` (esbuild bundle). **Commit updated `action/index.mjs` whenever TypeScript sources under `src/` change**, so consumers pinning a tag always get a working bundle without building.

## Automated updates in this repository

See [`.github/workflows/generate-tetrass.yml`](.github/workflows/generate-tetrass.yml): verifies `npm run build`, runs `uses: ./action`, and commits updated `img/*.svg`.

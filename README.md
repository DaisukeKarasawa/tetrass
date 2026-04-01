# Tetrass

Deterministic (no randomness) Tetris-style animation for GitHub contribution “grass”, rendered as SVG for your profile README.

## How it works

1. Fetches your contribution calendar from the GitHub GraphQL API (or uses a deterministic sample when `TETRASS_USE_SAMPLE=1`).
2. Maps the last 200 days into a 10×20 playfield (bottom row left-to-right, then upward).
3. Builds a fixed replay: scripted line clears + a precomputed diversity segment + exact tetromino tiling of the grass mask (trimming single cells from the top if the mask is not tileable by tetrominoes).
4. Writes `img/tetrass.svg` and `img/tetrass-dark.svg`.

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

## Local generation

```bash
npm ci
npm run build
export GITHUB_TOKEN=ghp_...   # optional but recommended (higher API limits)
export GITHUB_LOGIN=yourname  # or GITHUB_REPOSITORY_OWNER
npm run generate:tetrass
```

Offline / CI without API:

```bash
TETRASS_USE_SAMPLE=1 npm run generate:tetrass
```

## Automated updates

See [`.github/workflows/generate-tetrass.yml`](.github/workflows/generate-tetrass.yml): scheduled and manual workflow that runs `npm ci`, `npm run build`, `npm run generate:tetrass`, and commits updated SVGs.

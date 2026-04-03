# AGENTS.md

## Repository purpose

This repository generates **deterministic animated SVGs** of a GitHub-style contribution graph from GitHub contribution data, and publishes them as:

- a CLI flow (`src/main.ts` -> `src/generateRunner.ts`)
- a composite GitHub Action (`action/action.yml` + generated `action/index.mjs`)

## Project layout (high signal)

- `src/domain/grass.ts`: grid size constants, level board types, nine-band column ranges
- `src/grass/groupDropPlanner.ts`: split level board into column groups + drop timeline
- `src/io/contributions.ts`: GitHub GraphQL fetch, `contributionLevel` mapping, sample data
- `src/renderer/svgRenderer.ts`: SMIL group-drop SVG (light/dark palettes)
- `src/generateRunner.ts`: orchestration, output path safety, writes
- `action/action.yml`: action interface
- `action/index.mjs`: generated bundle (not source of truth)
- `.github/workflows/**`: CI and release automation

## Build and test commands

- Install: `npm ci`
- Build TS + action bundle: `npm run build`
- Tests: `npm test`

## Review guidelines

Prioritize **P0/P1** regressions for correctness and safety.

### Strongly report (P0/P1)

1. **Contribution grid correctness**
   - `contributionLevel` → level `0..4` mapping or 53×7 placement wrong vs GitHub week grid.

2. **Nine-band split / animation order**
   - Column bands not `6×8 + 5`, or drop order not left-to-right sequential.

3. **Determinism**
   - Same calendar input must yield the same SVG string (modulo irrelevant whitespace if any).

4. **Action safety and integration**
   - `outputs` parsing / writing that can escape workspace or violate declared contract.
   - Inconsistencies between `action/action.yml` inputs and `src/resolveGenerateOptions.ts` / `src/action-entry.ts`.

5. **CI supply-chain reliability**
   - Missing PR-time validation for build/tests.
   - Changes that can allow stale `action/index.mjs` to merge.

### Deprioritize

- Pure style and formatting nits.
- Generated artifact formatting in `action/index.mjs`.
- `img/*.svg` textual differences without source-level regression.

## Generated artifacts policy

- `action/index.mjs` is generated from `src/action-entry.ts` and transitive `src/**`.
- Prefer reviewing source files first; use bundle diffs only to detect stale or missing regeneration.

## Evidence standard for review comments

For each issue, include:

1. violated invariant,
2. impacted file/function,
3. concrete failure mode (or minimal repro),
4. why existing tests/checks might miss it.

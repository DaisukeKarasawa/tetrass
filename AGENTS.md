# AGENTS.md

## Repository purpose

This repository generates deterministic Tetrass SVG animations from GitHub contribution data and publishes them as:
- a CLI flow (`src/main.ts` -> `src/generateRunner.ts`)
- a composite GitHub Action (`action/action.yml` + generated `action/index.mjs`)

## Project layout (high signal)

- `src/planner/**`: deterministic replay planning and tetromino tiling
- `src/simulator/**`: lock validity and replay simulation
- `src/domain/**`: board and tetromino primitives
- `src/io/**`: GitHub GraphQL fetch and board mapping
- `src/renderer/**`: animated SVG output
- `action/action.yml`: action interface
- `action/index.mjs`: generated bundle (not source of truth)
- `.github/workflows/**`: CI and release automation

## Build and test commands

- Install: `npm ci`
- Build TS + action bundle: `npm run build`
- Tests: `npm test`

## Review guidelines

In GitHub, prioritize only P0/P1 regressions for this repository.

### Strongly report (P0/P1)

1. Planner/simulator incompatibility
   - Any change where planner output can no longer pass `isValidLock` in replay order.
   - Any exact-cover solution that is not a legal lock sequence.

2. Coordinate and normalization mismatches
   - Candidate generation coordinates must match replay coordinates from `getCells(...)`.
   - Report if option-key cells and stored `PiecePlacement` can diverge.

3. Determinism and acceptance invariants
   - Same input should produce deterministic script and SVG structure.
   - `finalBoard` must match `grassTarget` (trimmed target when applicable).

4. Action safety and integration correctness
   - `outputs` parsing and writing that can escape workspace or violate declared contract.
   - Inconsistencies between `action/action.yml` inputs and `src/action-entry.ts` handling.

5. CI supply-chain reliability
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

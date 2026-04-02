# code_review.md

## Goal

Keep Codex review high-signal for this repository by prioritizing regressions that break:

1) contribution grid / level mapping correctness,
2) nine-band drop behavior and determinism,
3) action and CI reliability.

This document complements `AGENTS.md` and defines repo-specific review behavior.

## Severity policy for this repo

Because GitHub Codex review reports P0/P1, use this mapping:

- P0: Breaks core functionality or can produce unusable output/action behavior in normal use.
- P1: High-likelihood functional regression, contract break, or reliability gap likely to cause failures.

Do not report cosmetic or style-only findings unless they directly cause functional or security risk.

## Repo-specific critical boundaries

### A) Contribution ingest and 53×7 mapping (highest priority)

Files:

- `src/io/contributions.ts`
- `src/domain/grass.ts`

Review for:

- GraphQL field coverage (`contributionLevel`, `weekday`, `date`) and safe error handling,
- correct GitHub week grid semantics (x = week index, y = weekday),
- right-aligned 53-week viewport behavior.

Raise P0/P1 when:

- levels or dates land in wrong cells,
- empty vs non-empty classification diverges from GitHub for the same API payload.

### B) Nine-band split, schedule, and SVG output

Files:

- `src/grass/groupDropPlanner.ts`
- `src/renderer/svgRenderer.ts`
- `src/generateRunner.ts`

Review for:

- column bands `6+6+6+6+6+6+6+6+5` covering `0..52` exactly once,
- sequential left-to-right drop timing,
- final visible grass cells match the level board (no duplicates / drops),
- deterministic SVG for identical inputs,
- safe embedding of palette colors (no attribute injection).

### C) Action interface and output safety

Files:

- `action/action.yml`
- `src/action-entry.ts`
- `src/generateRunner.ts`

Review for:

- input/env mapping consistency,
- output path handling (workspace escape risk),
- palette/output parsing regressions.

### D) CI and release reliability

Files:

- `.github/workflows/*.yml`
- `package.json`

Review for:

- PR-time build/test coverage,
- bundle freshness checks for `action/index.mjs`,
- workflow permissions scope and write behavior.

## Generated artifacts handling

- `action/index.mjs` is generated. Review source (`src/**`) first.
- `img/*.svg` should usually be treated as generated outputs.
- Report generated-file issues only when they reveal a source/CI process problem.

## What to strongly catch vs what to ignore

### Strongly catch

- Wrong `contributionLevel` mapping or broken 53×7 placement.
- Nine-band boundaries or drop ordering regressions.
- Action contract breaks (`inputs` and `outputs` behavior mismatch).
- CI gaps that allow stale bundle or untested merges.
- Path handling that can write outside intended workspace.

### Usually ignore

- Naming/style-only nits.
- Generated bundle formatting.
- Docs wording-only comments (unless security or behavior confusion risk).

## Review execution checklist

1. Read changed files and adjacent call sites.
2. Check impacted tests and note missing tests for changed invariants.
3. Verify CI/workflow implications for the changed subsystem.
4. If external policy or behavior is cited, confirm with at least one authoritative source.
5. Keep findings concise, actionable, and invariant-based.

## Comment format

Use this structure for each finding:

- Severity: P0 or P1
- Invariant broken:
- Where: file + function/lines
- Why it fails: concrete mechanism
- Impact: user-visible failure mode
- Suggested direction: minimal fix approach

## Assumptions and TBD

- Assumption: project history is currently limited (PR #1 is the only observed PR), so trend-based calibration is provisional.

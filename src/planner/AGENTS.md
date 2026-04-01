# src/planner/AGENTS.md

## Planner-specific review focus

This directory defines replay construction correctness, not just geometric cover.

### Must-hold invariants

1. Legal lock sequence invariant
   - Returned `ReplayStep[]` must be lock-valid in order on an evolving board.
   - Do not accept solutions that are exact covers but require floating locks.

2. Coordinate consistency invariant
   - If shape cells are normalized for candidate indexing, stored `PiecePlacement` must replay to the same absolute cells via `getCells(...)`.

3. Deterministic trimming invariant
   - Trimming behavior must remain deterministic and documented (current design: top-first).
   - Any policy change must be explicit in docs/tests.

4. Prefix contract invariant
   - Intro + diversity pad contracts must stay true (line clear + empty-board end + diversity intent).

### Review behavior

- Prefer correctness findings over micro-optimizations.
- Ask for/expect tests when changing:
  - tiling search order,
  - candidate generation,
  - trimming rules,
  - intro/diversity contracts.

---
name: tetrass-coderabbit-local-review
description: >-
  Run CodeRabbit --prompt-only on local diffs for Tetrass, triage findings with Action-contract and deterministic-invariant priorities, and close with minimal fixes via subagents when needed.
---

# Tetrass — CodeRabbit local review / fix loop

## Goal
Use `coderabbit --prompt-only` as a second-opinion reviewer for local diffs, then apply only high-signal fixes:
- Action contract integrity (`action/action.yml` ↔ parser ↔ workflow ↔ README)
- Deterministic invariants (53×7 `contributionLevel` mapping, nine-band drop order, SVG matches grass cell count)
- Path safety and token hygiene

## When to use
- After edits in `src/**`, `action/action.yml`, `.github/workflows/**`, or `README.md`
- Before opening or updating a PR

## When not to use
- Tiny typo-only docs changes
- User explicitly requests review-only with no fix loop

## Preconditions
- `coderabbit auth status` succeeds
- Working tree has changes

## Capture file
- `.coderabbit/last-prompt-only.txt`

```bash
mkdir -p .coderabbit
```

## Procedure (parent)

1. Choose diff scope
   - Default: `-t uncommitted`
   - Add `--base main` for branch-wide delta

2. Run CodeRabbit

```bash
coderabbit --prompt-only -t uncommitted 2>&1 | tee .coderabbit/last-prompt-only.txt
```

3. Triage (required)
   - Blocking: action contract breaks, path traversal risk, invariant regressions, secret leaks
   - Should-fix: docs drift, workflow wiring drift, weak error behavior
   - Nit/style: drop for this pass

4. Fix routing
   - Small change: parent patches directly
   - Multi-file or policy-heavy: delegate to `tetrass-coderabbit-fix-worker`

5. Loop bound
   - Cap total runs at 2–3
   - If findings repeat, stop and adjust `.coderabbit.yaml` policy text

## Worker packet template
- Triaged findings (Blocking/Should-fix only)
- Excerpt from `.coderabbit/last-prompt-only.txt`
- Allowed edit paths
- Forbidden paths
- Required verification commands

## Forbidden-by-default paths for fix workers
- `img/**/*.svg` (generated)
- `action/index.mjs` (generated bundle)
- `dist/**`, `node_modules/**`, secrets

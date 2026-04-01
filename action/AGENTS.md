# action/AGENTS.md

## Action packaging and safety rules

- `action/index.mjs` is generated output. Source of truth is `src/**`.
- Avoid hand-editing the bundle; prefer source edits and regeneration.

## Review priorities

1. Input contract consistency
   - `action/action.yml` inputs must match environment variables consumed by `src/action-entry.ts`.

2. Output path safety
   - Output paths are documented as repo-relative. Flag logic that can write outside workspace root.

3. Bundle freshness
   - If source behavior changes but bundle refresh or validation is missing, flag as reliability risk.

## Deprioritize

- Compiled formatting differences in `action/index.mjs` without source-level behavior changes.

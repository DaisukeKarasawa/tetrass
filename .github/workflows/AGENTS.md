# .github/workflows/AGENTS.md

## Workflow review priorities

This repository publishes generated assets and an action bundle. CI correctness is part of product correctness.

### Must-check items

1. PR validation coverage
   - Ensure PR-time validation exists for:
     - install (`npm ci`)
     - build (`npm run build`)
     - tests (`npm test`)
     - workflow YAML lint (`actionlint`)
     - composite-action smoke (`uses: ./action` with sample mode)

2. Bundle drift prevention
   - If `action/index.mjs` is tracked, ensure workflow detects stale bundle after build.

3. Principle of least privilege
   - Use minimal permissions per workflow job.
   - Separate write-capable scheduled jobs from read-only PR validation jobs when possible.

4. Deterministic generation
   - Workflow changes must not introduce unintentional non-deterministic output behavior.

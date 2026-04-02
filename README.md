# Whitebox

**Review / QA track:** one config file runs multiple **quality gates** (commands, file checks, regex proofs). Every run writes a **JSON verification report** you can archive, attach to CI, or diff across commits.

## Why this fits REVIEW + QA

- **Quality gates** — pass/fail thresholds as data (`whitebox.config.json`).
- **Verification artifacts** — machine-readable `whitebox-report.json` (evidence, not vibes).
- **CI** — GitHub Action runs the same gates as local dev (`.github/workflows/verify.yml`).

## Quick start

```bash
npm install
npm run verify
```

## Demo narrative (bad change → fail → fix)

1. Open `examples/todo-app/src/sum.ts` and change the return to something wrong (e.g. `a - b`).
2. Run `npm run verify` — the **example-suite** gate fails; the report JSON shows which gate and stderr tail.
3. Revert the change — **PASS**.

## CLI

```bash
npm run build
node dist/cli.js verify --config whitebox.config.json
node dist/cli.js verify --config examples/todo-app/whitebox.config.json -o /tmp/report.json
node dist/cli.js init --file whitebox.config.json
```

Exit code `0` only if every gate passes.

## Gate types

| `type`        | Fields | Behavior |
|---------------|--------|----------|
| `command`     | `run`, optional `cwd`, `timeoutMs` | Shell command must exit 0 |
| `fileExists`  | `path` (relative to config dir) | File must exist |
| `fileMatches` | `path`, `pattern`, optional `flags` | File contents must match regex |

## Project layout

- `src/` — verifier engine + CLI
- `examples/todo-app/` — tiny app whose tests are invoked as a gate from the root config
- `whitebox.config.json` — root gates for this repo

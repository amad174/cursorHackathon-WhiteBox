# Whitebox

**Review / QA track:** one config file runs multiple **quality gates** (commands, file checks, regex proofs). Every run writes a **JSON verification report** you can archive, attach to CI, or diff across commits.

**Beyond exit codes:** for `command` gates you can set **`jsonReportPath`** to a Vitest JSON report (`--reporter=json --outputFile=...`). Whitebox **parses** that file and attaches **which tests failed** to `whitebox-report.json`, prints them in the console, and (in GitHub Actions or with `--github`) emits **`::error file=...::`** workflow commands so failures show up on the PR like native CI.

## Why this fits REVIEW + QA

- **Quality gates** — pass/fail thresholds as data (`whitebox.config.json`).
- **Verification artifacts** — machine-readable `whitebox-report.json` with optional **structured test evidence** (`testEvidence`), not only stderr.
- **CI** — GitHub Action runs the same gates as local dev; **`GITHUB_ACTIONS=true`** turns on annotation output automatically (or set `WHITEBOX_GITHUB_ANNOTATIONS=1`, or pass `--github`).

## Quick start

```bash
npm install
npm run verify
```

Optional AI: copy `.env.example` to `.env`, set `OPENAI_API_KEY`, then run `node dist/cli.js review --root examples/todo-app --ai` (never commit `.env`).

## Demo narrative (bad change → fail → fix)

1. Open `examples/todo-app/src/sum.ts` and change the return to something wrong (e.g. `a - b`).
2. Run `npm run verify` — the **example-coverage** gate fails; output lists **failed test names** from `.vitest-result.json`, not only “exit 1”.
3. Revert the change — **PASS**.

## Export review (code → “is it tested?” → suggestions)

**`whitebox review --root <dir> [--fail]`** walks your `*.ts` sources (same rules as `audit`: skips `*.test.ts`, `*.config.ts`, etc.), uses the **TypeScript parser** to find **runtime exports** (functions, classes, `export const`, enums, named `export { x }`). For each file:

1. **No** `foo.test.ts` / `foo.spec.ts` next to `foo.ts` → it reports that those exports **need a test file** and suggests a Vitest shape (imports + `describe` / `it`).
2. A test file **exists** but the export name **never appears** in that test file (word-boundary match) → it says that export **is not being exercised in tests yet** and prints a **concrete suggestion** (example `describe` / `expect` pattern).

This is a **heuristic**: it does not prove correctness—only that the symbol shows up in the test file (import, call, `describe("sum")`, etc.). It’s meant to catch “we shipped API but tests don’t mention it.”

Included in **`npm run verify`** as the **`export-review`** gate.

### Optional: AI-assisted drafts (`--ai`)

Add **`--ai`** to **`review`** to call an **OpenAI-compatible** HTTP API (`/v1/chat/completions`) and attach **LLM-written test ideas** plus a **Vitest-shaped draft** for each issue (bounded by **`--ai-max`**, default 3). This is **off by default** in **`verify`** so CI doesn’t need keys or spend tokens.

**Environment:**

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | Required for `--ai` (otherwise you get a skip message). |
| `OPENAI_MODEL` | Optional; default `gpt-4o-mini`. |
| `OPENAI_BASE_URL` | Optional; default `https://api.openai.com/v1` (set for Azure/other OpenAI-compatible endpoints). |

**Example:**

```bash
export OPENAI_API_KEY="sk-..."   # do not commit
npm run build
node dist/cli.js review --root examples/todo-app --ai --ai-max 2
```

Treat model output as a **draft**—review and run tests before merging.

## “Enough tests?” (other heuristics)

- **Line coverage floor** — `whitebox coverage --file coverage/coverage-summary.json --min-lines 80` reads Istanbul **`coverage-summary.json`** (Vitest `json-summary`) and fails if the **line %** is below your threshold. That measures *exercise*, not correctness.
- **Sibling test files only** — `whitebox audit --root ./app --fail` fails if any source has **no** neighboring test file. Use **`review`** when you care that tests **reference** the exports.
- **Scaffolding** — `whitebox scaffold-tests --root ./app` prints paths where a test file could be added; add **`--write`** to emit minimal Vitest stubs (`it.todo` + “module loads”). You still write real assertions—the stubs only remove the “empty file” hurdle.

Template suggestions come from **`review`**; richer drafts come from **`review --ai`** when `OPENAI_API_KEY` is set. Always **review** model output before trusting it.

## Local dashboard (UI)

After **`npm run verify`** (or any run that writes `whitebox-report.json`), start the static UI:

```bash
npm run serve
```

Open **http://127.0.0.1:3847/** (Simple Browser in Cursor works). The page loads **`GET /api/report`**, falls back to **`GET /whitebox-report.json`**, then embedded mock data if the server is not running. **Run verify** / **Retest** call **`POST /api/run`** (same defaults as CLI: `whitebox.config.json` → `whitebox-report.json`). Optional: **`npm run mcp`** / **`node dist/cli.js mcp`** for Cursor MCP (see `.cursor/mcp.json`).

## CLI

```bash
npm run build
node dist/cli.js verify --config whitebox.config.json
node dist/cli.js verify --config whitebox.config.json --github
node dist/cli.js verify --config examples/todo-app/whitebox.config.json -o /tmp/report.json
node dist/cli.js init --file whitebox.config.json

node dist/cli.js review --root examples/todo-app
node dist/cli.js review --root examples/todo-app --fail
node dist/cli.js review --root examples/todo-app --ai --ai-max 2
node dist/cli.js audit --root examples/todo-app --fail
node dist/cli.js coverage --file examples/todo-app/coverage/coverage-summary.json --min-lines 70
node dist/cli.js scaffold-tests --root examples/todo-app
node dist/cli.js scaffold-tests --root examples/todo-app --write

npm run serve
# or: node dist/cli.js serve --port 3847
```

Exit code `0` only if every gate passes.

## Gate types

| `type`        | Fields | Behavior |
|---------------|--------|----------|
| `command`     | `run`, optional `cwd`, `timeoutMs`, **`jsonReportPath`** | Exit 0; optional Vitest JSON file (relative to `cwd`) for structured failures |
| `fileExists`  | `path` (relative to config dir) | File must exist |
| `fileMatches` | `path`, `pattern`, optional `flags` | File contents must match regex |

## Project layout

- `src/` — verifier engine + CLI
- `ui/index.html` — single-file dashboard for `VerifyReport` JSON
- `examples/todo-app/` — tiny sample (`sum`, `greet`) whose tests + coverage are checked from the root config
- `whitebox.config.json` — root gates for this repo

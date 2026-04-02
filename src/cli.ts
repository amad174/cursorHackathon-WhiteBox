#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import { auditMissingTests } from "./audit.js";
import { loadConfig } from "./config.js";
import { parseCoverageSummary, meetsLineThreshold } from "./coverage-check.js";
import { verify } from "./engine.js";
import { formatConsole, formatGithubWorkflowCommands, writeJsonReport } from "./report.js";
import { printAiSuggestionsForIssues } from "./ai-openai.js";
import { formatReviewReport, reviewExports } from "./review.js";
import { scaffoldTests } from "./scaffold-tests.js";

const program = new Command();

program.name("whitebox").description("Quality gates with verification artifacts").version("0.1.0");

program
  .command("verify")
  .description("Run all gates from a config file")
  .requiredOption("-c, --config <path>", "Path to whitebox.config.json")
  .option("-o, --out <path>", "Write JSON report (default: whitebox-report.json in cwd)")
  .option("-q, --quiet", "Only print summary line")
  .option("--github", "Emit GitHub Actions ::error:: annotations when gates fail")
  .action(async (opts: { config: string; out?: string; quiet?: boolean; github?: boolean }) => {
    const configPath = path.resolve(opts.config);
    const config = await loadConfig(configPath);
    const report = await verify(config, configPath);
    const out = opts.out ? path.resolve(opts.out) : path.resolve(process.cwd(), "whitebox-report.json");
    await writeJsonReport(report, out);
    const wantGithub =
      opts.github === true ||
      process.env.GITHUB_ACTIONS === "true" ||
      process.env.WHITEBOX_GITHUB_ANNOTATIONS === "1";
    if (wantGithub) {
      const gh = formatGithubWorkflowCommands(report);
      if (gh) process.stdout.write(gh);
    }
    if (opts.quiet) {
      process.stdout.write(`${report.ok ? "PASS" : "FAIL"} ${out}\n`);
    } else {
      process.stdout.write(`${formatConsole(report)}\n`);
      process.stdout.write(`JSON: ${out}\n`);
    }
    process.exitCode = report.ok ? 0 : 1;
  });

program
  .command("init")
  .description("Write a starter whitebox.config.json")
  .option("-f, --file <path>", "Output path", "whitebox.config.json")
  .action(async (opts: { file: string }) => {
    const sample = {
      version: 1,
      gates: [
        {
          id: "readme",
          type: "fileExists",
          path: "README.md",
        },
        {
          id: "tests",
          label: "Unit tests",
          type: "command",
          run: "npm test",
        },
      ],
    };
    await writeFile(opts.file, `${JSON.stringify(sample, null, 2)}\n`, "utf8");
    process.stdout.write(`Wrote ${path.resolve(opts.file)}\n`);
  });

program
  .command("audit")
  .description("List TypeScript sources without a sibling .test.ts / .spec.ts")
  .requiredOption("-r, --root <dir>", "Project root to scan")
  .option("--fail", "Exit 1 if any source file has no matching test file")
  .option("-o, --out <path>", "Write JSON result")
  .action(async (opts: { root: string; fail?: boolean; out?: string }) => {
    const r = await auditMissingTests(opts.root);
    if (opts.out) {
      await writeFile(path.resolve(opts.out), `${JSON.stringify(r, null, 2)}\n`, "utf8");
    }
    process.stdout.write(
      `Sources: ${r.sources.length}, with sibling test: ${r.sources.length - r.untested.length}, untested: ${r.untested.length}, coverage ratio (files): ${(r.ratio * 100).toFixed(1)}%\n`
    );
    for (const u of r.untested) process.stdout.write(`  missing test for ${u}\n`);
    if (opts.fail && r.untested.length > 0) process.exitCode = 1;
  });

program
  .command("coverage")
  .description("Check Istanbul coverage-summary.json line % against a floor")
  .requiredOption("-f, --file <path>", "Path to coverage-summary.json")
  .requiredOption("--min-lines <pct>", "Minimum line coverage percent", (v) => Number(v))
  .action(async (opts: { file: string; minLines: number }) => {
    const abs = path.resolve(opts.file);
    const text = await readFile(abs, "utf8");
    const totals = parseCoverageSummary(text);
    const ok = meetsLineThreshold(totals, opts.minLines);
    process.stdout.write(`Line coverage: ${totals.linesPct}% (min ${opts.minLines}%)\n`);
    if (!ok) process.exitCode = 1;
  });

program
  .command("review")
  .description("For each source file, check sibling tests reference exported APIs; suggest tests if missing")
  .requiredOption("-r, --root <dir>", "Project root to scan")
  .option("--fail", "Exit 1 if any export lacks test attention")
  .option("-o, --out <path>", "Write JSON issues list")
  .option("--ai", "Optional: call OpenAI-compatible API for richer test ideas (needs OPENAI_API_KEY)")
  .option("--ai-max <n>", "Max AI requests when using --ai", (v) => parseInt(String(v), 10), 3)
  .action(
    async (opts: { root: string; fail?: boolean; out?: string; ai?: boolean; aiMax: number }) => {
      const r = await reviewExports(opts.root);
      if (opts.out) {
        await writeFile(path.resolve(opts.out), `${JSON.stringify(r, null, 2)}\n`, "utf8");
      }
      process.stdout.write(formatReviewReport(r));
      if (opts.ai) {
        await printAiSuggestionsForIssues(r.issues, Number.isFinite(opts.aiMax) ? opts.aiMax : 3);
      }
      if (opts.fail && !r.ok) process.exitCode = 1;
    }
  );

program
  .command("scaffold-tests")
  .description("Create minimal Vitest siblings for sources missing tests (dry-run unless --write)")
  .requiredOption("-r, --root <dir>", "Project root to scan")
  .option("--write", "Write files; default is dry-run (print paths only)")
  .action(async (opts: { root: string; write?: boolean }) => {
    const r = await scaffoldTests(opts.root, { write: !!opts.write });
    if (opts.write) {
      for (const c of r.created) process.stdout.write(`wrote ${c}\n`);
      if (r.created.length === 0) process.stdout.write("Nothing to create — all sources already have tests.\n");
    } else {
      for (const p of r.wouldCreate) process.stdout.write(`would create ${p}\n`);
      if (r.wouldCreate.length === 0) process.stdout.write("Nothing to scaffold — all sources already have tests.\n");
      else process.stdout.write("\nRe-run with --write to create these files.\n");
    }
  });

await program.parseAsync(process.argv);

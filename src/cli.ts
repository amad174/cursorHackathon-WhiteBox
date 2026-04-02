#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import { loadConfig } from "./config.js";
import { verify } from "./engine.js";
import { formatConsole, writeJsonReport } from "./report.js";

const program = new Command();

program.name("whitebox").description("Quality gates with verification artifacts").version("0.1.0");

program
  .command("verify")
  .description("Run all gates from a config file")
  .requiredOption("-c, --config <path>", "Path to whitebox.config.json")
  .option("-o, --out <path>", "Write JSON report (default: whitebox-report.json in cwd)")
  .option("-q, --quiet", "Only print summary line")
  .action(async (opts: { config: string; out?: string; quiet?: boolean }) => {
    const configPath = path.resolve(opts.config);
    const config = await loadConfig(configPath);
    const report = await verify(config, configPath);
    const out = opts.out ? path.resolve(opts.out) : path.resolve(process.cwd(), "whitebox-report.json");
    await writeJsonReport(report, out);
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

await program.parseAsync(process.argv);

import { writeFile } from "node:fs/promises";
import type { VerifyReport } from "./types.js";

export async function writeJsonReport(report: VerifyReport, outPath: string): Promise<void> {
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

export function formatConsole(report: VerifyReport): string {
  const lines: string[] = [];
  const status = report.ok ? "PASS" : "FAIL";
  lines.push(`whitebox verify — ${status}`);
  lines.push(`config: ${report.configPath}`);
  lines.push("");
  for (const g of report.gates) {
    const mark = g.ok ? "✓" : "✗";
    const name = g.label ?? g.id;
    lines.push(`${mark} [${g.type}] ${name} (${g.durationMs}ms)`);
    if (g.detail) lines.push(`    ${g.detail}`);
    if (g.testEvidence?.failedTests.length) {
      lines.push(`    --- failed tests (from JSON report) ---`);
      for (const ft of g.testEvidence.failedTests) {
        const msg = ft.messages[0]?.split("\n")[0] ?? "failed";
        lines.push(`    • ${ft.fullName}`);
        lines.push(`      ${msg}`);
      }
    } else if (g.testEvidence && g.testEvidence.totalFailed === 0) {
      lines.push(`    tests: ${g.testEvidence.totalPassed ?? 0} passed (json report)`);
    }
    if (!g.ok && g.stderr) {
      const peek = g.stderr.split("\n").slice(-8).join("\n");
      lines.push(`    --- stderr (tail) ---`);
      for (const row of peek.split("\n")) lines.push(`    ${row}`);
    }
  }
  lines.push("");
  lines.push(`Summary: ${report.gates.filter((x) => x.ok).length}/${report.gates.length} gates passed`);
  return lines.join("\n");
}

/**
 * GitHub Actions workflow commands — surfaces failures on the PR checks UI.
 * @see https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/workflow-commands-for-github-actions
 */
export function formatGithubWorkflowCommands(report: VerifyReport): string {
  const lines: string[] = [];
  if (report.ok) {
    return "";
  }
  for (const g of report.gates) {
    if (g.ok) continue;
    const title = g.label ?? g.id;
    if (g.testEvidence?.failedTests.length) {
      for (const ft of g.testEvidence.failedTests) {
        const file = ft.file || undefined;
        const msg = `${ft.fullName}: ${ft.messages[0]?.trim().split("\n")[0] ?? "assertion failed"}`;
        if (file) {
          lines.push(`::error file=${file}::[${title}] ${msg}`);
        } else {
          lines.push(`::error title=${title}::${msg}`);
        }
      }
    } else {
      const hint = g.detail ?? "gate failed";
      lines.push(`::error title=${title}::${hint}`);
    }
  }
  const body = lines.filter(Boolean).join("\n");
  return body ? `${body}\n` : "";
}

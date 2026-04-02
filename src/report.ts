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

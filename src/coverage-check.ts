/**
 * Reads Istanbul `coverage-summary.json` (e.g. Vitest json-summary reporter).
 */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export type CoverageTotals = {
  linesPct: number;
  statementsPct?: number;
  branchesPct?: number;
  functionsPct?: number;
};

export function parseCoverageSummary(jsonText: string): CoverageTotals {
  const data: unknown = JSON.parse(jsonText);
  if (!isRecord(data)) throw new Error("coverage summary: expected object");
  const total = data.total;
  if (!isRecord(total)) throw new Error("coverage summary: missing total");
  const lines = total.lines;
  if (!isRecord(lines) || typeof lines.pct !== "number") {
    throw new Error("coverage summary: missing total.lines.pct");
  }
  const statements = total.statements;
  const branches = total.branches;
  const functions = total.functions;
  return {
    linesPct: lines.pct,
    statementsPct: isRecord(statements) && typeof statements.pct === "number" ? statements.pct : undefined,
    branchesPct: isRecord(branches) && typeof branches.pct === "number" ? branches.pct : undefined,
    functionsPct: isRecord(functions) && typeof functions.pct === "number" ? functions.pct : undefined,
  };
}

export function meetsLineThreshold(totals: CoverageTotals, minLines: number): boolean {
  return totals.linesPct + 1e-6 >= minLines;
}

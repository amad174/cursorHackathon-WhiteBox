/**
 * Parses Vitest / Jest JSON reporter output (--reporter=json --outputFile=...).
 */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function parseVitestJsonReport(jsonText: string): {
  totalPassed: number;
  totalFailed: number;
  failedTests: { fullName: string; file: string; messages: string[] }[];
} {
  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    return { totalPassed: 0, totalFailed: 0, failedTests: [] };
  }
  if (!isRecord(data)) {
    return { totalPassed: 0, totalFailed: 0, failedTests: [] };
  }

  const numPassed = typeof data.numPassedTests === "number" ? data.numPassedTests : 0;
  const numFailed = typeof data.numFailedTests === "number" ? data.numFailedTests : 0;

  const failedTests: { fullName: string; file: string; messages: string[] }[] = [];
  const testResults = data.testResults;
  if (!Array.isArray(testResults)) {
    return { totalPassed: numPassed, totalFailed: numFailed, failedTests };
  }

  for (const tr of testResults) {
    if (!isRecord(tr)) continue;
    const file = typeof tr.name === "string" ? tr.name : "";
    const assertions = tr.assertionResults;
    if (!Array.isArray(assertions)) continue;
    for (const ar of assertions) {
      if (!isRecord(ar)) continue;
      if (ar.status !== "failed") continue;
      const fullName = typeof ar.fullName === "string" ? ar.fullName : String(ar.title ?? "test");
      const messages = Array.isArray(ar.failureMessages)
        ? ar.failureMessages.map((m) => String(m))
        : [];
      failedTests.push({ fullName, file, messages });
    }
  }

  return { totalPassed: numPassed, totalFailed: numFailed, failedTests };
}

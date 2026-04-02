import { describe, expect, it } from "vitest";
import { parseVitestJsonReport } from "./vitest-json.js";

const passingSample = `{"numTotalTests":1,"numPassedTests":1,"numFailedTests":0,"testResults":[{"name":"/x/sum.test.ts","assertionResults":[{"fullName":"sum adds","status":"passed","failureMessages":[]}]}]}`;

const failingSample = `{"numTotalTests":1,"numPassedTests":0,"numFailedTests":1,"testResults":[{"name":"/x/sum.test.ts","assertionResults":[{"fullName":"sum adds","status":"failed","failureMessages":["expected 5 to be -1"]}]}]}`;

describe("parseVitestJsonReport", () => {
  it("extracts failed tests", () => {
    const r = parseVitestJsonReport(failingSample);
    expect(r.totalFailed).toBe(1);
    expect(r.failedTests).toHaveLength(1);
    expect(r.failedTests[0].fullName).toBe("sum adds");
    expect(r.failedTests[0].messages[0]).toContain("expected");
  });

  it("handles passing suite", () => {
    const r = parseVitestJsonReport(passingSample);
    expect(r.failedTests).toHaveLength(0);
  });
});

import { describe, expect, it } from "vitest";
import { meetsLineThreshold, parseCoverageSummary } from "./coverage-check.js";

const sample = `{"total":{"lines":{"pct":82.5},"statements":{"pct":80},"branches":{"pct":70},"functions":{"pct":90}}}`;

describe("coverage-check", () => {
  it("parses line pct", () => {
    const t = parseCoverageSummary(sample);
    expect(t.linesPct).toBe(82.5);
  });

  it("threshold", () => {
    const t = parseCoverageSummary(sample);
    expect(meetsLineThreshold(t, 80)).toBe(true);
    expect(meetsLineThreshold(t, 90)).toBe(false);
  });
});

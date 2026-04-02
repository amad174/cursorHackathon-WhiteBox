import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { auditMissingTests, hasMatchingTest, siblingTestPaths } from "./audit.js";

describe("audit", () => {
  it("siblingTestPaths prefers .test.ts", () => {
    const p = "/proj/src/foo.ts";
    expect(siblingTestPaths(p)[0]).toMatch(/foo\.test\.ts$/);
  });

  it("detects missing tests", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "wb-audit-"));
    await mkdir(path.join(dir, "src"), { recursive: true });
    await writeFile(path.join(dir, "src", "a.ts"), "export const a = 1;\n", "utf8");
    await writeFile(path.join(dir, "src", "b.ts"), "export const b = 2;\n", "utf8");
    await writeFile(path.join(dir, "src", "b.test.ts"), "import { it } from 'vitest';\n", "utf8");
    const r = await auditMissingTests(dir);
    expect(r.untested.map((x) => path.basename(x))).toEqual(["a.ts"]);
    expect(await hasMatchingTest(path.join(dir, "src", "b.ts"))).toBe(true);
  });
});

import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectExportedRuntimeSymbols,
  isSymbolReferencedInTests,
  reviewExports,
} from "./review.js";

describe("collectExportedRuntimeSymbols", () => {
  it("finds exported function", () => {
    const src = `export function sum(a: number, b: number) { return a + b; }\n`;
    expect(collectExportedRuntimeSymbols(src, "x.ts")).toEqual(["sum"]);
  });

  it("ignores interfaces", () => {
    const src = `export interface Foo { x: number }\nexport function bar() {}\n`;
    expect(collectExportedRuntimeSymbols(src, "x.ts")).toEqual(["bar"]);
  });
});

describe("isSymbolReferencedInTests", () => {
  it("detects name in import and call", () => {
    expect(isSymbolReferencedInTests("sum", `import { sum } from "./sum.js";\nsum(1,2)`)).toBe(true);
    expect(isSymbolReferencedInTests("sum", `describe("other", () => {})`)).toBe(false);
  });
});

describe("reviewExports", () => {
  it("flags export not mentioned in test file", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "wb-rev-"));
    await mkdir(path.join(dir, "src"), { recursive: true });
    const src = path.join(dir, "src", "math.ts");
    await writeFile(src, "export function add(a:number,b:number){return a+b;}\n", "utf8");
    const test = path.join(dir, "src", "math.test.ts");
    await writeFile(test, `import { describe, it, expect } from "vitest";\ndescribe("noop", () => { it("x", () => expect(1).toBe(1)); });\n`, "utf8");
    const r = await reviewExports(dir);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.kind === "export-not-tested" && i.symbol === "add")).toBe(true);
  });
});

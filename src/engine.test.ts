import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runGate, verify } from "./engine.js";
import type { Config } from "./types.js";

describe("runGate", () => {
  it("fileExists passes when file is present", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "wb-"));
    await writeFile(path.join(dir, "a.txt"), "x", "utf8");
    const r = await runGate({ id: "f", type: "fileExists", path: "a.txt" }, dir);
    expect(r.ok).toBe(true);
  });

  it("fileMatches checks regex", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "wb-"));
    await writeFile(path.join(dir, "b.txt"), "export const v = 1;\n", "utf8");
    const ok = await runGate(
      { id: "m", type: "fileMatches", path: "b.txt", pattern: "export const" },
      dir
    );
    expect(ok.ok).toBe(true);
    const bad = await runGate(
      { id: "m2", type: "fileMatches", path: "b.txt", pattern: "not-there" },
      dir
    );
    expect(bad.ok).toBe(false);
  });

  it("command gate runs exit code", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "wb-"));
    const pass = await runGate({ id: "c", type: "command", run: "node -e \"process.exit(0)\"" }, dir);
    expect(pass.ok).toBe(true);
    const fail = await runGate({ id: "c2", type: "command", run: "node -e \"process.exit(2)\"" }, dir);
    expect(fail.ok).toBe(false);
  });
});

describe("verify", () => {
  it("aggregates all gates", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "wb-"));
    const cfgPath = path.join(dir, "cfg.json");
    await writeFile(path.join(dir, "ok.txt"), "y", "utf8");
    const config: Config = {
      version: 1,
      gates: [
        { id: "a", type: "fileExists", path: "ok.txt" },
        { id: "b", type: "command", run: "node -e \"process.exit(0)\"" },
      ],
    };
    const report = await verify(config, cfgPath);
    expect(report.ok).toBe(true);
    expect(report.gates).toHaveLength(2);
  });
});

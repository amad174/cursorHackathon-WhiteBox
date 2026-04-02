import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("parses valid config", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "wb-"));
    const p = path.join(dir, "c.json");
    await writeFile(
      p,
      JSON.stringify({
        version: 1,
        gates: [
          { id: "a", type: "fileExists", path: "x" },
          { id: "b", type: "command", run: "echo hi" },
        ],
      }),
      "utf8"
    );
    const c = await loadConfig(p);
    expect(c.gates).toHaveLength(2);
    expect(c.gates[0].type).toBe("fileExists");
  });

  it("rejects bad version", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "wb-"));
    const p = path.join(dir, "c.json");
    await writeFile(p, JSON.stringify({ version: 2, gates: [] }), "utf8");
    await expect(loadConfig(p)).rejects.toThrow(/version/);
  });
});

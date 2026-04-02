import { access, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import type { Config, Gate, GateResult, TestEvidenceVitest, VerifyReport } from "./types.js";
import { parseVitestJsonReport } from "./vitest-json.js";

const DEFAULT_TIMEOUT_MS = 300_000;

function runCommand(
  cmd: string,
  cwd: string,
  timeoutMs: number
): Promise<{ code: number | null; stdout: string; stderr: string; signal: NodeJS.Signals | null }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, {
      cwd,
      shell: true,
      env: process.env,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (c: Buffer) => {
      stdout += c.toString("utf8");
    });
    child.stderr?.on("data", (c: Buffer) => {
      stderr += c.toString("utf8");
    });
    const t = setTimeout(() => {
      child.kill("SIGTERM");
    }, timeoutMs);
    child.on("close", (code, signal) => {
      clearTimeout(t);
      resolve({ code, stdout, stderr, signal });
    });
    child.on("error", (err) => {
      clearTimeout(t);
      stderr += `\n[whitebox] spawn error: ${(err as Error).message}`;
      resolve({ code: 1, stdout, stderr, signal: null });
    });
  });
}

export async function runGate(
  gate: Gate,
  configDir: string
): Promise<GateResult> {
  const t0 = Date.now();
  const base = { id: gate.id, label: gate.label, type: gate.type };

  if (gate.type === "fileExists") {
    const p = path.resolve(configDir, gate.path);
    try {
      await access(p);
      return { ...base, ok: true, durationMs: Date.now() - t0, detail: p };
    } catch {
      return {
        ...base,
        ok: false,
        durationMs: Date.now() - t0,
        detail: `Missing file: ${p}`,
      };
    }
  }

  if (gate.type === "fileMatches") {
    const p = path.resolve(configDir, gate.path);
    let content: string;
    try {
      content = await readFile(p, "utf8");
    } catch {
      return {
        ...base,
        ok: false,
        durationMs: Date.now() - t0,
        detail: `Cannot read file: ${p}`,
      };
    }
    let re: RegExp;
    try {
      re = new RegExp(gate.pattern, gate.flags ?? "");
    } catch (e) {
      return {
        ...base,
        ok: false,
        durationMs: Date.now() - t0,
        detail: `Invalid regex: ${(e as Error).message}`,
      };
    }
    if (!re.test(content)) {
      return {
        ...base,
        ok: false,
        durationMs: Date.now() - t0,
        detail: `Pattern did not match in ${p}`,
      };
    }
    return { ...base, ok: true, durationMs: Date.now() - t0, detail: p };
  }

  const cwd = path.resolve(configDir, gate.cwd ?? ".");
  const timeoutMs = gate.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { code, stdout, stderr, signal } = await runCommand(gate.run, cwd, timeoutMs);
  const ok = code === 0 && !signal;
  const detail =
    signal != null
      ? `Process killed (${signal}) — timeout or signal`
      : code === 0
        ? undefined
        : `Exit code ${code ?? "unknown"}`;

  let testEvidence: TestEvidenceVitest | undefined;
  if (gate.type === "command" && gate.jsonReportPath) {
    const reportAbs = path.resolve(cwd, gate.jsonReportPath);
    try {
      const jsonText = await readFile(reportAbs, "utf8");
      const parsed = parseVitestJsonReport(jsonText);
      testEvidence = {
        framework: "vitest-json",
        totalPassed: parsed.totalPassed,
        totalFailed: parsed.totalFailed,
        failedTests: parsed.failedTests,
      };
    } catch {
      /* no file or unreadable — omit evidence */
    }
  }

  return {
    ...base,
    ok,
    durationMs: Date.now() - t0,
    detail,
    stdout: stdout.trim() ? stdout.slice(-16_000) : undefined,
    stderr: stderr.trim() ? stderr.slice(-16_000) : undefined,
    testEvidence,
  };
}

export async function verify(
  config: Config,
  configPath: string
): Promise<VerifyReport> {
  const configDir = path.dirname(path.resolve(configPath));
  const gates: GateResult[] = [];
  for (const g of config.gates) {
    gates.push(await runGate(g, configDir));
  }
  const ok = gates.every((g) => g.ok);
  return {
    schema: "whitebox.verify.v1",
    createdAt: new Date().toISOString(),
    configPath: path.resolve(configPath),
    ok,
    gates,
  };
}

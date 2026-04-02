import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Config, Gate } from "./types.js";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseGate(raw: unknown, index: number): Gate {
  if (!isRecord(raw)) throw new Error(`gates[${index}]: expected object`);
  const id = raw.id;
  if (typeof id !== "string" || !id.trim()) {
    throw new Error(`gates[${index}]: id must be a non-empty string`);
  }
  const label = raw.label;
  if (label !== undefined && typeof label !== "string") {
    throw new Error(`gates[${index}].label: expected string`);
  }
  const type = raw.type;
  if (type === "command") {
    const run = raw.run;
    if (typeof run !== "string" || !run.trim()) {
      throw new Error(`gates[${index}].run: expected non-empty string`);
    }
    const cwd = raw.cwd;
    if (cwd !== undefined && typeof cwd !== "string") {
      throw new Error(`gates[${index}].cwd: expected string`);
    }
    const timeoutMs = raw.timeoutMs;
    if (timeoutMs !== undefined && typeof timeoutMs !== "number") {
      throw new Error(`gates[${index}].timeoutMs: expected number`);
    }
    return { id, label, type: "command", run, cwd, timeoutMs };
  }
  if (type === "fileExists") {
    const p = raw.path;
    if (typeof p !== "string" || !p.trim()) {
      throw new Error(`gates[${index}].path: expected non-empty string`);
    }
    return { id, label, type: "fileExists", path: p };
  }
  if (type === "fileMatches") {
    const p = raw.path;
    const pattern = raw.pattern;
    if (typeof p !== "string" || !p.trim()) {
      throw new Error(`gates[${index}].path: expected non-empty string`);
    }
    if (typeof pattern !== "string" || !pattern.trim()) {
      throw new Error(`gates[${index}].pattern: expected non-empty string`);
    }
    const flags = raw.flags;
    if (flags !== undefined && typeof flags !== "string") {
      throw new Error(`gates[${index}].flags: expected string`);
    }
    return { id, label, type: "fileMatches", path: p, pattern, flags };
  }
  throw new Error(`gates[${index}].type: unknown type ${String(type)}`);
}

export async function loadConfig(filePath: string): Promise<Config> {
  const abs = path.resolve(filePath);
  const text = await readFile(abs, "utf8");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`Invalid JSON in ${abs}: ${(e as Error).message}`);
  }
  if (!isRecord(data)) throw new Error("Config root must be an object");
  if (data.version !== 1) {
    throw new Error(`Unsupported config version: ${String(data.version)} (expected 1)`);
  }
  const gatesRaw = data.gates;
  if (!Array.isArray(gatesRaw)) throw new Error("gates must be an array");
  const gates = gatesRaw.map(parseGate);
  return { version: 1, gates };
}

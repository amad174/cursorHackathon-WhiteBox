export type GateBase = {
  id: string;
  /** Optional human-readable label for reports */
  label?: string;
};

export type CommandGate = GateBase & {
  type: "command";
  /** Shell command (no implicit shell features — use cmd on Windows or bash -lc) */
  run: string;
  cwd?: string;
  /** Max ms before kill (default 300_000) */
  timeoutMs?: number;
  /**
   * After the command, read this file (relative to gate cwd) and attach Vitest-style JSON
   * evidence (Jest-compatible reporter output) to the report.
   */
  jsonReportPath?: string;
};

export type FileExistsGate = GateBase & {
  type: "fileExists";
  path: string;
};

export type RegexGate = GateBase & {
  type: "fileMatches";
  path: string;
  pattern: string;
  /** Regex flags, default "" */
  flags?: string;
};

export type Gate = CommandGate | FileExistsGate | RegexGate;

export type Config = {
  version: 1;
  gates: Gate[];
};

export type TestEvidenceVitest = {
  framework: "vitest-json";
  totalPassed?: number;
  totalFailed?: number;
  failedTests: { fullName: string; file: string; messages: string[] }[];
};

export type GateResult = {
  id: string;
  label?: string;
  type: Gate["type"];
  ok: boolean;
  durationMs: number;
  detail?: string;
  stdout?: string;
  stderr?: string;
  /** Structured proof from jsonReportPath (e.g. which tests failed) */
  testEvidence?: TestEvidenceVitest;
};

export type VerifyReport = {
  schema: "whitebox.verify.v1";
  createdAt: string;
  configPath: string;
  ok: boolean;
  gates: GateResult[];
};

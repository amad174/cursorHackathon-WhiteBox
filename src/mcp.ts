import { readFile } from "node:fs/promises";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { verify } from "./engine.js";
import { formatConsole, writeJsonReport } from "./report.js";

const verifyInput = z.object({
  configPath: z
    .string()
    .describe("Path to whitebox.config.json (relative to cwd or absolute)"),
  cwd: z.string().optional().describe("Workspace root for resolving relative paths (default: process.cwd())"),
  reportPath: z
    .string()
    .optional()
    .describe("Output path for whitebox-report.json (default: <cwd>/whitebox-report.json)"),
});

const readReportInput = z.object({
  reportPath: z.string().optional().describe("Path to report JSON (default: <cwd>/whitebox-report.json)"),
  cwd: z.string().optional().describe("Base directory when using default report name"),
});

type VerifyToolArgs = z.infer<typeof verifyInput>;
type ReadReportToolArgs = z.infer<typeof readReportInput>;

export async function runMcpServer(): Promise<void> {
  const mcp = new McpServer(
    { name: "whitebox", version: "0.1.0" },
    {
      instructions:
        "Whitebox runs configurable quality gates (commands, file checks, regex proofs) and writes a JSON verification report. Use verify to run gates; use read_report to load the last report without re-running.",
    }
  );

  mcp.registerTool(
    "verify",
    {
      description:
        "Run all gates from a whitebox config file, write the JSON report, and return a text summary plus structured gate results.",
      inputSchema: verifyInput.shape,
    },
    async (args: VerifyToolArgs) => {
      const { configPath, cwd, reportPath } = verifyInput.parse(args);
      const cwdResolved = cwd ? path.resolve(cwd) : process.cwd();
      const configResolved = path.isAbsolute(configPath)
        ? configPath
        : path.resolve(cwdResolved, configPath);
      const config = await loadConfig(configResolved);
      const report = await verify(config, configResolved);
      const out = reportPath
        ? path.isAbsolute(reportPath)
          ? reportPath
          : path.resolve(cwdResolved, reportPath)
        : path.resolve(cwdResolved, "whitebox-report.json");
      await writeJsonReport(report, out);
      const summary = formatConsole(report);
      return {
        content: [
          {
            type: "text",
            text: `${summary}\n\nReport written to: ${out}\n\nFull JSON:\n${JSON.stringify(report, null, 2)}`,
          },
        ],
      };
    }
  );

  mcp.registerTool(
    "read_report",
    {
      description: "Read an existing whitebox-report.json from disk (no gates executed).",
      inputSchema: readReportInput.shape,
    },
    async (args: ReadReportToolArgs) => {
      const { reportPath, cwd } = readReportInput.parse(args);
      const base = cwd ? path.resolve(cwd) : process.cwd();
      const p = reportPath ? path.resolve(base, reportPath) : path.join(base, "whitebox-report.json");
      try {
        const raw = await readFile(p, "utf8");
        return {
          content: [{ type: "text", text: raw }],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text", text: `Could not read ${p}: ${message}` }],
          isError: true,
        };
      }
    }
  );

  const transport = new StdioServerTransport();
  await mcp.connect(transport);
}

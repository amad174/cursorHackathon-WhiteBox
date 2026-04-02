import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { verify } from "./engine.js";
import { writeJsonReport } from "./report.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function uiDir(): string {
  return path.join(__dirname, "..", "ui");
}

function json(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(body));
}

function text(res: ServerResponse, code: number, body: string, contentType: string): void {
  res.writeHead(code, {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export type ServeOptions = {
  port: number;
  /** Default config path shown in UI / used when API omits config */
  configPath: string;
  /** Where reports are written / read by default */
  reportPath: string;
};

export async function startServe(opts: ServeOptions): Promise<void> {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${opts.port}`);

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    try {
      if (req.method === "GET" && url.pathname === "/") {
        const html = await readFile(path.join(uiDir(), "index.html"), "utf8");
        text(res, 200, html, "text/html; charset=utf-8");
        return;
      }

      if (req.method === "GET" && (url.pathname === "/api/report" || url.pathname === "/whitebox-report.json")) {
        const reportFile = url.searchParams.get("path")
          ? path.resolve(url.searchParams.get("path")!)
          : path.resolve(opts.reportPath);
        const raw = await readFile(reportFile, "utf8");
        text(res, 200, raw, "application/json; charset=utf-8");
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/run") {
        let body: { configPath?: string; reportPath?: string } = {};
        try {
          const raw = await readBody(req);
          if (raw.trim()) body = JSON.parse(raw) as typeof body;
        } catch {
          json(res, 400, { error: "Invalid JSON body" });
          return;
        }
        const configPath = path.resolve(body.configPath ?? opts.configPath);
        const reportOut = path.resolve(body.reportPath ?? opts.reportPath);
        const config = await loadConfig(configPath);
        const report = await verify(config, configPath);
        await writeJsonReport(report, reportOut);
        json(res, 200, report);
        return;
      }

      text(res, 404, "Not found", "text/plain; charset=utf-8");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      json(res, 500, { error: message });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, "127.0.0.1", () => resolve());
  });

  const url = `http://127.0.0.1:${opts.port}/`;
  process.stderr.write(`whitebox UI: ${url}\n`);
  process.stderr.write(`(Open in Cursor: Simple Browser → ${url})\n`);
}

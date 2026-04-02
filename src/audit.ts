import { access, readdir } from "node:fs/promises";
import path from "node:path";

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "coverage", ".turbo", ".next"]);

function isSourceTs(file: string): boolean {
  if (!file.endsWith(".ts")) return false;
  if (file.endsWith(".d.ts")) return false;
  if (file.endsWith(".test.ts")) return false;
  if (file.endsWith(".spec.ts")) return false;
  /* Tooling configs are not “app sources” for sibling-test policy */
  if (file.endsWith(".config.ts")) return false;
  return true;
}

export async function walkSourceFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        await walk(p);
      } else if (e.isFile() && isSourceTs(e.name)) {
        out.push(p);
      }
    }
  }
  await walk(path.resolve(root));
  return out.sort();
}

export function siblingTestPaths(sourceFile: string): string[] {
  const dir = path.dirname(sourceFile);
  const base = path.basename(sourceFile, ".ts");
  return [path.join(dir, `${base}.test.ts`), path.join(dir, `${base}.spec.ts`)];
}

export async function hasMatchingTest(sourceFile: string): Promise<boolean> {
  for (const candidate of siblingTestPaths(sourceFile)) {
    try {
      await access(candidate);
      return true;
    } catch {
      /* continue */
    }
  }
  return false;
}

export type AuditResult = {
  root: string;
  sources: string[];
  untested: string[];
  ratio: number;
};

export async function auditMissingTests(root: string): Promise<AuditResult> {
  const absRoot = path.resolve(root);
  const sources = await walkSourceFiles(absRoot);
  const untested: string[] = [];
  for (const s of sources) {
    if (!(await hasMatchingTest(s))) untested.push(s);
  }
  const ratio = sources.length === 0 ? 1 : (sources.length - untested.length) / sources.length;
  return { root: absRoot, sources, untested, ratio };
}

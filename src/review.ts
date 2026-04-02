import { access, readFile } from "node:fs/promises";
import path from "node:path";
import * as ts from "typescript";
import { siblingTestPaths, walkSourceFiles } from "./audit.js";

export type ReviewIssue = {
  sourceFile: string;
  kind: "missing-test-file" | "export-not-tested";
  /** Runtime export symbol (function, class, const, enum, re-export name) */
  symbol: string;
  testFile?: string;
  message: string;
  suggestion: string;
};

export type ReviewResult = {
  root: string;
  ok: boolean;
  issues: ReviewIssue[];
};

function isExportedStatement(stmt: ts.Statement): boolean {
  const mods = ts.canHaveModifiers(stmt) ? ts.getModifiers(stmt) : undefined;
  return mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

/** Top-level runtime exports we expect tests to exercise (not types/interfaces). */
export function collectExportedRuntimeSymbols(sourceText: string, fileName: string): string[] {
  const sf = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const names: string[] = [];

  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name && isExportedStatement(stmt)) {
      names.push(stmt.name.text);
      continue;
    }
    if (ts.isClassDeclaration(stmt) && stmt.name && isExportedStatement(stmt)) {
      names.push(stmt.name.text);
      continue;
    }
    if (ts.isEnumDeclaration(stmt) && stmt.name && isExportedStatement(stmt)) {
      names.push(stmt.name.text);
      continue;
    }
    if (ts.isVariableStatement(stmt) && isExportedStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) names.push(d.name.text);
      }
      continue;
    }
    if (ts.isExportDeclaration(stmt) && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
      for (const el of stmt.exportClause.elements) {
        names.push(el.name.text);
      }
    }
  }

  return [...new Set(names)];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Heuristic: symbol appears as its own word in the test file (import, call, describe title, etc.). */
export function isSymbolReferencedInTests(symbol: string, testSource: string): boolean {
  if (!symbol.trim()) return false;
  const re = new RegExp(`\\b${escapeRegExp(symbol)}\\b`);
  return re.test(testSource);
}

function suggestForSymbol(symbol: string, sourceBase: string): string {
  return (
    `Add or extend tests in ${sourceBase}.test.ts: import { ${symbol} } from "./${sourceBase}.js" then ` +
    `describe("${symbol}", () => { it("handles a normal case", () => { expect(${symbol}(/* args */)).toEqual(/* expected */); }); ` +
    `it("handles edge cases", () => { /* e.g. 0, negatives, empty */ }); });`
  );
}

async function firstExistingTestFile(sourceFile: string): Promise<string | undefined> {
  for (const p of siblingTestPaths(sourceFile)) {
    try {
      await access(p);
      return p;
    } catch {
      /* continue */
    }
  }
  return undefined;
}

export async function reviewExports(root: string): Promise<ReviewResult> {
  const absRoot = path.resolve(root);
  const sources = await walkSourceFiles(absRoot);
  const issues: ReviewIssue[] = [];

  for (const file of sources) {
    const text = await readFile(file, "utf8");
    const symbols = collectExportedRuntimeSymbols(text, file);
    if (symbols.length === 0) continue;

    const base = path.basename(file, ".ts");
    const testPath = await firstExistingTestFile(file);

    if (!testPath) {
      issues.push({
        sourceFile: file,
        kind: "missing-test-file",
        symbol: symbols.join(", "),
        message: `No sibling test file for ${path.relative(absRoot, file) || "."} — exported runtime API: ${symbols.join(", ")}.`,
        suggestion: `Create ${base}.test.ts next to ${path.basename(file)} and add tests that import { ${symbols.join(", ")} } from "./${base}.js" and assert behavior for each export.`,
      });
      continue;
    }

    const testText = await readFile(testPath, "utf8");
    for (const symbol of symbols) {
      if (!isSymbolReferencedInTests(symbol, testText)) {
        issues.push({
          sourceFile: file,
          kind: "export-not-tested",
          symbol,
          testFile: testPath,
          message: `Export "${symbol}" from ${path.relative(absRoot, file) || "."} is not referenced in ${path.relative(absRoot, testPath) || path.basename(testPath)} — add tests that exercise this API.`,
          suggestion: suggestForSymbol(symbol, base),
        });
      }
    }
  }

  return { root: absRoot, ok: issues.length === 0, issues };
}

export function formatReviewReport(result: ReviewResult): string {
  const lines: string[] = [];
  lines.push(`whitebox review — ${result.ok ? "OK" : "ISSUES FOUND"}`);
  lines.push(`root: ${result.root}`);
  lines.push("");
  if (result.issues.length === 0) {
    lines.push("Every scanned export is referenced in a sibling test file (heuristic).");
    return lines.join("\n");
  }
  for (const i of result.issues) {
    lines.push(`• [${i.kind}] ${i.symbol}`);
    lines.push(`  ${i.message}`);
    lines.push(`  Suggestion: ${i.suggestion}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

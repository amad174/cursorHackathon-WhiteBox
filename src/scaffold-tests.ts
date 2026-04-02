import { writeFile } from "node:fs/promises";
import path from "node:path";
import { auditMissingTests } from "./audit.js";

function moduleNameFromPath(file: string): string {
  return path.basename(file, ".ts");
}

export function buildStubTest(sourceFile: string): string {
  const mod = moduleNameFromPath(sourceFile);
  const importPath = "./" + mod + ".js";
  return `import { describe, expect, it } from "vitest";
import * as mod from "${importPath}";

describe("${mod}", () => {
  it.todo("add behavioral tests (scaffold from whitebox scaffold-tests)");
  it("module loads", () => {
    expect(mod).toBeDefined();
  });
});
`;
}

export async function scaffoldTests(
  root: string,
  options: { write: boolean }
): Promise<{ created: string[]; wouldCreate: string[] }> {
  const { untested } = await auditMissingTests(root);
  const created: string[] = [];
  const wouldCreate: string[] = [];

  for (const src of untested) {
    const target = path.join(path.dirname(src), `${path.basename(src, ".ts")}.test.ts`);
    wouldCreate.push(target);
    if (options.write) {
      await writeFile(target, buildStubTest(src), "utf8");
      created.push(target);
    }
  }

  return { created, wouldCreate };
}

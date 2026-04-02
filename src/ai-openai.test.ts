import { describe, expect, it, vi } from "vitest";
import { fetchOpenAiChat, truncate } from "./ai-openai.js";

describe("truncate", () => {
  it("leaves short strings", () => {
    expect(truncate("abc", 10)).toBe("abc");
  });

  it("cuts long strings", () => {
    const t = truncate("x".repeat(200), 20);
    expect(t.length).toBeLessThan(200);
    expect(t).toContain("truncated");
  });
});

describe("fetchOpenAiChat", () => {
  it("parses success body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: "hello" } }] }),
      }))
    );
    const out = await fetchOpenAiChat({
      apiKey: "k",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      userContent: "hi",
    });
    expect(out).toBe("hello");
    vi.unstubAllGlobals();
  });
});

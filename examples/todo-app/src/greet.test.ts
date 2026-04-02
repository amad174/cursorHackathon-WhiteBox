import { describe, expect, it } from "vitest";
import { greet } from "./greet.js";

describe("greet", () => {
  it("greets with name", () => {
    expect(greet("Ada")).toBe("Hello, Ada");
  });
});

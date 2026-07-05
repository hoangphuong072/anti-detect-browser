import { describe, expect, it } from "vitest";
import { allocatePort } from "./ports.js";

describe("port allocation", () => {
  it("skips reserved ports", async () => {
    const port = await allocatePort(61230, 61232, new Set([61230]));
    expect(port).toBeGreaterThanOrEqual(61231);
  });
});

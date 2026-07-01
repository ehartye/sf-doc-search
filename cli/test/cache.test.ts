import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Cache } from "../src/cache";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "sf-docs-cache-"));
});

describe("Cache", () => {
  it("returns undefined on a miss", () => {
    const c = new Cache({ dir, ttlMs: 1000 });
    expect(c.get("k")).toBeUndefined();
  });

  it("round-trips a value within TTL", () => {
    const c = new Cache({ dir, ttlMs: 10_000 });
    c.set("k", { hello: "world" });
    expect(c.get("k")).toEqual({ hello: "world" });
  });

  it("treats expired entries as a miss", () => {
    const c = new Cache({ dir, ttlMs: -1 });
    c.set("k", { a: 1 });
    expect(c.get("k")).toBeUndefined();
  });

  it("bypasses entirely when disabled", () => {
    const c = new Cache({ dir, ttlMs: 10_000, enabled: false });
    c.set("k", { a: 1 });
    expect(c.get("k")).toBeUndefined();
  });
});

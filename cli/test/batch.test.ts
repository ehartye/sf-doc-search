import { describe, it, expect } from "vitest";
import { fetchBatch } from "../src/batch";
import type { DocResult } from "../src/types";

const doc = (n: string): DocResult =>
  ({ title: n, url: `https://x/${n}`, source: "lwr", html: `<p>${n}</p>`, markdown: `# ${n}` }) as DocResult;

const engine = {
  fetch: async (u: string) => {
    if (u.includes("bad")) throw new Error("boom");
    return doc(u.split("/").pop()!);
  },
};

describe("fetchBatch", () => {
  it("single URL md output is the bare document (back-compat)", async () => {
    const r = await fetchBatch(engine, ["https://x/a"], "md");
    expect(r.output).toBe("# a");
    expect(r.failures).toEqual([]);
  });
  it("joins multiple md docs with a --- separator line", async () => {
    const r = await fetchBatch(engine, ["https://x/a", "https://x/b"], "md");
    expect(r.output).toBe("# a\n---\n# b");
  });
  it("json: single object for one URL, array for many", async () => {
    const one = await fetchBatch(engine, ["https://x/a"], "json");
    expect(JSON.parse(one.output).title).toBe("a");
    const many = await fetchBatch(engine, ["https://x/a", "https://x/b"], "json");
    expect(JSON.parse(many.output).map((d: DocResult) => d.title)).toEqual(["a", "b"]);
  });
  it("continues past a failed URL and reports it", async () => {
    const r = await fetchBatch(engine, ["https://x/a", "https://x/bad", "https://x/c"], "md");
    expect(r.output).toBe("# a\n---\n# c");
    expect(r.failures).toEqual(["https://x/bad: boom"]);
  });
});

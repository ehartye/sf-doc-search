import { describe, it, expect } from "vitest";
import { checkNode, checkPluginVersion, readPluginVersion, runDoctor } from "../src/doctor";

describe("doctor helpers", () => {
  it("passes Node >= 20", () => {
    expect(checkNode("v20.0.0").ok).toBe(true);
    expect(checkNode("v22.22.0").ok).toBe(true);
  });
  it("fails Node < 20", () => {
    expect(checkNode("v18.19.0").ok).toBe(false);
  });

  it("reports a match when CLI and plugin versions are equal", () => {
    const c = checkPluginVersion("0.1.0", "0.1.0");
    expect(c.ok).toBe(true);
    expect(c.detail).toContain("matches");
  });
  it("flags a mismatch between CLI and plugin versions", () => {
    const c = checkPluginVersion("0.1.0", "0.2.0");
    expect(c.ok).toBe(false);
    expect(c.detail).toContain("0.2.0");
  });
  it("treats an undetectable plugin version as OK (not inside a plugin)", () => {
    expect(checkPluginVersion("0.1.0", undefined).ok).toBe(true);
  });

  it("reads the plugin version from a plugin root via an injected reader", () => {
    const read = (p: string) => {
      expect(p.replace(/\\/g, "/")).toContain(".claude-plugin/plugin.json");
      return JSON.stringify({ version: "9.9.9" });
    };
    expect(readPluginVersion("/fake/root", read)).toBe("9.9.9");
  });
  it("returns undefined when the plugin manifest can't be read", () => {
    expect(readPluginVersion("/fake/root", () => { throw new Error("nope"); })).toBeUndefined();
  });
});

describe("runDoctor", () => {
  it("is ready when node + browser are OK (no plugin root)", async () => {
    const browser = { probe: async () => ({ ok: true, detail: "Chromium 140" }) } as any;
    const report = await runDoctor("0.1.0", browser, {});
    expect(report.ok).toBe(true);
    expect(report.checks.map((c) => c.name)).toEqual(["node", "plugin-version", "browser"]);
  });
  it("is NOT ready when the browser probe fails", async () => {
    const browser = { probe: async () => ({ ok: false, detail: "no chrome" }) } as any;
    const report = await runDoctor("0.1.0", browser, {});
    expect(report.ok).toBe(false);
    const browserCheck = report.checks.find((c) => c.name === "browser")!;
    expect(browserCheck.ok).toBe(false);
    expect(browserCheck.detail).toContain("playwright install");
  });
  it("does not fail readiness on a version mismatch alone (warning only)", async () => {
    const browser = { probe: async () => ({ ok: true, detail: "Chromium 140" }) } as any;
    const report = await runDoctor("0.1.0", browser, { CLAUDE_PLUGIN_ROOT: "/nonexistent" });
    // plugin.json unreadable at /nonexistent -> version undetected -> still ready
    expect(report.ok).toBe(true);
  });
});

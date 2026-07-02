import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Paths are resolved relative to THIS test file so the suite works from any CWD.
function readText(relPath: string): string {
  return readFileSync(fileURLToPath(new URL(relPath, import.meta.url)), "utf8");
}
function readJson(relPath: string): any {
  return JSON.parse(readText(relPath));
}

// cli/package.json is the source of truth (it's what `sf-docs --version` reports).
const cliVersion: string = readJson("../package.json").version;

// Every place the plugin/CLI version is declared across both ecosystems.
const versionSources: Array<[string, string]> = [
  [".claude-plugin/plugin.json", readJson("../../.claude-plugin/plugin.json").version],
  [".claude-plugin/marketplace.json → plugins[0]", readJson("../../.claude-plugin/marketplace.json").plugins[0].version],
  [".github/plugin.json", readJson("../../.github/plugin.json").version],
  [".github/plugin/marketplace.json → metadata", readJson("../../.github/plugin/marketplace.json").metadata.version],
  [".github/plugin/marketplace.json → plugins[0]", readJson("../../.github/plugin/marketplace.json").plugins[0].version],
];

describe("manifest versions stay in sync", () => {
  it("cli/package.json has a semver version", () => {
    expect(cliVersion).toMatch(/^\d+\.\d+\.\d+/);
  });

  it.each(versionSources)("%s matches the CLI version (%s === " + cliVersion + ")", (_label, version) => {
    expect(version).toBe(cliVersion);
  });
});

describe("shared skills stay mirrored", () => {
  it.each(["sf-docs", "sf-docs-preflight"])(
    "the .github/skills/%s mirror is identical to the .claude/skills source",
    (skill) => {
      const source = readText(`../../.claude/skills/${skill}/SKILL.md`);
      const mirror = readText(`../../.github/skills/${skill}/SKILL.md`);
      expect(mirror).toBe(source);
    },
  );
});

import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Paths are resolved relative to THIS test file so the suite works from any CWD.
function abs(relPath: string): string {
  return fileURLToPath(new URL(relPath, import.meta.url));
}
function readText(relPath: string): string {
  return readFileSync(abs(relPath), "utf8");
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

// Skill directories (those containing a SKILL.md) discovered dynamically rather than
// from a hardcoded list, so a newly added skill is automatically covered and an
// orphaned mirror (a .github skill with no .claude source, or vice versa) is caught.
function skillDirs(relRoot: string): string[] {
  return readdirSync(abs(relRoot), { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(abs(`${relRoot}/${e.name}/SKILL.md`)))
    .map((e) => e.name)
    .sort();
}

const claudeSkills = skillDirs("../../.claude/skills");
const githubSkills = skillDirs("../../.github/skills");

describe("manifest versions stay in sync", () => {
  it("cli/package.json has a semver version", () => {
    expect(cliVersion).toMatch(/^\d+\.\d+\.\d+/);
  });

  it.each(versionSources)("%s matches the CLI version (%s === " + cliVersion + ")", (_label, version) => {
    expect(version).toBe(cliVersion);
  });
});

describe("shared skills stay mirrored", () => {
  it("discovers the shipped skills", () => {
    expect(claudeSkills).toContain("sf-docs");
    expect(claudeSkills.length).toBeGreaterThanOrEqual(1);
  });

  it("the .claude/skills and .github/skills sets match (no orphan mirror either way)", () => {
    expect(githubSkills).toEqual(claudeSkills);
  });

  it.each(claudeSkills)(
    "the .github/skills/%s mirror is identical to the .claude/skills source",
    (skill) => {
      const source = readText(`../../.claude/skills/${skill}/SKILL.md`);
      const mirror = readText(`../../.github/skills/${skill}/SKILL.md`);
      expect(mirror).toBe(source);
    },
  );
});

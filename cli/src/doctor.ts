import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { BrowserManager } from "./browser";

export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface DoctorReport {
  ok: boolean; // "ready to fetch docs" — gated on Node + browser (version mismatch is a warning)
  checks: DoctorCheck[];
}

export function checkNode(nodeVersion: string): DoctorCheck {
  const major = Number.parseInt(nodeVersion.replace(/^v/, "").split(".")[0], 10);
  const ok = Number.isFinite(major) && major >= 20;
  return {
    name: "node",
    ok,
    detail: ok ? `Node ${nodeVersion} (>= 20)` : `Node ${nodeVersion} is too old — sf-docs needs Node >= 20`,
  };
}

/**
 * Locate the plugin root by walking up from `startDir` (the running CLI's dir) until a
 * `.claude-plugin/plugin.json` is found. Lets `doctor` verify the CLI/plugin version match
 * without depending on CLAUDE_PLUGIN_ROOT (which isn't set in a skill's shell). Returns
 * undefined for a standalone/global install (no plugin manifest nearby) — which is correct.
 */
export function findPluginRoot(startDir: string, exists: (p: string) => boolean = existsSync): string | undefined {
  let dir = startDir;
  for (let i = 0; i < 8; i++) {
    if (exists(join(dir, ".claude-plugin", "plugin.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/** Read the installed plugin's declared version from <pluginRoot>/.claude-plugin/plugin.json. */
export function readPluginVersion(
  pluginRoot: string,
  read: (p: string) => string = (p) => readFileSync(p, "utf8"),
): string | undefined {
  try {
    const json = JSON.parse(read(join(pluginRoot, ".claude-plugin", "plugin.json")));
    return typeof json.version === "string" ? json.version : undefined;
  } catch {
    return undefined;
  }
}

export function checkPluginVersion(cliVersion: string, pluginVersion: string | undefined): DoctorCheck {
  if (!pluginVersion) {
    return {
      name: "plugin-version",
      ok: true,
      detail: `CLI ${cliVersion}; plugin version not detected (running outside a plugin install)`,
    };
  }
  const ok = pluginVersion === cliVersion;
  return {
    name: "plugin-version",
    ok,
    detail: ok
      ? `CLI ${cliVersion} matches plugin ${pluginVersion}`
      : `CLI ${cliVersion} does NOT match plugin ${pluginVersion} — update the CLI (e.g. npm i -g sf-docs@${pluginVersion}, or rebuild the bundled CLI) so they align`,
  };
}

/** Assemble the full preflight report. `browser.probe()` is injected so this is testable. */
export async function runDoctor(
  cliVersion: string,
  browser: Pick<BrowserManager, "probe">,
  env: Record<string, string | undefined> = process.env,
  cliDir?: string,
): Promise<DoctorReport> {
  const node = checkNode(process.version);

  // Prefer an explicit CLAUDE_PLUGIN_ROOT; otherwise self-locate the manifest from the CLI's dir.
  const pluginRoot = env.CLAUDE_PLUGIN_ROOT ?? (cliDir ? findPluginRoot(cliDir) : undefined);
  const version = checkPluginVersion(cliVersion, pluginRoot ? readPluginVersion(pluginRoot) : undefined);

  const probe = await browser.probe();
  const browserCheck: DoctorCheck = {
    name: "browser",
    ok: probe.ok,
    detail: probe.ok
      ? `browser OK (${probe.detail})`
      : `no usable browser: ${probe.detail}. Install Google Chrome, or run: npx playwright install chromium`,
  };

  // Readiness gates on the things that actually block fetching; a version mismatch is a warning.
  return { ok: node.ok && browserCheck.ok, checks: [node, version, browserCheck] };
}

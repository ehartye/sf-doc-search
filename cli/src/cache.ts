import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function defaultCacheDir(): string {
  if (process.env.SF_DOCS_CACHE_DIR) return process.env.SF_DOCS_CACHE_DIR;
  if (process.env.CLAUDE_PLUGIN_DATA) return join(process.env.CLAUDE_PLUGIN_DATA, "sf-docs-cache");
  return join(homedir(), ".cache", "sf-docs");
}

interface Entry<T> { ts: number; value: T; }

export interface CacheOptions {
  dir?: string;
  ttlMs?: number;
  enabled?: boolean;
}

export class Cache {
  private dir: string;
  private ttlMs: number;
  private enabled: boolean;

  constructor(opts: CacheOptions = {}) {
    this.dir = opts.dir ?? defaultCacheDir();
    this.ttlMs = opts.ttlMs ?? 24 * 60 * 60 * 1000;
    this.enabled = opts.enabled ?? true;
    if (this.enabled && !existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
  }

  private path(key: string): string {
    return join(this.dir, createHash("sha256").update(key).digest("hex") + ".json");
  }

  get<T>(key: string): T | undefined {
    if (!this.enabled) return undefined;
    const p = this.path(key);
    if (!existsSync(p)) return undefined;
    try {
      const entry = JSON.parse(readFileSync(p, "utf8")) as Entry<T>;
      if (Date.now() - entry.ts > this.ttlMs) return undefined;
      return entry.value;
    } catch {
      return undefined;
    }
  }

  set<T>(key: string, value: T): void {
    if (!this.enabled) return;
    const entry: Entry<T> = { ts: Date.now(), value };
    writeFileSync(this.path(key), JSON.stringify(entry));
  }
}

import { Command } from "commander";
import { BrowserManager } from "./browser";
import { Engine } from "./engine";
import { formatDoc, type Format } from "./format";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { runDoctor } from "./doctor";
import pkg from "../package.json";

interface GlobalOpts { format: Format; debug?: boolean; cache: boolean; }

function makeEngine(opts: GlobalOpts): Engine {
  const browser = new BrowserManager({ debug: opts.debug });
  return new Engine(browser, { enabled: opts.cache });
}

async function run(fn: (engine: Engine) => Promise<void>, opts: GlobalOpts): Promise<void> {
  const engine = makeEngine(opts);
  try {
    await fn(engine);
  } catch (err) {
    console.error(`sf-docs error: ${(err as Error).message}`);
    process.exitCode = 1;
  } finally {
    await engine.close();
  }
}

const program = new Command();
program
  .name("sf-docs")
  .description("Retrieve clean Salesforce documentation without shadow-DOM/render friction.")
  .version(pkg.version, "-v, --version", "print the sf-docs CLI version")
  .option("-f, --format <fmt>", "output format: md | html | json", "md")
  .option("--debug", "run the browser headed with verbose logs", false)
  .option("--no-cache", "bypass the on-disk cache");

program
  .command("doctor")
  .description("Preflight: check the install — CLI version, Node, browser, and CLI/plugin version match")
  .action(async () => {
    const browser = new BrowserManager({ debug: program.opts<GlobalOpts>().debug });
    try {
      const report = await runDoctor(pkg.version, browser, process.env, dirname(fileURLToPath(import.meta.url)));
      for (const c of report.checks) console.log(`${c.ok ? "OK  " : "!!  "}${c.name}: ${c.detail}`);
      console.log(report.ok ? "\nsf-docs is ready." : "\nsf-docs is NOT ready — resolve the !! items above.");
      if (!report.ok) process.exitCode = 1;
    } finally {
      await browser.close();
    }
  });

program
  .command("fetch <url>")
  .description("Fetch a Salesforce doc page (any of the supported sources) as clean Markdown")
  .action(async (url: string) => {
    const opts = program.opts<GlobalOpts>();
    await run(async (engine) => {
      const doc = await engine.fetch(url);
      console.log(formatDoc(doc, opts.format));
    }, opts);
  });

program
  .command("catalog")
  .description("List developer-docs deliverables (books)")
  .option("--grep <term>", "filter by deliverable id or title")
  .action(async (cmdOpts: { grep?: string }) => {
    const opts = program.opts<GlobalOpts>();
    await run(async (engine) => {
      const entries = await engine.catalog(cmdOpts.grep);
      if (opts.format === "json") console.log(JSON.stringify(entries, null, 2));
      else for (const e of entries) console.log(`${e.deliverable}\t${e.platform}\t${e.title}`);
    }, opts);
  });

program
  .command("toc <target>")
  .description("Table of contents: an Atlas deliverable (apexcode) or an LWR guide (ai/agentforce/guide)")
  .action(async (target: string) => {
    const opts = program.opts<GlobalOpts>();
    await run(async (engine) => {
      const entries = await engine.toc(target);
      if (opts.format === "json") console.log(JSON.stringify(entries, null, 2));
      else for (const e of entries) console.log(`${e.href ?? "-"}\t${e.text}`);
    }, opts);
  });

program
  .command("component <namespace> <name>")
  .description("LWC/Aura component reference (e.g. component lightning button)")
  .option("--model <model>", "lwc | aura", "lwc")
  .action(async (namespace: string, name: string, cmdOpts: { model: "lwc" | "aura" }) => {
    const opts = program.opts<GlobalOpts>();
    await run(async (engine) => {
      const doc = await engine.fetch(
        `https://developer.salesforce.com/docs/component-library/bundle/${cmdOpts.model === "aura" ? "aura/" : ""}${namespace}-${name}`,
      );
      console.log(formatDoc(doc, opts.format));
    }, opts);
  });

program
  .command("search <query>")
  .description("Search Salesforce Help or release notes (Coveo)")
  .requiredOption("--source <source>", "help | release")
  .action(async (query: string, cmdOpts: { source: "help" | "release" }) => {
    const opts = program.opts<GlobalOpts>();
    await run(async (engine) => {
      const results = await engine.search(query, cmdOpts.source);
      if (opts.format === "json") console.log(JSON.stringify(results, null, 2));
      else for (const r of results) console.log(`${r.url}\n  ${r.title}\n  ${r.excerpt}\n`);
    }, opts);
  });

program.parseAsync(process.argv);

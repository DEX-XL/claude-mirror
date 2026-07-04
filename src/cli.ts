import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { ingest, defaultProjectsDir } from "./ingest/parser.js";
import { computeStats } from "./stats/engine.js";
import { resolvePeriod, filterByPeriod } from "./stats/period.js";
import { sample } from "./persona/sampler.js";
import { analyzePersona } from "./persona/engine.js";
import { renderReport } from "./render/template.js";
import { buildMirrorPersona } from "./persona/mirror.js";
import { serve } from "./server.js";
import {
  defaultHistoryPath,
  loadHistory,
  previousSnapshot,
  saveSnapshot,
  snapshotFromProfile,
} from "./history.js";
import type { Profile } from "./types.js";

// Silence Node's DEP0190 (shell:true + args) — our spawned args are trusted
// constants; the warning would just be noise in a user-facing CLI.
process.noDeprecation = true;

const VERSION = "0.1.0";

type Args = {
  statsOnly: boolean;
  yes: boolean;
  showSample: boolean;
  json: boolean;
  period?: string;
  out?: string;
  model?: string;
  projectsDir?: string; // hidden: for testing against fixtures
  importPath?: string; // claude.ai / chatgpt export
  exportOnly: boolean; // write files only, don't start the dashboard
  port?: number;
  help: boolean;
  version: boolean;
};

function parseArgs(argv: string[]): Args {
  const a: Args = {
    statsOnly: false,
    yes: false,
    showSample: false,
    json: false,
    exportOnly: false,
    help: false,
    version: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    switch (t) {
      case "--stats-only": a.statsOnly = true; break;
      case "--yes": case "-y": a.yes = true; break;
      case "--show-sample": a.showSample = true; break;
      case "--json": a.json = true; break;
      case "--period": a.period = argv[++i]; break;
      case "--out": a.out = argv[++i]; break;
      case "--model": a.model = argv[++i]; break;
      case "--projects-dir": a.projectsDir = argv[++i]; break;
      case "--import": a.importPath = argv[++i]; break;
      case "--export": a.exportOnly = true; break;
      case "--port": a.port = Number(argv[++i]); break;
      case "--help": case "-h": a.help = true; break;
      case "--version": case "-v": a.version = true; break;
      default:
        if (t.startsWith("--period=")) a.period = t.slice(9);
        else if (t.startsWith("--out=")) a.out = t.slice(6);
        else if (t.startsWith("--model=")) a.model = t.slice(8);
        else if (!t.startsWith("-") && !a.importPath) a.importPath = t;
    }
  }
  return a;
}

const HELP = `Mirror v${VERSION} — see who you are through what you asked.

Usage: ai-mirror [options] [export.zip | conversations.json]

Runs your local dashboard: the 3D brain of your AI history, your stats,
your persona — and a chat with your own Mirror. Everything stays local.

  --export            write mirror-report.html + files and exit (no dashboard)
  --port <n>          dashboard port (default 3737)
  --stats-only        skip the LLM persona pass (no prompt, no network)
  --period <spec>     time window: 2026 | all | 6m  (default: current year)
  --show-sample       print the exact redacted text that would be sent, then exit
  --out <dir>         output directory (default: cwd)
  --json              also write profile.json
  --model <name>      model for persona pass (default: sonnet)
  --import <zip>      claude.ai or ChatGPT export (zip / conversations.json)
  --yes, -y           skip the consent prompt (CI / power users)
  --help, -h          this help
  --version, -v       version

For Claude Code users, omit the path and it reads ~/.claude/projects.
For chat users, pass your data export file directly.

100% local. The only network calls are the optional persona pass and your
own chat turns — via your own account, only after consent.`;

function log(msg: string) {
  process.stderr.write(msg + "\n");
}

async function askConsent(sampleCount: number): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  log("");
  log("  Persona analysis will send ~" + sampleCount + " sampled prompts to Claude");
  log("  via your own account. They are redacted first (emails, keys, URLs,");
  log("  file paths removed). Nothing is stored or sent anywhere else.");
  log("  Tools output and file contents are NEVER sent — only your typed prompts.");
  log("");
  const ans = (await rl.question("  Proceed with persona analysis? [y/N] ")).trim().toLowerCase();
  rl.close();
  return ans === "y" || ans === "yes";
}

async function askForImportPath(): Promise<string | undefined> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  log("");
  log("  I couldn't find local Claude Code history on this machine.");
  log("  If you use Claude in chat, export your data from Claude settings and");
  log("  paste the zip path here.");
  log("");
  const answer = (await rl.question("  Claude export path (or blank to exit): ")).trim();
  rl.close();
  return answer || undefined;
}

function nowHint(): string {
  // Stamp generation time here (the ONE allowed clock read), not in analysis.
  return new Date().toISOString().slice(0, 10);
}

async function openFile(path: string) {
  const platform = process.platform;
  const cmd = platform === "win32" ? "cmd" : platform === "darwin" ? "open" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", path] : [path];
  try {
    spawn(cmd, args, { detached: true, stdio: "ignore", shell: platform === "win32" }).unref();
  } catch {
    /* opening is best-effort */
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(HELP); return; }
  if (args.version) { console.log(VERSION); return; }

  const projectsDir = args.projectsDir ?? defaultProjectsDir();
  const nowMs = Date.now();

  let events: Awaited<ReturnType<typeof ingest>>["events"] = [];
  let parsed = 0;
  let skipped = 0;

  if (args.importPath) {
    const { importAnyExport } = await import("./ingest/chatgpt-import.js");
    try {
      log(`Reading export from ${args.importPath}…`);
      const imported = await importAnyExport(args.importPath);
      log(`Detected ${imported.source} export.`);
      if (imported.events.length === 0) {
        log(`No conversations found in ${args.importPath}.`);
        process.exitCode = 1;
        return;
      }
      events = imported.events;
      parsed = imported.parsed;
      skipped = imported.skipped;
    } catch (error) {
      log(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
      return;
    }
  } else {
    log("Reading your Claude history…");
    const ingestResult = await ingest(projectsDir);
    if (ingestResult.files === 0) {
      const importPath = await askForImportPath();
      if (!importPath) {
        log("No export provided. Exiting.");
        process.exitCode = 1;
        return;
      }

      const { importAnyExport } = await import("./ingest/chatgpt-import.js");
      try {
        log(`Reading export from ${importPath}…`);
        const imported = await importAnyExport(importPath);
        log(`Detected ${imported.source} export.`);
        if (imported.events.length === 0) {
          log(`No conversations found in ${importPath}.`);
          process.exitCode = 1;
          return;
        }
        events = imported.events;
        parsed = imported.parsed;
        skipped = imported.skipped;
      } catch (error) {
        log(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
        return;
      }
    } else {
      log(
        `Parsed ${ingestResult.parsed.toLocaleString()} events, skipped ${ingestResult.skipped.toLocaleString()} unrecognized (${ingestResult.malformed} malformed lines) across ${ingestResult.files} files.`
      );
      events = ingestResult.events;
      parsed = ingestResult.parsed;
      skipped = ingestResult.skipped;
    }
  }

  const period = resolvePeriod(args.period, nowMs);
  const scoped = filterByPeriod(events, period);
  if (scoped.length === 0) {
    log(`No activity in period "${period.label}". Try --period all.`);
    process.exitCode = 1;
    return;
  }

  // --show-sample: dump exactly what would be sent, then exit. Trust via inspection.
  if (args.showSample) {
    const s = sample(scoped);
    log(`\n--- SAMPLE (${s.sampledPrompts} prompts, redacted; this is ALL that would be sent) ---\n`);
    for (const chunk of s.chunks) {
      console.log(`### ${chunk.bucket} period`);
      chunk.prompts.forEach((p, i) => console.log(`[${i + 1}] ${p}\n`));
    }
    return;
  }

  const stats = computeStats(scoped);

  // Consent gate before any LLM work.
  let persona = undefined;
  if (!args.statsOnly) {
    const s = sample(scoped);
    const ok = args.yes || (await askConsent(s.sampledPrompts));
    if (ok) {
      persona =
        (await analyzePersona(scoped, {
          model: args.model ?? "sonnet",
          onProgress: (line) => log("  " + line),
        })) ?? undefined;
    } else {
      log("Skipping persona analysis (declined). Rendering stats-only.");
    }
  }

  const profile: Profile = {
    meta: {
      version: VERSION,
      generatedAtHint: nowHint(),
      period: period.label,
      eventsParsed: parsed,
      eventsSkipped: skipped,
    },
    stats,
    persona,
  };

  // Habit loop: attach the previous run for "since your last mirror" deltas,
  // then save this run's snapshot. All local (~/.claude-mirror/history.json).
  const historyPath = defaultHistoryPath();
  const history = await loadHistory(historyPath);
  profile.previous = previousSnapshot(history, profile.meta.generatedAtHint);
  try {
    await saveSnapshot(historyPath, snapshotFromProfile(profile));
  } catch {
    /* snapshot failure must never block the report */
  }

  const outDir = args.out ? resolve(args.out) : process.cwd();
  const htmlPath = join(outDir, "mirror-report.html");
  await writeFile(htmlPath, renderReport(profile), "utf8");
  if (args.json) {
    await writeFile(join(outDir, "profile.json"), JSON.stringify(profile, null, 2), "utf8");
  }
  const personaPath = join(outDir, "mirror-persona.md");
  await writeFile(personaPath, buildMirrorPersona(profile), "utf8");

  const teaser = persona
    ? `You're "${persona.archetype.name}" (${persona.archetype.rarity}).`
    : `${stats.totals.prompts.toLocaleString()} prompts across ${period.label}.`;
  log("");
  log(`  ✔ ${teaser}`);
  log(`  ✔ Shareable report: ${htmlPath}`);
  log(`  ✔ Mirror persona:   ${personaPath}`);

  if (args.exportOnly) {
    await openFile(htmlPath);
    return;
  }

  // Default: the live dashboard — brain, stats, and chat with your Mirror.
  await serve(profile, {
    port: args.port,
    onReady: (url) => {
      log(`  ✔ Dashboard: ${url}  (Ctrl+C to stop)`);
      void openFile(url);
    },
  });
}

main().catch((e) => {
  log("Fatal: " + (e instanceof Error ? e.stack ?? e.message : String(e)));
  process.exitCode = 1;
});

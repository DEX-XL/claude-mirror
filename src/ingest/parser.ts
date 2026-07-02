import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import { homedir } from "node:os";
import { join } from "node:path";
import type { NormalizedEvent, TokenCounts } from "../types.js";
import {
  asArray,
  asNumber,
  asObject,
  asString,
  projectBasename,
  toEpochMs,
} from "./accessors.js";
import { extractUserText } from "./text.js";

export type IngestResult = {
  events: NormalizedEvent[];
  parsed: number; // records successfully understood
  skipped: number; // records recognized-but-ignored or unrecognized
  malformed: number; // lines that failed JSON.parse
  files: number;
};

export function defaultProjectsDir(): string {
  return join(homedir(), ".claude", "projects");
}

/** Enumerate every *.jsonl file under the projects dir (one level of subdirs). */
export async function findSessionFiles(projectsDir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(projectsDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(projectsDir, e.name);
    if (e.isDirectory()) {
      let inner;
      try {
        inner = await readdir(full, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const f of inner) {
        if (f.isFile() && f.name.endsWith(".jsonl")) out.push(join(full, f.name));
      }
    } else if (e.isFile() && e.name.endsWith(".jsonl")) {
      out.push(full);
    }
  }
  return out;
}

function tokensFromUsage(usage: Record<string, unknown>): TokenCounts {
  return {
    in: asNumber(usage.input_tokens) ?? 0,
    out: asNumber(usage.output_tokens) ?? 0,
    cacheRead: asNumber(usage.cache_read_input_tokens) ?? 0,
    cacheWrite: asNumber(usage.cache_creation_input_tokens) ?? 0,
  };
}

/**
 * Convert one parsed JSONL record into zero or more NormalizedEvents.
 * Returns { events, recognized }. recognized=false means "unknown record
 * type" so the caller can count it as skipped (never thrown).
 */
export function normalizeRecord(
  o: Record<string, unknown>,
  projectEncoded: string
): { events: NormalizedEvent[]; recognized: boolean } {
  const type = asString(o.type);
  const ts = toEpochMs(o.timestamp);
  const sessionId = asString(o.sessionId) ?? "unknown";
  const project = projectBasename(projectEncoded);
  const events: NormalizedEvent[] = [];

  if (type === "user") {
    // Tool results arrive as user records carrying `toolUseResult`; those are
    // NOT human text. Skip them for `text` but they aren't errors.
    const isToolResult = "toolUseResult" in o;
    const msg = asObject(o.message);
    if (!isToolResult && ts !== undefined) {
      const text = extractUserText(msg.content);
      if (text) {
        events.push({ kind: "user_prompt", ts, sessionId, project, text });
      }
    }
    return { events, recognized: true };
  }

  if (type === "assistant") {
    if (ts === undefined) return { events, recognized: true };
    const msg = asObject(o.message);
    const model = asString(msg.model);
    const usage = asObject(msg.usage);
    events.push({
      kind: "assistant_turn",
      ts,
      sessionId,
      project,
      model: model && model !== "<synthetic>" ? model : model,
      tokens: tokensFromUsage(usage),
    });
    // Emit a tool_call event per tool_use block for tool stats.
    for (const block of asArray(msg.content)) {
      const b = asObject(block);
      if (b.type === "tool_use") {
        const toolName = asString(b.name);
        if (toolName) {
          events.push({ kind: "tool_call", ts, sessionId, project, toolName });
        }
      }
    }
    return { events, recognized: true };
  }

  // Recognized-but-ignored record types (queue-operation, attachment,
  // file-history-snapshot, last-prompt, ai-title, mode, permission-mode,
  // system, summary). Counted as skipped, never fatal.
  return { events, recognized: false };
}

/** Stream one file, never slurping. Malformed lines are counted, not thrown. */
async function ingestFile(
  path: string,
  projectEncoded: string,
  acc: IngestResult
): Promise<void> {
  const rl = createInterface({
    input: createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj: unknown;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      acc.malformed++;
      acc.skipped++;
      continue;
    }
    const rec = asObject(obj);
    const { events, recognized } = normalizeRecord(rec, projectEncoded);
    if (recognized) acc.parsed++;
    else acc.skipped++;
    for (const ev of events) acc.events.push(ev);
  }
}

/** Derive the encoded project name (dir basename) from a file path. */
function projectEncodedFromPath(filePath: string): string {
  const norm = filePath.replace(/\\/g, "/");
  const parts = norm.split("/");
  // .../projects/<encoded>/<session>.jsonl  → the parent dir name
  return parts.length >= 2 ? parts[parts.length - 2] : "unknown";
}

export async function ingest(projectsDir?: string): Promise<IngestResult> {
  const dir = projectsDir ?? defaultProjectsDir();
  const files = await findSessionFiles(dir);
  const acc: IngestResult = {
    events: [],
    parsed: 0,
    skipped: 0,
    malformed: 0,
    files: files.length,
  };
  for (const f of files) {
    try {
      await stat(f);
    } catch {
      continue;
    }
    await ingestFile(f, projectEncodedFromPath(f), acc);
  }
  // Stable chronological order for all downstream analysis.
  acc.events.sort((a, b) => a.ts - b.ts);
  return acc;
}

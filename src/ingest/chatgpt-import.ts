import AdmZip from "adm-zip";
import { readFile } from "node:fs/promises";
import type { NormalizedEvent } from "../types.js";
import { asArray, asNumber, asObject, asString, toEpochMs } from "./accessors.js";

// ChatGPT data export: conversations.json is an array of conversations, each
// with a `mapping` of message nodes:
//   { title, create_time, mapping: { <id>: { message: { author: { role },
//     content: { content_type, parts: [...] }, create_time,
//     metadata: { model_slug } }, parent, children } } }
// Verified against the July-2026 export format; every access is defensive.

export type ImportResult = {
  events: NormalizedEvent[];
  parsed: number;
  skipped: number;
};

function chatgptTs(v: unknown): number | undefined {
  // create_time is unix SECONDS (float) in ChatGPT exports.
  const n = asNumber(v);
  if (n !== undefined) return n > 1e12 ? n : n * 1000;
  return toEpochMs(v);
}

function partsText(content: Record<string, unknown>): string | undefined {
  const parts = asArray(content.parts)
    .map((p) => (typeof p === "string" ? p : asString(asObject(p).text) ?? ""))
    .filter((s) => s.trim().length > 0);
  const joined = parts.join("\n").trim();
  return joined || undefined;
}

function normalizeConversation(conv: Record<string, unknown>): {
  events: NormalizedEvent[];
  parsed: number;
  skipped: number;
} {
  const events: NormalizedEvent[] = [];
  let parsed = 0;
  let skipped = 0;
  const sessionId = asString(conv.id) ?? asString(conv.conversation_id) ?? "chatgpt";
  const project = "ChatGPT";
  const fallbackTs = chatgptTs(conv.create_time);

  const mapping = asObject(conv.mapping);
  for (const key of Object.keys(mapping)) {
    const node = asObject(mapping[key]);
    const message = asObject(node.message);
    if (Object.keys(message).length === 0) continue; // root/system stubs
    const author = asObject(message.author);
    const role = asString(author.role);
    const content = asObject(message.content);
    const contentType = asString(content.content_type);
    const ts = chatgptTs(message.create_time) ?? fallbackTs;
    if (ts === undefined) {
      skipped++;
      continue;
    }
    // Hidden/system/tool noise is not user text.
    const meta = asObject(message.metadata);
    if (meta.is_visually_hidden_from_conversation === true) {
      skipped++;
      continue;
    }
    if (role === "user") {
      const text = contentType === "text" || contentType === "multimodal_text" ? partsText(content) : undefined;
      if (text) {
        events.push({ kind: "user_prompt", ts, sessionId, project, text });
        parsed++;
      } else {
        skipped++;
      }
    } else if (role === "assistant") {
      events.push({
        kind: "assistant_turn",
        ts,
        sessionId,
        project,
        model: asString(meta.model_slug),
      });
      parsed++;
    } else {
      skipped++; // system / tool
    }
  }
  return { events, parsed, skipped };
}

/** True if this parsed payload looks like a ChatGPT export. */
export function looksLikeChatGpt(payload: unknown): boolean {
  const arr = Array.isArray(payload) ? payload : [payload];
  return arr.some((c) => {
    const obj = asObject(c);
    return obj.mapping !== undefined && typeof obj.mapping === "object";
  });
}

export async function importChatGptExport(sourcePath: string): Promise<ImportResult> {
  let texts: string[];
  if (sourcePath.toLowerCase().endsWith(".zip")) {
    const zip = new AdmZip(sourcePath);
    texts = zip
      .getEntries()
      .filter((e) => !e.isDirectory && /conversations\.json$/i.test(e.entryName))
      .map((e) => e.getData().toString("utf8"));
    if (texts.length === 0) {
      texts = zip
        .getEntries()
        .filter((e) => !e.isDirectory && /\.json$/i.test(e.entryName))
        .map((e) => e.getData().toString("utf8"));
    }
  } else {
    texts = [await readFile(sourcePath, "utf8")];
  }

  const events: NormalizedEvent[] = [];
  let parsed = 0;
  let skipped = 0;
  for (const text of texts) {
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      skipped++;
      continue;
    }
    const convs = Array.isArray(payload) ? payload : [payload];
    for (const c of convs) {
      const obj = asObject(c);
      if (!obj.mapping) continue;
      const r = normalizeConversation(obj);
      events.push(...r.events);
      parsed += r.parsed;
      skipped += r.skipped;
    }
  }
  events.sort((a, b) => a.ts - b.ts);
  return { events, parsed, skipped };
}

/**
 * Unified importer: sniffs whether the file is a ChatGPT or claude.ai export
 * and dispatches. This is the only function the CLI needs.
 */
export async function importAnyExport(sourcePath: string): Promise<ImportResult & { source: string }> {
  // Cheap sniff: try ChatGPT first (its `mapping` marker is unambiguous).
  const chatgpt = await importChatGptExport(sourcePath).catch(
    () => ({ events: [], parsed: 0, skipped: 0 }) as ImportResult
  );
  if (chatgpt.events.length > 0) return { ...chatgpt, source: "ChatGPT" };
  const { importClaudeAiExport } = await import("./claudeai-import.js");
  const claude = await importClaudeAiExport(sourcePath);
  return { ...claude, source: "Claude" };
}

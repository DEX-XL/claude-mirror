import AdmZip from "adm-zip";
import { readFile } from "node:fs/promises";
import type { NormalizedEvent } from "../types.js";
import { asArray, asObject, asString, toEpochMs } from "./accessors.js";
import { extractUserText } from "./text.js";

export type ImportResult = {
  events: NormalizedEvent[];
  parsed: number;
  skipped: number;
};

type MessageLike = Record<string, unknown>;

function textFromValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  const obj = asObject(value);
  const text = asString(obj.text) ?? asString(obj.content) ?? asString(obj.message);
  if (text) {
    const trimmed = text.trim();
    return trimmed || undefined;
  }
  return undefined;
}

async function loadPayloadTexts(sourcePath: string): Promise<string[]> {
  if (sourcePath.toLowerCase().endsWith(".zip")) {
    const zip = new AdmZip(sourcePath);
    const entries = zip.getEntries().filter((entry) => !entry.isDirectory && /\.(json|jsonl)$/i.test(entry.entryName));
    return entries.map((entry) => entry.getData().toString("utf8"));
  }
  return [await readFile(sourcePath, "utf8")];
}

function parseJsonPayload(text: string): unknown | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function collectConversationRoots(value: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const seen = new Set<unknown>();

  const walk = (candidate: unknown) => {
    if (Array.isArray(candidate)) {
      for (const item of candidate) walk(item);
      return;
    }
    if (!candidate || typeof candidate !== "object" || seen.has(candidate)) return;
    seen.add(candidate);

    const obj = asObject(candidate);
    if (Array.isArray(obj.conversations)) {
      walk(obj.conversations);
    }

    if (Array.isArray(obj.chat_messages) || Array.isArray(obj.messages)) {
      out.push(obj);
      return;
    }

    for (const key of ["data", "items", "threads", "results"] as const) {
      const nested = obj[key];
      if (Array.isArray(nested)) walk(nested);
    }

    if (asString(obj.uuid) || asString(obj.id) || asString(obj.conversation_uuid)) {
      out.push(obj);
    }
  };

  walk(value);
  return out;
}

function sessionIdForConversation(conversation: Record<string, unknown>): string {
  return asString(conversation.uuid)
    ?? asString(conversation.id)
    ?? asString(conversation.conversation_uuid)
    ?? "claude-ai";
}

function conversationMessages(conversation: Record<string, unknown>): MessageLike[] {
  const primary = asArray(conversation.chat_messages);
  if (primary.length > 0) return primary.map((message) => asObject(message));
  const fallback = asArray(conversation.messages);
  if (fallback.length > 0) return fallback.map((message) => asObject(message));
  return [];
}

function messageTimestamp(message: MessageLike, fallback?: number): number | undefined {
  return toEpochMs(message.created_at)
    ?? toEpochMs(message.timestamp)
    ?? toEpochMs(message.ts)
    ?? fallback;
}

function messageSender(message: MessageLike): string | undefined {
  return asString(message.sender) ?? asString(message.role) ?? asString(message.type);
}

function messageText(message: MessageLike): string | undefined {
  return textFromValue(message.text)
    ?? textFromValue(message.content)
    ?? textFromValue(message.message)
    ?? extractUserText(asArray(message.content));
}

function messageModel(message: MessageLike): string | undefined {
  return asString(message.model) ?? asString(message.assistant_model) ?? asString(message.llm_model);
}

function normalizeConversation(conversation: Record<string, unknown>): { events: NormalizedEvent[]; parsed: number; skipped: number } {
  const sessionId = sessionIdForConversation(conversation);
  const project = "claude.ai";
  const fallbackTs = toEpochMs(conversation.created_at) ?? toEpochMs(conversation.timestamp);
  const events: NormalizedEvent[] = [];
  let parsed = 0;
  let skipped = 0;

  for (const message of conversationMessages(conversation)) {
    const ts = messageTimestamp(message, fallbackTs);
    if (ts === undefined) {
      skipped++;
      continue;
    }

    const sender = messageSender(message);
    const text = messageText(message);

    if (sender === "human" || sender === "user" || sender === "prompt" || sender === "human_message") {
      if (text) {
        events.push({ kind: "user_prompt", ts, sessionId, project, text });
        parsed++;
      } else {
        skipped++;
      }
      continue;
    }

    if (sender === "assistant" || sender === "ai" || sender === "assistant_message") {
      events.push({ kind: "assistant_turn", ts, sessionId, project, model: messageModel(message) });
      parsed++;
      for (const block of asArray(message.content)) {
        const obj = asObject(block);
        if (obj.type === "tool_use") {
          const toolName = asString(obj.name);
          if (toolName) {
            events.push({ kind: "tool_call", ts, sessionId, project, toolName });
          }
        }
      }
      continue;
    }

    if (text) {
      events.push({ kind: "user_prompt", ts, sessionId, project, text });
      parsed++;
    } else {
      skipped++;
    }
  }

  return { events, parsed, skipped };
}

/**
 * Parse a claude.ai export zip or conversations JSON into the same
 * NormalizedEvent[] contract the rest of the pipeline consumes.
 */
export async function importClaudeAiExport(sourcePath: string): Promise<ImportResult> {
  const payloadTexts = await loadPayloadTexts(sourcePath);
  const events: NormalizedEvent[] = [];
  let parsed = 0;
  let skipped = 0;

  for (const payloadText of payloadTexts) {
    const payload = parseJsonPayload(payloadText);
    if (payload === undefined) {
      skipped++;
      continue;
    }

    const roots = collectConversationRoots(payload);
    if (roots.length === 0) {
      skipped++;
      continue;
    }

    for (const root of roots) {
      const normalized = normalizeConversation(root);
      parsed += normalized.parsed;
      skipped += normalized.skipped;
      events.push(...normalized.events);
    }
  }

  events.sort((a, b) => a.ts - b.ts);
  return { events, parsed, skipped };
}

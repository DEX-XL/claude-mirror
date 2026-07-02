import type { NormalizedEvent } from "../types.js";
import { redact } from "./redact.js";

export type Chunk = {
  index: number;
  bucket: "early" | "mid" | "late";
  prompts: string[]; // already redacted
};

export type SampleResult = {
  chunks: Chunk[];
  totalPrompts: number; // total user prompts considered
  sampledPrompts: number;
  droppedDuplicates: number;
};

const MAX_PROMPTS_PER_CHUNK = 150;
const MAX_CHARS_PER_CHUNK = 50_000;
const MIN_PROMPT_LEN = 12; // ignore "yes", "ok", "go" — no signal

function normalizeForDedup(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 200);
}

/**
 * Stratified sample across the whole time range (so growth analysis works),
 * weighted toward longer prompts (more signal), deduped, capped per chunk.
 * Produces up to 3 chunks: early / mid / late thirds of the timeline.
 */
export function sample(events: NormalizedEvent[]): SampleResult {
  const prompts = events
    .filter((e) => e.kind === "user_prompt" && e.text && e.text.length >= MIN_PROMPT_LEN)
    .sort((a, b) => a.ts - b.ts);

  const totalPrompts = prompts.length;
  if (totalPrompts === 0) {
    return { chunks: [], totalPrompts: 0, sampledPrompts: 0, droppedDuplicates: 0 };
  }

  // Split timeline into thirds by position (already time-sorted).
  const third = Math.ceil(prompts.length / 3);
  const buckets: [Chunk["bucket"], NormalizedEvent[]][] = [
    ["early", prompts.slice(0, third)],
    ["mid", prompts.slice(third, third * 2)],
    ["late", prompts.slice(third * 2)],
  ];

  const seen = new Set<string>();
  let dropped = 0;
  let sampled = 0;
  const chunks: Chunk[] = [];

  buckets.forEach(([bucket, evs], i) => {
    // Weight toward longer prompts: sort desc by length, then dedup + cap.
    const ranked = [...evs].sort((a, b) => (b.text!.length - a.text!.length));
    const picked: string[] = [];
    let chars = 0;
    for (const e of ranked) {
      const key = normalizeForDedup(e.text!);
      if (seen.has(key)) {
        dropped++;
        continue;
      }
      seen.add(key);
      const red = redact(e.text!).slice(0, 2000); // clamp any monster prompt
      if (chars + red.length > MAX_CHARS_PER_CHUNK) break;
      if (picked.length >= MAX_PROMPTS_PER_CHUNK) break;
      picked.push(red);
      chars += red.length;
      sampled++;
    }
    if (picked.length > 0) chunks.push({ index: i, bucket, prompts: picked });
  });

  return { chunks, totalPrompts, sampledPrompts: sampled, droppedDuplicates: dropped };
}

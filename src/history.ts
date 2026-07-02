import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Profile, Snapshot } from "./types.js";

// The habit loop: every run saves a small local snapshot so the NEXT run can
// show "since your last mirror" deltas. Stays on disk, never leaves the machine.

export function defaultHistoryPath(): string {
  return join(homedir(), ".claude-mirror", "history.json");
}

export async function loadHistory(path: string): Promise<Snapshot[]> {
  try {
    const raw = await readFile(path, "utf8");
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function snapshotFromProfile(profile: Profile): Snapshot {
  return {
    date: profile.meta.generatedAtHint,
    period: profile.meta.period,
    prompts: profile.stats.totals.prompts,
    hours: profile.stats.totals.estimatedHours,
    archetypeId: profile.persona?.archetype.id,
    traits: profile.persona?.traits.map((t) => ({ axis: t.axis, score: t.score })),
  };
}

/** Append (or replace same-day) snapshot; keep the most recent 60. */
export async function saveSnapshot(path: string, snap: Snapshot): Promise<void> {
  const history = await loadHistory(path);
  const filtered = history.filter((s) => s.date !== snap.date);
  filtered.push(snap);
  const trimmed = filtered.slice(-60);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(trimmed, null, 2), "utf8");
}

/** Most recent snapshot from a day BEFORE `today` (same-day reruns don't count). */
export function previousSnapshot(history: Snapshot[], today: string): Snapshot | undefined {
  const prior = history.filter((s) => s.date < today).sort((a, b) => (a.date < b.date ? -1 : 1));
  return prior[prior.length - 1];
}

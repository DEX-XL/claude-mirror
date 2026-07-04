import { describe, it, expect } from "vitest";
import { computeStats } from "../src/stats/engine.js";
import { loadConfig, saveConfig } from "../src/history.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NormalizedEvent } from "../src/types.js";

const promptAt = (ts: number): NormalizedEvent => ({
  kind: "user_prompt",
  ts,
  sessionId: "s",
  project: "p",
  text: "a prompt with enough length in it",
});

const day = (offsetFromNow: number, now: number) => now - offsetFromNow * 24 * 3600_000;

describe("habit engine", () => {
  const now = new Date(2026, 6, 4, 15).getTime(); // local Sat 2026-07-04

  it("computes current streak with 1-day grace", () => {
    // active yesterday, day before, and 2 before that → streak 3 (today inactive)
    const evs = [promptAt(day(1, now)), promptAt(day(2, now)), promptAt(day(3, now))];
    const s = computeStats(evs, now);
    expect(s.currentStreakDays).toBe(3);
  });

  it("breaks the streak after a gap beyond grace", () => {
    const evs = [promptAt(day(3, now)), promptAt(day(4, now))];
    const s = computeStats(evs, now);
    expect(s.currentStreakDays).toBe(0);
  });

  it("aggregates the last 12 weeks, current week last", () => {
    const evs = [promptAt(now), promptAt(now - 3600_000), promptAt(day(8, now))];
    const s = computeStats(evs, now);
    expect(s.weekly).toHaveLength(12);
    const thisWk = s.weekly[s.weekly.length - 1];
    expect(thisWk.prompts).toBe(2);
    expect(thisWk.activeDays).toBe(1);
    // the prompt 8 days ago lands in an earlier week
    expect(s.weekly.slice(0, 11).some((w) => w.prompts === 1)).toBe(true);
  });
});

describe("habit config", () => {
  it("defaults, saves, clamps", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cm-cfg-"));
    const f = join(dir, "config.json");
    expect((await loadConfig(f)).weeklyActiveDaysGoal).toBe(5); // missing file → default
    await saveConfig(f, { weeklyActiveDaysGoal: 3 });
    expect((await loadConfig(f)).weeklyActiveDaysGoal).toBe(3);
    await saveConfig(f, { weeklyActiveDaysGoal: 99 } as any);
    expect((await loadConfig(f)).weeklyActiveDaysGoal).toBe(5); // out of range → default
    await rm(dir, { recursive: true, force: true });
  });
});

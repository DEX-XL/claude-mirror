import { describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadHistory, saveSnapshot, previousSnapshot } from "../src/history.js";
import type { Snapshot } from "../src/types.js";

const snap = (date: string, prompts = 10): Snapshot => ({
  date,
  period: "all time",
  prompts,
  hours: 5,
});

describe("history", () => {
  it("saves, replaces same-day, and finds the previous snapshot", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cm-hist-"));
    const file = join(dir, "history.json");
    await saveSnapshot(file, snap("2026-06-01", 100));
    await saveSnapshot(file, snap("2026-07-01", 150));
    await saveSnapshot(file, snap("2026-07-01", 160)); // same-day rerun replaces
    const h = await loadHistory(file);
    expect(h).toHaveLength(2);
    expect(h[1].prompts).toBe(160);
    // previous = most recent BEFORE today (same-day doesn't count)
    expect(previousSnapshot(h, "2026-07-01")?.date).toBe("2026-06-01");
    expect(previousSnapshot(h, "2026-05-01")).toBeUndefined();
    await rm(dir, { recursive: true, force: true });
  });
  it("returns [] for a missing file", async () => {
    expect(await loadHistory(join(tmpdir(), "cm-none", "nope.json"))).toEqual([]);
  });
});

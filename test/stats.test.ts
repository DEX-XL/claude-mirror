import { describe, it, expect } from "vitest";
import { computeStats } from "../src/stats/engine.js";
import { resolvePeriod, filterByPeriod } from "../src/stats/period.js";
import { countPhrase, isCorrection } from "../src/stats/quirks.js";
import type { NormalizedEvent } from "../src/types.js";

const ev = (o: Partial<NormalizedEvent>): NormalizedEvent => ({
  kind: "user_prompt",
  ts: Date.UTC(2026, 0, 2, 10),
  sessionId: "s1",
  project: "proj",
  ...o,
});

describe("quirks", () => {
  it("counts phrases on word boundaries", () => {
    expect(countPhrase(["actually yes, actually no", "factually"], "actually")).toBe(2);
  });
  it("detects corrections by opener", () => {
    expect(isCorrection("no, use email")).toBe(true);
    expect(isCorrection("wait let me think")).toBe(true);
    expect(isCorrection("build the form")).toBe(false);
  });
});

describe("period resolution", () => {
  it("resolves a year", () => {
    const p = resolvePeriod("2026", Date.UTC(2026, 5, 1));
    expect(p.label).toBe("2026");
    const inside = filterByPeriod([ev({ ts: Date.UTC(2026, 3, 1) })], p);
    const outside = filterByPeriod([ev({ ts: Date.UTC(2025, 3, 1) })], p);
    expect(inside).toHaveLength(1);
    expect(outside).toHaveLength(0);
  });
  it("all captures everything", () => {
    const p = resolvePeriod("all", Date.UTC(2026, 5, 1));
    expect(filterByPeriod([ev({ ts: 0 })], p)).toHaveLength(1);
  });
});

describe("computeStats", () => {
  // Use LOCAL time constructors — golden hour is intentionally local-tz.
  const at = (h: number, m = 0) => new Date(2026, 0, 2, h, m).getTime();
  const events: NormalizedEvent[] = [
    ev({ text: "Build a login form please", ts: at(23) }),
    ev({ text: "No wait, actually use email?", ts: at(23, 5) }),
    { kind: "assistant_turn", ts: at(23, 1), sessionId: "s1", project: "proj", model: "claude-opus-4-8", tokens: { in: 100, out: 50, cacheRead: 0, cacheWrite: 0 } },
    { kind: "tool_call", ts: at(23, 2), sessionId: "s1", project: "proj", toolName: "Edit" },
    { kind: "tool_call", ts: at(23, 3), sessionId: "s1", project: "proj", toolName: "Read" },
    { kind: "tool_call", ts: at(23, 4), sessionId: "s1", project: "proj", toolName: "Read" },
  ];
  const s = computeStats(events);

  it("counts totals", () => {
    expect(s.totals.prompts).toBe(2);
    expect(s.totals.assistantTurns).toBe(1);
    expect(s.totals.tokensIn).toBe(100);
    expect(s.totals.sessions).toBe(1);
  });
  it("computes conversation style", () => {
    expect(s.conversationStyle.politenessMarkers).toBeGreaterThanOrEqual(1); // "please"
    expect(s.conversationStyle.correctionRate).toBeCloseTo(0.5, 5); // 1 of 2 opens with "no"
    expect(s.conversationStyle.questionRatio).toBeCloseTo(0.5, 5);
    const actually = s.conversationStyle.quirks.find((q) => q.phrase === "actually");
    expect(actually?.count).toBe(1);
  });
  it("computes tools edit/read ratio", () => {
    expect(s.tools.editReadRatio).toBeCloseTo(0.5, 5); // 1 edit / 2 reads
  });
  it("picks ride-or-die model", () => {
    expect(s.models.rideOrDie).toBe("claude-opus-4-8");
  });
  it("finds golden hour at 23", () => {
    expect(s.rhythm.goldenHour).toBe(23);
  });
  it("emits a zero-filled daily series", () => {
    const multi = [...events, ev({ text: "another day prompt here", ts: at(23) + 3 * 24 * 3600_000 })];
    const s2 = computeStats(multi);
    expect(s2.daily).toHaveLength(4); // day 0..3 inclusive, zero-filled between
    expect(s2.daily[1].prompts).toBe(0);
    expect(s2.daily[3].prompts).toBe(1);
  });
});

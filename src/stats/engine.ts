import type { NormalizedEvent, StatsProfile } from "../types.js";
import {
  QUIRK_PHRASES,
  POLITENESS_MARKERS,
  countPhrase,
  isCorrection,
  isQuestion,
} from "./quirks.js";

const IDLE_CAP_MS = 15 * 60 * 1000; // cap idle gaps at 15 min for hour estimate
const TEST_TOOL_HINTS = ["test", "vitest", "jest", "pytest"];

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/**
 * Estimate active hours by stitching consecutive events within a session,
 * capping any single idle gap at IDLE_CAP_MS so an overnight pause doesn't
 * count as 8 hours of work.
 */
function estimateHours(events: NormalizedEvent[]): number {
  const bySession = new Map<string, number[]>();
  for (const e of events) {
    const arr = bySession.get(e.sessionId) ?? [];
    arr.push(e.ts);
    bySession.set(e.sessionId, arr);
  }
  let totalMs = 0;
  for (const times of bySession.values()) {
    times.sort((a, b) => a - b);
    for (let i = 1; i < times.length; i++) {
      totalMs += Math.min(times[i] - times[i - 1], IDLE_CAP_MS);
    }
  }
  return totalMs / (1000 * 60 * 60);
}

function longestStreak(dayKeys: Set<string>): number {
  if (dayKeys.size === 0) return 0;
  const days = [...dayKeys]
    .map((k) => new Date(k + "T00:00:00").getTime())
    .sort((a, b) => a - b);
  const DAY = 24 * 60 * 60 * 1000;
  let best = 1;
  let cur = 1;
  for (let i = 1; i < days.length; i++) {
    const diff = Math.round((days[i] - days[i - 1]) / DAY);
    if (diff === 1) cur++;
    else if (diff > 1) cur = 1;
    best = Math.max(best, cur);
  }
  return best;
}

/** Monday-start week key for a timestamp, as YYYY-MM-DD (local time). */
function weekStart(ts: number): string {
  const d = new Date(ts);
  const day = (d.getDay() + 6) % 7; // Mon=0
  const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  return dayKey(mon.getTime());
}

/**
 * `nowMs` anchors the habit metrics (current streak, last-12-weeks window).
 * Still pure: same inputs → same output.
 */
export function computeStats(events: NormalizedEvent[], nowMs?: number): StatsProfile {
  const prompts = events.filter((e) => e.kind === "user_prompt");
  const asst = events.filter((e) => e.kind === "assistant_turn");
  const tools = events.filter((e) => e.kind === "tool_call");
  const promptTexts = prompts.map((p) => p.text ?? "");

  // ---- Totals ----
  const sessions = new Set(events.map((e) => e.sessionId));
  let tokensIn = 0;
  let tokensOut = 0;
  for (const a of asst) {
    tokensIn += a.tokens?.in ?? 0;
    tokensOut += a.tokens?.out ?? 0;
  }

  // ---- Rhythm ----
  const hourHistogram = new Array(24).fill(0);
  const dayHistogram = new Array(7).fill(0);
  let latestNight: { hour: number; ts: number } | null = null;
  const dayKeys = new Set<string>();
  for (const p of prompts) {
    const d = new Date(p.ts);
    hourHistogram[d.getHours()]++;
    dayHistogram[d.getDay()]++;
    dayKeys.add(dayKey(p.ts));
    // "Latest night" ranks the deepest post-midnight hour (0-4 is latest).
    const h = d.getHours();
    const nightRank = (hr: number) => (hr < 5 ? hr + 24 : hr); // 1am=25 > 11pm=23
    if (!latestNight || nightRank(h) > nightRank(latestNight.hour)) {
      if (h < 5 || h >= 22) latestNight = { hour: h, ts: p.ts };
    }
  }
  const goldenHour = hourHistogram.indexOf(Math.max(...hourHistogram, 0));

  // ---- Projects ----
  const projTime = new Map<string, { prompts: number; first: number; last: number }>();
  for (const p of prompts) {
    const cur = projTime.get(p.project) ?? { prompts: 0, first: p.ts, last: p.ts };
    cur.prompts++;
    cur.first = Math.min(cur.first, p.ts);
    cur.last = Math.max(cur.last, p.ts);
    projTime.set(p.project, cur);
  }
  const topProjects = [...projTime.entries()]
    .map(([name, v]) => ({ name, prompts: v.prompts, ms: v.last - v.first }))
    .sort((a, b) => b.prompts - a.prompts)
    .slice(0, 8);
  // Project-switch rate: consecutive prompts landing in different projects.
  const sortedPrompts = [...prompts].sort((a, b) => a.ts - b.ts);
  let switches = 0;
  for (let i = 1; i < sortedPrompts.length; i++) {
    if (sortedPrompts[i].project !== sortedPrompts[i - 1].project) switches++;
  }
  const activeDays = Math.max(1, dayKeys.size);
  const switchRate = switches / activeDays;

  // ---- Models ----
  const modelCount = new Map<string, number>();
  for (const a of asst) {
    if (!a.model || a.model === "<synthetic>") continue;
    modelCount.set(a.model, (modelCount.get(a.model) ?? 0) + 1);
  }
  const modelSplit = [...modelCount.entries()]
    .map(([model, turns]) => ({ model, turns }))
    .sort((a, b) => b.turns - a.turns);
  const rideOrDie = modelSplit[0]?.model ?? null;

  // ---- Tools ----
  const toolCount = new Map<string, number>();
  for (const t of tools) {
    if (!t.toolName) continue;
    toolCount.set(t.toolName, (toolCount.get(t.toolName) ?? 0) + 1);
  }
  const topTools = [...toolCount.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  const edits = toolCount.get("Edit") ?? 0;
  const reads = toolCount.get("Read") ?? 0;
  const editReadRatio = reads > 0 ? Number((edits / reads).toFixed(2)) : null;
  let testRuns = 0;
  for (const [name, count] of toolCount) {
    if (TEST_TOOL_HINTS.some((h) => name.toLowerCase().includes(h))) testRuns += count;
  }
  const pairCount = new Map<string, number>();
  for (const t of tools) {
    if (!t.toolName) continue;
    const k = `${t.project}	${t.toolName}`;
    pairCount.set(k, (pairCount.get(k) ?? 0) + 1);
  }
  const byProject = [...pairCount.entries()]
    .map(([k, count]) => {
      const [project, name] = k.split("	");
      return { project, name, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 40);

  // ---- Conversation style ----
  const lengths = promptTexts.map((t) => t.length);
  const medianPromptLength = median(lengths);
  const questions = promptTexts.filter(isQuestion).length;
  const questionRatio = prompts.length ? Number((questions / prompts.length).toFixed(3)) : 0;
  let politenessMarkers = 0;
  for (const m of POLITENESS_MARKERS) politenessMarkers += countPhrase(promptTexts, m);
  const corrections = promptTexts.filter(isCorrection).length;
  const correctionRate = prompts.length
    ? Number((corrections / prompts.length).toFixed(3))
    : 0;
  const quirks = QUIRK_PHRASES.map((phrase) => ({
    phrase,
    count: countPhrase(promptTexts, phrase),
  }))
    .filter((q) => q.count > 0)
    .sort((a, b) => b.count - a.count);

  // ---- Records ----
  const sessionSpan = new Map<string, { first: number; last: number }>();
  for (const e of events) {
    const cur = sessionSpan.get(e.sessionId) ?? { first: e.ts, last: e.ts };
    cur.first = Math.min(cur.first, e.ts);
    cur.last = Math.max(cur.last, e.ts);
    sessionSpan.set(e.sessionId, cur);
  }
  let longestSessionMs = 0;
  for (const s of sessionSpan.values())
    longestSessionMs = Math.max(longestSessionMs, s.last - s.first);
  const perDay = new Map<string, number>();
  for (const p of prompts) perDay.set(dayKey(p.ts), (perDay.get(dayKey(p.ts)) ?? 0) + 1);
  let biggestDay: { date: string; prompts: number } | null = null;
  for (const [date, count] of perDay) {
    if (!biggestDay || count > biggestDay.prompts) biggestDay = { date, prompts: count };
  }
  const promptsBefore9am = prompts.filter((p) => new Date(p.ts).getHours() < 9).length;

  // ---- Daily series (zero-filled, capped at the most recent 365 days) ----
  const daily: { date: string; prompts: number }[] = [];
  if (perDay.size > 0) {
    const keys = [...perDay.keys()].sort();
    const DAY = 24 * 60 * 60 * 1000;
    let start = new Date(keys[0] + "T00:00:00").getTime();
    const end = new Date(keys[keys.length - 1] + "T00:00:00").getTime();
    if ((end - start) / DAY > 365) start = end - 365 * DAY;
    for (let t = start; t <= end; t += DAY) {
      const k = dayKey(t);
      daily.push({ date: k, prompts: perDay.get(k) ?? 0 });
    }
  }

  // ---- Habit engine: weekly aggregates + current streak ----
  const anchor = nowMs ?? (events.length ? events[events.length - 1].ts : 0);
  const DAY_MS = 24 * 60 * 60 * 1000;
  const weekly: { weekStart: string; prompts: number; activeDays: number }[] = [];
  if (anchor > 0) {
    const thisWeek = weekStart(anchor);
    const thisWeekTs = new Date(thisWeek + "T00:00:00").getTime();
    const byWeek = new Map<string, { prompts: number; days: Set<string> }>();
    for (const p of prompts) {
      const wk = weekStart(p.ts);
      const cur = byWeek.get(wk) ?? { prompts: 0, days: new Set<string>() };
      cur.prompts++;
      cur.days.add(dayKey(p.ts));
      byWeek.set(wk, cur);
    }
    for (let i = 11; i >= 0; i--) {
      const wkTs = thisWeekTs - i * 7 * DAY_MS;
      const wk = dayKey(wkTs);
      const v = byWeek.get(wk);
      weekly.push({ weekStart: wk, prompts: v?.prompts ?? 0, activeDays: v?.days.size ?? 0 });
    }
  }
  let currentStreakDays = 0;
  if (anchor > 0 && dayKeys.size > 0) {
    // Walk back from today; today itself may be inactive (grace of 1 day).
    let t = new Date(dayKey(anchor) + "T00:00:00").getTime();
    if (!dayKeys.has(dayKey(t))) t -= DAY_MS;
    while (dayKeys.has(dayKey(t))) {
      currentStreakDays++;
      t -= DAY_MS;
    }
  }

  return {
    totals: {
      sessions: sessions.size,
      prompts: prompts.length,
      assistantTurns: asst.length,
      tokensIn,
      tokensOut,
      estimatedHours: Number(estimateHours(events).toFixed(1)),
    },
    rhythm: {
      hourHistogram,
      dayHistogram,
      goldenHour: goldenHour < 0 ? 0 : goldenHour,
      longestStreakDays: longestStreak(dayKeys),
      latestNight,
    },
    projects: { top: topProjects, switchRate: Number(switchRate.toFixed(2)) },
    models: { split: modelSplit, rideOrDie },
    tools: { top: topTools, editReadRatio, testRuns, byProject },
    conversationStyle: {
      medianPromptLength,
      questionRatio,
      politenessMarkers,
      correctionRate,
      quirks,
    },
    records: { longestSessionMs, biggestDay, promptsBefore9am },
    daily,
    weekly,
    currentStreakDays,
  };
}

import type { NormalizedEvent } from "../types.js";

export type Period = { label: string; startMs: number; endMs: number };

/**
 * Resolve a period spec against a reference "now" (passed in, never read from
 * the clock here — keeps analysis deterministic/testable).
 *   "all"  → everything
 *   "YYYY" → that calendar year
 *   "Nm"   → last N months
 *   default → current year of `nowMs`
 */
export function resolvePeriod(spec: string | undefined, nowMs: number): Period {
  const now = new Date(nowMs);
  if (!spec || spec === "year") {
    const y = now.getUTCFullYear();
    return {
      label: String(y),
      startMs: Date.UTC(y, 0, 1),
      endMs: Date.UTC(y + 1, 0, 1),
    };
  }
  if (spec === "all") {
    return { label: "all time", startMs: 0, endMs: Number.MAX_SAFE_INTEGER };
  }
  const yearMatch = /^(\d{4})$/.exec(spec);
  if (yearMatch) {
    const y = Number(yearMatch[1]);
    return {
      label: String(y),
      startMs: Date.UTC(y, 0, 1),
      endMs: Date.UTC(y + 1, 0, 1),
    };
  }
  const monthsMatch = /^(\d+)m$/.exec(spec);
  if (monthsMatch) {
    const n = Number(monthsMatch[1]);
    const end = nowMs;
    const start = new Date(now);
    start.setUTCMonth(start.getUTCMonth() - n);
    return { label: `last ${n} months`, startMs: start.getTime(), endMs: end };
  }
  // Unknown spec: fall back to current year.
  const y = now.getUTCFullYear();
  return {
    label: String(y),
    startMs: Date.UTC(y, 0, 1),
    endMs: Date.UTC(y + 1, 0, 1),
  };
}

export function filterByPeriod(
  events: NormalizedEvent[],
  period: Period
): NormalizedEvent[] {
  return events.filter((e) => e.ts >= period.startMs && e.ts < period.endMs);
}

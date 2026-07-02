// Core data contracts shared across ingest → analyze → render.
// Keep this file dependency-free; it's the interface everything agrees on.

export type EventKind =
  | "user_prompt"
  | "assistant_turn"
  | "tool_call"
  | "session_start";

export type TokenCounts = {
  in: number;
  out: number;
  cacheRead: number;
  cacheWrite: number;
};

/**
 * The single normalized record every downstream layer consumes.
 * Ingest is the ONLY producer. `text` is populated ONLY for genuine
 * user-typed prompts (never tool output, file contents, or assistant text).
 */
export type NormalizedEvent = {
  kind: EventKind;
  ts: number; // epoch ms
  sessionId: string;
  project: string; // decoded, then anonymized to basename
  text?: string; // user-authored text ONLY (see privacy rules)
  model?: string;
  tokens?: TokenCounts;
  toolName?: string;
};

// ---- Analysis output fragments -------------------------------------------

export type StatsProfile = {
  totals: {
    sessions: number;
    prompts: number;
    assistantTurns: number;
    tokensIn: number;
    tokensOut: number;
    estimatedHours: number;
  };
  rhythm: {
    hourHistogram: number[]; // length 24
    dayHistogram: number[]; // length 7, 0 = Sunday
    goldenHour: number; // 0-23, the peak hour
    longestStreakDays: number;
    latestNight: { hour: number; ts: number } | null;
  };
  projects: {
    top: { name: string; prompts: number; ms: number }[];
    switchRate: number; // avg project switches per active day
  };
  models: {
    split: { model: string; turns: number }[];
    rideOrDie: string | null;
  };
  tools: {
    top: { name: string; count: number }[];
    editReadRatio: number | null;
    testRuns: number;
  };
  conversationStyle: {
    medianPromptLength: number;
    questionRatio: number;
    politenessMarkers: number;
    correctionRate: number;
    quirks: { phrase: string; count: number }[];
  };
  records: {
    longestSessionMs: number;
    biggestDay: { date: string; prompts: number } | null;
    promptsBefore9am: number;
  };
  /** Zero-filled prompts-per-day series for the usage chart. */
  daily: { date: string; prompts: number }[];
};

export type TraitAxis =
  | "curiosity"
  | "precision"
  | "persistence"
  | "trust"
  | "expression";

export type TraitScore = {
  axis: TraitAxis;
  score: number; // 0-100
  pole: string; // the named pole this position reads as
  evidence: string; // short redacted quote or behavioral count
};

export type PersonaProfile = {
  /** Plain-English AI summary of the user's history: what they did, how, in simple sentences. */
  summary: string;
  /** The kinds of projects/work the user actually did. */
  projectTypes: { label: string; detail: string }[];
  /** 2-3 practical, specific tips to get better results from AI. */
  improvements: string[];
  /** Estimated task mix from sampled prompts, as percentages summing ~100. */
  taskMix: { label: string; pct: number }[];
  traits: TraitScore[];
  archetype: {
    id: string;
    name: string;
    icon: string;
    color: string;
    description: string;
    rarity: string;
  };
  signatureHabits: string[]; // 3
  evidenceQuotes: { quote: string; reveals: string }[]; // 2-3
  growthNarrative: string; // 3 sentences
  roast: string; // exactly one gentle roast
  generatedBy: "claude-cli" | "api" | "none";
};

/** One saved run, used for "since your last mirror" deltas. */
export type Snapshot = {
  date: string; // YYYY-MM-DD
  period: string;
  prompts: number;
  hours: number;
  archetypeId?: string;
  traits?: { axis: TraitAxis; score: number }[];
};

export type Profile = {
  meta: {
    version: string;
    generatedAtHint: string; // caller-stamped; ingest never reads the clock
    period: string;
    eventsParsed: number;
    eventsSkipped: number;
  };
  stats: StatsProfile;
  persona?: PersonaProfile; // absent in --stats-only or on degradation
  previous?: Snapshot; // most recent prior run, for delta display
};

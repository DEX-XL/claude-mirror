import { describe, it, expect } from "vitest";
import { buildGraph } from "../src/render/brain.js";
import { importChatGptExport, looksLikeChatGpt } from "../src/ingest/chatgpt-import.js";
import { buildMirrorPersona } from "../src/persona/mirror.js";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Profile } from "../src/types.js";

const baseStats = {
  totals: { sessions: 2, prompts: 10, assistantTurns: 20, tokensIn: 100, tokensOut: 200, estimatedHours: 3 },
  rhythm: { hourHistogram: new Array(24).fill(0), dayHistogram: new Array(7).fill(0), goldenHour: 22, longestStreakDays: 2, latestNight: null },
  projects: { top: [{ name: "shop", prompts: 8, ms: 1000 }], switchRate: 0.5 },
  models: { split: [], rideOrDie: null },
  tools: { top: [{ name: "Edit", count: 5 }], editReadRatio: null, testRuns: 0, byProject: [{ project: "shop", name: "Edit", count: 5 }] },
  conversationStyle: { medianPromptLength: 50, questionRatio: 0.2, politenessMarkers: 3, correctionRate: 0.1, quirks: [{ phrase: "actually", count: 4 }] },
  records: { longestSessionMs: 0, biggestDay: null, promptsBefore9am: 0 },
  daily: [],
};

const profile: Profile = {
  meta: { version: "t", generatedAtHint: "2026-07-04", period: "all", eventsParsed: 1, eventsSkipped: 0 },
  stats: baseStats as any,
  persona: {
    summary: "s",
    projectTypes: [{ label: "Shop tools", detail: "built shop stuff" }],
    improvements: ["a", "b"],
    taskMix: [{ label: "Work & building", pct: 90 }],
    traits: [
      { axis: "curiosity", score: 40, pole: "Focused", evidence: "e1" },
      { axis: "precision", score: 30, pole: "Fast-mover", evidence: "e2" },
      { axis: "persistence", score: 80, pole: "Bulldog", evidence: "e3" },
      { axis: "trust", score: 70, pole: "Delegator", evidence: "e4" },
      { axis: "expression", score: 25, pole: "Minimalist", evidence: "e5" },
    ],
    archetype: { id: "x", name: "The Tester", icon: "T", color: "#3987e5", description: "d", rarity: "~1%" },
    signatureHabits: ["h1", "h2"],
    evidenceQuotes: [{ quote: "q", reveals: "trust" }],
    growthNarrative: "g",
    roast: "r",
    generatedBy: "claude-cli",
  },
};

describe("brain graph", () => {
  it("builds center + categories with valid links", () => {
    const g = buildGraph(profile);
    const ids = new Set(g.nodes.map((n) => n.id));
    expect(ids.has("you")).toBe(true);
    expect(ids.has("proj:shop")).toBe(true);
    expect(ids.has("tool:Edit")).toBe(true);
    expect(ids.has("trait:persistence")).toBe(true);
    // tool cross-links to its project, not to center
    expect(g.links.some((l) => l.s === "proj:shop" && l.t === "tool:Edit")).toBe(true);
    // every link endpoint exists
    for (const l of g.links) {
      expect(ids.has(l.s)).toBe(true);
      expect(ids.has(l.t)).toBe(true);
    }
  });
});

describe("mirror persona prompt", () => {
  it("embeds traits, quirks, and rules", () => {
    const md = buildMirrorPersona(profile);
    expect(md).toContain("The Tester");
    expect(md).toContain("persistence: 80/100");
    expect(md).toContain('says "actually" often (4×)');
    expect(md).toContain("Stay in character");
  });
});

describe("chatgpt import", () => {
  const conv = {
    id: "c1",
    title: "test",
    create_time: 1767225600.5,
    mapping: {
      root: { message: null, parent: null, children: ["m1"] },
      m1: {
        message: {
          author: { role: "user" },
          content: { content_type: "text", parts: ["hello from chatgpt export"] },
          create_time: 1767225601.0,
        },
        parent: "root",
        children: ["m2"],
      },
      m2: {
        message: {
          author: { role: "assistant" },
          content: { content_type: "text", parts: ["hi"] },
          create_time: 1767225602.0,
          metadata: { model_slug: "gpt-5" },
        },
        parent: "m1",
        children: [],
      },
    },
  };
  it("sniffs and parses the mapping format", async () => {
    expect(looksLikeChatGpt([conv])).toBe(true);
    const dir = await mkdtemp(join(tmpdir(), "cm-cg-"));
    const f = join(dir, "conversations.json");
    await writeFile(f, JSON.stringify([conv]), "utf8");
    const r = await importChatGptExport(f);
    expect(r.events.filter((e) => e.kind === "user_prompt")).toHaveLength(1);
    expect(r.events[0].text).toBe("hello from chatgpt export");
    expect(r.events.find((e) => e.kind === "assistant_turn")?.model).toBe("gpt-5");
    // seconds → ms conversion
    expect(r.events[0].ts).toBeGreaterThan(1e12);
    await rm(dir, { recursive: true, force: true });
  });
});

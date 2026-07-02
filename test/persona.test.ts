import { describe, it, expect } from "vitest";
import { sample } from "../src/persona/sampler.js";
import { extractJson } from "../src/persona/runner.js";
import { analyzePersona } from "../src/persona/engine.js";
import { ReduceResultSchema } from "../src/persona/schema.js";
import type { NormalizedEvent } from "../src/types.js";

function prompts(n: number): NormalizedEvent[] {
  const out: NormalizedEvent[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      kind: "user_prompt",
      ts: Date.UTC(2026, 0, 1) + i * 3600_000,
      sessionId: "s",
      project: "p",
      text: `This is a distinct sampled prompt number ${i} with real length`,
    });
  }
  return out;
}

describe("sampler", () => {
  it("stratifies into up to 3 buckets and dedupes", () => {
    const evs = prompts(30);
    // add duplicates
    evs.push({ ...evs[0] });
    const r = sample(evs);
    expect(r.chunks.length).toBeLessThanOrEqual(3);
    expect(r.chunks.map((c) => c.bucket)).toContain("early");
    expect(r.sampledPrompts).toBeGreaterThan(0);
    expect(r.droppedDuplicates).toBeGreaterThanOrEqual(1);
  });
  it("returns empty for no prompts", () => {
    expect(sample([]).chunks).toHaveLength(0);
  });
});

describe("extractJson", () => {
  it("pulls JSON from fenced output", () => {
    expect(extractJson('prose ```json\n{"a":1}\n``` more')).toBe('{"a":1}');
  });
  it("pulls balanced JSON with nested braces & strings", () => {
    expect(extractJson('x {"a":{"b":"}"},"c":2} y')).toBe('{"a":{"b":"}"},"c":2}');
  });
  it("returns null when no JSON", () => {
    expect(extractJson("no json here")).toBeNull();
  });
});

describe("analyzePersona degradation", () => {
  it("returns null with backend:none, never throws", async () => {
    const r = await analyzePersona(prompts(10), { backend: "none" });
    expect(r).toBeNull();
  });
});

describe("reduce schema", () => {
  it("rejects an unknown archetype id", () => {
    const bad = {
      traits: Array.from({ length: 5 }, (_, i) => ({
        axis: ["curiosity", "precision", "persistence", "trust", "expression"][i],
        score: 50,
        pole: "Explorer",
        evidence: "x",
      })),
      archetypeId: "not-a-real-archetype",
      signatureHabits: ["a"],
      evidenceQuotes: [{ quote: "q", reveals: "curiosity" }],
      growthNarrative: "a. b. c.",
      roast: "one line",
    };
    expect(ReduceResultSchema.safeParse(bad).success).toBe(false);
  });
});

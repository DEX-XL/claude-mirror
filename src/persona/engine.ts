import type { NormalizedEvent, PersonaProfile } from "../types.js";
import { sample } from "./sampler.js";
import {
  detectBackend,
  extractJson,
  runModel,
  type LlmBackend,
} from "./runner.js";
import {
  mapSystemPrompt,
  mapUserPrompt,
  reduceSystemPrompt,
  reduceUserPrompt,
} from "./prompts.js";
import { MapResultSchema, ReduceResultSchema, type MapResult } from "./schema.js";
import { archetypeById } from "./archetypes.js";

export type PersonaOptions = {
  model?: string;
  onProgress?: (line: string) => void;
  backend?: LlmBackend; // override for tests
};

/** Validate model output as JSON+Zod; one retry with the error appended. */
async function callValidated<T>(
  backend: LlmBackend,
  system: string,
  user: string,
  parse: (raw: unknown) => T,
  model?: string
): Promise<T> {
  const attempt = async (extra: string): Promise<T> => {
    const text = await runModel(backend, system, user + extra, { model });
    const json = extractJson(text);
    if (!json) throw new Error("no JSON found in model output");
    return parse(JSON.parse(json));
  };
  try {
    return await attempt("");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return attempt(
      `\n\nYour previous response could not be parsed (${msg}). Return STRICT valid JSON only, no prose, no fences.`
    );
  }
}

/**
 * Full map/reduce persona pipeline. Never throws to the caller — on any
 * failure (no backend, model error, unparseable output twice) it returns
 * null so the report degrades to stats-only.
 */
export async function analyzePersona(
  events: NormalizedEvent[],
  opts: PersonaOptions = {}
): Promise<PersonaProfile | null> {
  const progress = opts.onProgress ?? (() => {});
  const backend = opts.backend ?? (await detectBackend());
  if (backend === "none") {
    progress("No Claude CLI or API key found — skipping persona analysis.");
    return null;
  }

  const { chunks } = sample(events);
  if (chunks.length === 0) {
    progress("Not enough user prompts to build a persona.");
    return null;
  }

  try {
    // ---- MAP ----
    const mapResults: { bucket: string; result: MapResult }[] = [];
    const rotate = [
      "Reading your 2am questions…",
      "Counting how often you said 'actually'…",
      "Weighing your corrections against your praise…",
    ];
    for (let i = 0; i < chunks.length; i++) {
      progress(rotate[i % rotate.length]);
      const result = await callValidated(
        backend,
        mapSystemPrompt(),
        mapUserPrompt(chunks[i]),
        (raw) => MapResultSchema.parse(raw),
        opts.model
      );
      mapResults.push({ bucket: chunks[i].bucket, result });
    }

    // ---- REDUCE ----
    progress("Holding up the mirror…");
    const reduced = await callValidated(
      backend,
      reduceSystemPrompt(),
      reduceUserPrompt(mapResults),
      (raw) => ReduceResultSchema.parse(raw),
      opts.model
    );

    // Task mix: sum LLM-classified counts across chunks, convert to % in code.
    const mixTotals = { work: 0, personal: 0, learning: 0, other: 0 };
    for (const m of mapResults) {
      const t = m.result.taskMix;
      mixTotals.work += t.work;
      mixTotals.personal += t.personal;
      mixTotals.learning += t.learning;
      mixTotals.other += t.other;
    }
    const mixSum = Object.values(mixTotals).reduce((a, b) => a + b, 0) || 1;
    const taskMix = (
      [
        ["Work & building", mixTotals.work],
        ["Personal", mixTotals.personal],
        ["Learning", mixTotals.learning],
        ["Other", mixTotals.other],
      ] as const
    )
      .map(([label, n]) => ({ label, pct: Math.round((n / mixSum) * 100) }))
      .filter((m) => m.pct > 0);

    const arch = archetypeById(reduced.archetypeId);
    return {
      summary: reduced.summary,
      taskMix,
      projectTypes: reduced.projectTypes,
      improvements: reduced.improvements,
      traits: reduced.traits,
      archetype: {
        id: arch.id,
        name: arch.name,
        icon: arch.icon,
        color: arch.color,
        description: arch.description,
        rarity: arch.rarity,
      },
      signatureHabits: reduced.signatureHabits,
      evidenceQuotes: reduced.evidenceQuotes,
      growthNarrative: reduced.growthNarrative,
      roast: reduced.roast,
      generatedBy: backend,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    progress(`Persona analysis failed (${msg}). Falling back to stats-only.`);
    return null;
  }
}

import { z } from "zod";
import { ARCHETYPE_IDS } from "./archetypes.js";

export const TRAIT_AXES = [
  "curiosity",
  "precision",
  "persistence",
  "trust",
  "expression",
] as const;

// ---- Map step: per-chunk extraction ----
export const MapResultSchema = z.object({
  traitSignals: z
    .array(
      z.object({
        axis: z.enum(TRAIT_AXES),
        score: z.number().min(0).max(100),
        evidence: z.string().min(1),
      })
    )
    .min(1),
  habits: z.array(z.string()).default([]),
  emotionalMoments: z.array(z.string()).default([]),
  notableQuotes: z.array(z.string()).default([]),
  workThemes: z.array(z.string()).default([]), // what the user was actually building
  // Counts of sampled prompts by task category (aggregated in code, not by the LLM).
  taskMix: z
    .object({
      work: z.number().min(0).default(0),
      personal: z.number().min(0).default(0),
      learning: z.number().min(0).default(0),
      other: z.number().min(0).default(0),
    })
    .default({ work: 0, personal: 0, learning: 0, other: 0 }),
});
export type MapResult = z.infer<typeof MapResultSchema>;

// ---- Reduce step: final profile ----
export const ReduceResultSchema = z.object({
  summary: z.string().min(1),
  projectTypes: z
    .array(z.object({ label: z.string().min(1), detail: z.string().min(1) }))
    .min(1)
    .max(4),
  improvements: z.array(z.string().min(1)).min(2).max(3),
  traits: z
    .array(
      z.object({
        axis: z.enum(TRAIT_AXES),
        score: z.number().min(0).max(100),
        pole: z.string().min(1),
        evidence: z.string().min(1),
      })
    )
    .length(5),
  archetypeId: z.enum(ARCHETYPE_IDS as [string, ...string[]]),
  signatureHabits: z.array(z.string()).min(1).max(3),
  evidenceQuotes: z
    .array(z.object({ quote: z.string().min(1), reveals: z.string().min(1) }))
    .min(1)
    .max(3),
  growthNarrative: z.string().min(1),
  roast: z.string().min(1),
});
export type ReduceResult = z.infer<typeof ReduceResultSchema>;

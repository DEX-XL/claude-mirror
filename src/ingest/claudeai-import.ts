import type { NormalizedEvent } from "../types.js";

// v1.1 SECONDARY SOURCE — claude.ai data export.
//
// General app users can export their data (Settings → Privacy → Export data),
// which emails a zip containing `conversations.json`. Supporting it expands the
// audience from Claude Code devs to every Claude user.
//
// The INTERFACE exists from day one so it lands as a clean minor release; the
// implementation is intentionally stubbed. VERIFY the current export schema
// against a live export before implementing — do not trust memory.

export type ImportResult = {
  events: NormalizedEvent[];
  parsed: number;
  skipped: number;
};

export class NotImplementedError extends Error {}

/**
 * Parse a claude.ai export zip into the same NormalizedEvent[] contract the
 * rest of the pipeline consumes. Stubbed for v1.1.
 */
export async function importClaudeAiExport(_zipPath: string): Promise<ImportResult> {
  throw new NotImplementedError(
    "claude.ai export import lands in v1.1. For now, Claude Mirror reads your local Claude Code history (~/.claude/projects)."
  );
}

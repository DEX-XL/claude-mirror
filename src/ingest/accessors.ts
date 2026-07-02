// Defensive accessors. The JSONL format is undocumented and WILL change,
// so EVERY field access goes through one of these. Nothing here throws.

export function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

export function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

export function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** Parse an ISO timestamp (or epoch ms number) to epoch ms, or undefined. */
export function toEpochMs(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const t = Date.parse(v);
    if (!Number.isNaN(t)) return t;
  }
  return undefined;
}

/**
 * A Claude Code project directory is the url-ish-encoded absolute path,
 * e.g. "C--Users-rohit-OneDrive-Foo". We only want a human, anonymized
 * basename — the last path segment — never the full disk path.
 */
export function projectBasename(encoded: string): string {
  if (!encoded) return "unknown";
  // Segments are separated by single dashes; drive letters look like "C--".
  const parts = encoded.split("-").filter(Boolean);
  const last = parts[parts.length - 1];
  return last || "unknown";
}

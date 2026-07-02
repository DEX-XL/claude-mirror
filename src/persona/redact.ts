// Redaction runs before ANY text leaves the process. Order matters:
// high-entropy tokens first (so we don't leave key fragments), then emails,
// URLs, then absolute paths → basenames. Unit-tested with planted secrets.

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

// Common key formats: sk-..., ghp_..., AKIA..., xoxb-..., JWTs, long hex/base64.
const KEY_PATTERNS: RegExp[] = [
  /\b(sk|pk|rk)-[A-Za-z0-9_-]{16,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, // JWT
  /\b[A-Fa-f0-9]{40,}\b/g, // long hex (sha, tokens)
  /\b[A-Za-z0-9+/]{40,}={0,2}\b/g, // long base64-ish blobs
];

const URL_WITH_QUERY_RE = /(https?:\/\/[^\s?]+)\?[^\s]*/g;
const URL_RE = /https?:\/\/[^\s]+/g;

// Absolute paths: POSIX (/a/b/c) and Windows (C:\a\b\c). Keep the basename.
const WIN_PATH_RE = /[A-Za-z]:\\(?:[^\s\\]+\\)*([^\s\\]+)/g;
const POSIX_PATH_RE = /(?:\/[^\s/]+){2,}\/([^\s/]+)/g;

export function redact(text: string): string {
  let out = text;
  for (const re of KEY_PATTERNS) out = out.replace(re, "[REDACTED_KEY]");
  out = out.replace(EMAIL_RE, "[REDACTED_EMAIL]");
  out = out.replace(URL_WITH_QUERY_RE, "$1?[REDACTED_QUERY]");
  out = out.replace(URL_RE, (m) => {
    try {
      const u = new URL(m);
      return `${u.protocol}//${u.hostname}/…`;
    } catch {
      return "[REDACTED_URL]";
    }
  });
  out = out.replace(WIN_PATH_RE, (_m, base) => `…/${base}`);
  out = out.replace(POSIX_PATH_RE, (_m, base) => `…/${base}`);
  return out;
}

export function redactAll(texts: string[]): string[] {
  return texts.map(redact);
}

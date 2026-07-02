// The funny countables. These feed both the "quirk stats" slide and signal
// for the persona engine. Case-insensitive, word-boundary matched.

export const QUIRK_PHRASES = [
  "actually",
  "wait",
  "no,",
  "please",
  "thanks",
  "thank you",
  "sorry",
  "let's",
  "hmm",
  "just",
  "properly",
  "perfect",
  "oops",
];

export const POLITENESS_MARKERS = ["please", "thanks", "thank you", "sorry", "appreciate"];

// A prompt is a "correction" if it opens with one of these.
export const CORRECTION_OPENERS = ["no", "wait", "actually", "nope", "stop", "undo", "revert"];

function countOccurrences(haystack: string, needle: string): number {
  // Escape regex specials in the phrase, match on word-ish boundaries.
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|[^a-z0-9])${esc}(?:$|[^a-z0-9])`, "gi");
  let n = 0;
  while (re.exec(haystack) !== null) n++;
  return n;
}

export function countPhrase(texts: string[], phrase: string): number {
  const lower = phrase.toLowerCase();
  let total = 0;
  for (const t of texts) total += countOccurrences(t.toLowerCase(), lower);
  return total;
}

export function isCorrection(text: string): boolean {
  const first = text.trimStart().toLowerCase();
  return CORRECTION_OPENERS.some(
    (op) => first === op || first.startsWith(op + " ") || first.startsWith(op + ",")
  );
}

export function isQuestion(text: string): boolean {
  return text.includes("?");
}

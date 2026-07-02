# Privacy

Claude Mirror reads your private AI conversations. So privacy isn't a footnote here — it's the whole contract. This document is written plainly and is meant to be audited.

## The one-sentence version

Everything runs on your machine. The **only** network request the tool ever makes is the optional persona analysis, which sends a small, redacted sample of *your own typed prompts* to Claude through *your own account* — and only after you type `y`.

## Hard rules

1. **Local by default, verifiably.** No telemetry, no analytics, no update pings — ever. Grep the source: the only outbound call is in `src/persona/runner.ts` (the model call), and it only fires after consent.
2. **Explicit consent gate.** Before any analysis leaves the process, the CLI prints exactly what will be sent and waits for `y`. Use `--stats-only` to skip it entirely (no prompt, no network), or `--yes` to pre-approve in CI.
3. **Inspect before you trust — `--show-sample`.** Dumps the *exact redacted text* that would be sent, then exits. What you see is all that goes.
4. **Redaction before egress.** Runs on every sampled prompt before it leaves the process (`src/persona/redact.ts`):
   - emails → `[REDACTED_EMAIL]`
   - API keys / tokens / JWTs / high-entropy blobs → `[REDACTED_KEY]`
   - URL query strings → stripped, host kept
   - absolute file paths (Windows & POSIX) → basename only
   Unit-tested with planted secrets in `test/redact.test.ts`.
5. **Your typed text only.** The persona engine never sees tool output, file contents, pasted logs, or Claude's own replies. Only genuine user-authored prompts, with harness wrappers (`<ide_selection>`, `<system-reminder>`, `<task-notification>`, …) stripped. See `src/ingest/text.ts`.
6. **Output stays local.** The report (`mirror-report.html`) and any PNG cards are written to disk. Sharing is always a deliberate action you take.

## What about the 3D orb?

The report loads Three.js from a CDN (`unpkg.com`) at view time to render the Personality Orb. If that request is blocked or offline, the report silently falls back to a 2D SVG radar — it never breaks, and no data is sent to the CDN (it's a one-way script fetch). If you want zero third-party fetches, the 2D radar is always present in the HTML already.

## Audit invitation

The ingest layer is a few hundred lines. Read it. If you find anything that phones home that isn't the consented model call, open an issue — that's a bug, and a serious one.

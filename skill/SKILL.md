---
name: mirror
description: Generate a Claude Mirror — a personality profile from your local Claude history (traits, archetype, roast, growth) as a shareable HTML report. Use when the user asks for their "Claude Mirror", "/mirror", a personality profile, or a wrapped-style report of how they use Claude.
---

# /mirror

Runs Claude Mirror over the user's local `~/.claude` history and opens the report.

## Steps

1. Run the tool. Prefer the published package; fall back to a local checkout:
   ```bash
   npx claude-mirror
   ```
   - Respect flags the user asks for: `--stats-only` (no LLM pass), `--period all|6m|2026`, `--show-sample` (dry-run of what would be sent), `--out <dir>`.
   - The tool asks for consent before the persona pass. If running non-interactively on the user's behalf and they've already agreed, pass `--yes`.

2. When it finishes, tell the user their archetype and the report path (`mirror-report.html`), which auto-opens in the browser.

3. If the user is privacy-conscious, point them at `--show-sample` and `--stats-only`, and note that only their own typed prompts (redacted) are ever sent, via their own Claude account.

## Notes

- No API key needed — the persona pass uses the local `claude -p` CLI (the user's own subscription).
- Everything is local; the only network call is the consented model pass.

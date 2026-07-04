# Mirror

**See who you are through what you asked.**

Spotify Wrapped told you what you listened to. Mirror tells you *who you are*. Run it once and it will use your local Claude Code history if it exists, or prompt you for a Claude export zip if it does not. It analyzes not just what you built but **how you think** — your traits, your archetype, your signature habits, how you've grown — and renders it as a beautiful, shareable card.

100% local. Consent-first. One command.

**New in v0.4 — the app:**
- 🧠 **The Brain is the home page** — a dense, searchable 3D map: every project, tool, trait, habit, model, and quote from your history, each node with its own story and clickable connections.
- 🗺️ **Four rooms**: `/` the brain · `/dashboard` every rhythm interactive · `/story` your narrative · `/connect` data sources.
- 🔀 **Merge your sources** — `--import` is repeatable: local Claude Code + ChatGPT + claude.ai exports combine into one brain.
- 🚪 **First-visit walkthrough** — what you'll see, and the promise: nothing leaves this machine.

**v0.3 — the habit engine:**
- 🔥 **Streaks & goals** — current streak, a weekly active-days goal ring (set yours: `--goal 4`), and a GitHub-style activity heatmap.
- 📊 **Week in review** — this week vs last, right in the dashboard.
- 📉 **Trait journey** — sparklines of your five traits across every run; watch yourself change.
- ♻️ **Live refresh** — leave the dashboard running; it re-reads your history every 10 minutes (or on click).

**v0.2 — the living Mirror:**
- 🧠 **The Brain** — an interactive 3D map of your history: projects, tools, traits, habits, and your voice, force-laid-out around you. Drag to spin, click any node.
- 🪞 **Talk to your Mirror** — a local chat with a twin built from your own prompts. It talks like you and knows your patterns (runs on your own Claude account).
- 📈 **A real dashboard** — daily usage chart, work/personal/learning mix, and since-last-run deltas so you can watch yourself change month over month.
- 🔌 **Provider-neutral** — imports ChatGPT data exports too, not just Claude.

```bash
npx ai-mirror                       # launches your local dashboard (brain + stats + chat)
npx ai-mirror ./export.zip          # works with Claude AND ChatGPT data exports
npx ai-mirror --export              # just write the shareable mirror-report.html
```

> Not another stats tool with a costume on. The tokens-and-heatmaps stuff is the warm-up. The product is the **mirror**: a real, evidence-backed read on how you collaborate with AI — with quotes.

---

## How it works

```
  ~/.claude/projects/**/*.jsonl          your local session history
        │
        ▼
  1. INGEST     stream + normalize, user-typed text only (never tool output)
  2. ANALYZE    (a) stats engine — pure, deterministic, always runs
                (b) persona engine — a redacted sample of your prompts →
                    an LLM rubric via `claude -p` (your own subscription)
  3. RENDER     one self-contained mirror-report.html → in-browser PNG cards
```

The persona pass shells out to the **Claude Code CLI in headless mode** (`claude -p`), so if you already use Claude Code you need **no API key, no signup, no extra cost**. No CLI and no `ANTHROPIC_API_KEY`? You still get the full stats report — the persona section just degrades gracefully.

## What you get

- **A trait profile** across five axes — Curiosity, Precision, Persistence, Trust, Expression — each scored and framed as a *strength*, each backed by a real quote or count from your own prompts.
- **One of 12 archetypes** with a rarity tag — *The Midnight Architect*, *The Relentless Debugger*, *The Delegation Maestro*, *The Skeptic*… (collect them; compare with friends).
- **Growth over time** — how your first months differ from your recent ones. "You've stopped apologizing to the AI."
- **The Personality Orb** — a 3D blob deformed by your traits (Three.js, with a 2D radar fallback).
- **One gentle roast.** Engineered screenshot bait.
- **A share card** — PNG export, X/story formats, watermark inside the frame.

## Install & usage

```bash
npx claude-mirror                # full experience from local Claude Code history
npx claude-mirror ./claude-export.zip  # full experience from a Claude export zip
```

If you use Claude in chat instead of Claude Code, you can still just run the command. It will ask for your export zip path if it does not find local Claude Code history.

| Flag | Effect |
|---|---|
| `--stats-only` | skip the LLM persona pass — no prompt, no network |
| `--period 2026 \| all \| 6m` | time window (default: current year) |
| `--show-sample` | print the exact redacted text that *would* be sent, then exit |
| `--out <dir>` | output location (default: cwd) |
| `--json` | also write `profile.json` for hackers |
| `--model <name>` | model for the persona pass (default: `sonnet`) |
| `--yes, -y` | skip the consent prompt (CI / power users) |

Output: `mirror-report.html` in the current directory, auto-opened. One self-contained file — works offline, can be emailed, never phones home.

## Privacy

This tool reads your private conversations, so provable privacy is the feature. In short:

- **Local by default.** No telemetry, no analytics, ever. The only network call is the optional, consented model pass.
- **Consent gate** before anything leaves the process — plus `--show-sample` to see exactly what would be sent, and `--stats-only` to never send anything.
- **Redaction** of emails, keys, tokens, URL params, and absolute paths before egress (tested with planted secrets).
- **Your typed text only** — never tool output, file contents, or Claude's replies.

Full details in [PRIVACY.md](./PRIVACY.md). The ingest layer is a few hundred lines — read it.

## The 12 archetypes

🌙 The Midnight Architect · 🔦 The Relentless Debugger · 💡 The Idea Fountain · 💎 The Perfectionist's Apprentice · 🎼 The Delegation Maestro · ❓ The Socratic Interrogator · ⚡ The Speed Demon · 🌱 The Gardener · 🌊 The Deep Diver · 🤝 The Diplomat · 🧐 The Skeptic · 🦎 The Shapeshifter

## Development

```bash
npm install
npm test          # vitest — parser, redaction, stats, sampler, schema
npm run build     # tsup → single-file dist/cli.js
npm run dev -- --stats-only    # run from source
```

The session JSONL format is undocumented and changes over time, so the parser is deliberately defensive: it streams (never slurps), routes every field through a tolerant accessor, and counts unrecognized records instead of throwing. If Anthropic changes the format, the tool degrades and reports what it skipped rather than crashing.

## License

MIT — see [LICENSE](./LICENSE).

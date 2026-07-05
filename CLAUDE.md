# Mirror — agent context

Read this before doing anything else in this repo. It's the handoff doc between
Claude sessions/apps, not user-facing docs — see README.md for that.

## What this project is

`ai-mirror` (bin alias `claude-mirror`) is a 100%-local tool that reads a user's
Claude Code / ChatGPT history and builds:
- **The Brain** — an interactive 3D force-directed graph (canvas, zero deps), now
  centered on a **mind map** (broad topics → drill-down children, the person's
  actual recurring thoughts) rather than surface-level quirk words.
- **Dashboard** — full interactive stats: hours, days, projects, tools, streaks,
  a weekly goal ring, a GitHub-style heatmap, trait-journey sparklines.
- **Story** — the original narrative report (shareable static HTML export).
- **Connect** — data-source status + step-by-step import guides (ChatGPT/Claude
  today; Notes/Gmail/Slack/Calendar listed as roadmap, not built).
- **Twin chat** — a chat dock talking through the user's own Claude account,
  primed by `mirror-persona.md` (regenerated every run from traits/habits/quotes).
  Currently **stateless per session** — no persistent memory of its own replies.

Architecture: Node/TS CLI (`src/cli.ts`) → streams local JSONL / import exports
→ deterministic stats engine (`src/stats/`) → LLM map/reduce persona pass via
the user's own `claude -p` (or API key fallback) (`src/persona/`) → local HTTP
server (`src/server.ts`) serving the app pages (`src/render/`). No hooks, no
cron/heartbeat, no write-access integrations — everything today is read-only
local analysis. Zero telemetry.

Version history is in README.md's "New in vX" blocks — v0.1 (persona/report) →
v0.2 (brain + chat) → v0.3 (habit engine) → v0.4 (app: brain-as-home, 4 routes,
multi-source merge) → v0.4.1 (mind map replaces quirk-word brain nodes,
monochrome "Westworld" palette).

## Session handoff (2026-07-05)

**In flight:** deciding Mirror's next real increment — evolving from a read-only
analysis tool toward something closer to Cole Medin's "second brain" pattern
(github.com/coleam00/second-brain-starter): a memory layer (his: Obsidian
soul.md/user.md/memory.md loaded via session-start hook, daily-log capture,
a cron "promotion" job, SQLite/Postgres RAG), skills-as-scripts integrations
(Gmail/Slack/Calendar/Asana, scoped read vs. write), and a proactive "heartbeat"
cron that checks accounts and messages the user for approval.

**Key open question, not yet answered:** how much of that (if any) fits Mirror's
actual differentiator — 100%-local, zero-telemetry, read-only trust — for
**mass/non-technical users**, not solo developer power-users. Medin's build
assumes someone comfortable writing hook scripts and managing cron; Mirror's
audience mostly isn't. A `/deep-research` pass on this was started (product
landscape: Rewind/Limitless/Personal.ai/Mem/OpenClaw and why they succeeded or
backlashed with non-technical users; the "Lethal Trifecta" prompt-injection
framing and its mitigations; consumer-safe permission-consent UX patterns;
local-first RAG storage tradeoffs) but was **stopped before completing**, in
favor of installing gstack and running `/office-hours` to brainstorm the
direction properly before researching implementation details.

**gstack is installed** at `~/.claude/skills/gstack` (machine-level, not
vendored into this repo — do not vendor it here). 55 skills available:
`/office-hours`, `/spec`, `/plan-eng-review`, `/autoplan`, `/qa`, `/ship`, etc.

**Next step (what the user is about to do):** run `/office-hours` in this repo
to brainstorm the v0.5 direction before any code or research. Treat this as
**Builder mode or Startup mode** depending on how the user frames it in that
skill's first question — Mirror is currently a solo open-source project (not
yet a company), so don't assume Startup mode's YC diagnostic is the intended
posture unless the user steers there.

## Constraints that should shape any v0.5 direction

- **Local-first, zero-telemetry is the trust moat** — don't propose anything
  that silently phones home or requires a hosted backend by default.
- **Read-only today, on purpose** — any write-access integration (send email,
  post Slack, edit calendar) is a scope escalation that needs its own explicit
  consent gate, mirroring the existing persona-analysis consent flow in `cli.ts`.
- **No hooks/cron today** — a "heartbeat"-style proactive feature would be new
  infrastructure (background service or scheduled task), not a small addition.
- **Audience is non-technical mass users** — solutions requiring the user to
  write scripts, manage a Python/Node service, or configure cron by hand are
  out of scope for the *default* experience, even if offered as an advanced path.

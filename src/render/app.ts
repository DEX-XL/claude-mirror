import type { Profile } from "../types.js";
import {
  cssFor,
  navBar,
  dailyChart,
  donut,
  habitSection,
  traitJourney,
  CHART_JS,
  LIVE_JS,
} from "./template.js";
import { brainSection } from "./brain.js";

// The live app's pages (brain / dashboard / connect). The story page is
// renderReport(profile, {live:true}). Everything shares cssFor + LIVE_JS.

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function liveWidgets(profile: Profile): string {
  return `<button id="refresh-chip" title="Re-read your history now">↻ refresh data</button>
  <button id="chat-fab" title="Talk to your Mirror">🪞</button>
  <div id="chat-dock" hidden>
    <div id="chat-head"><span style="font-size:20px">🪞</span><div><div class="t">Your Mirror</div><div class="s">knows you from ${fmt(
      profile.stats.totals.prompts
    )} prompts · local only</div></div><button id="chat-close">×</button></div>
    <div id="chat-log"></div>
    <form id="chat-form"><input id="chat-in" placeholder="Ask yourself anything…" autocomplete="off"/><button id="chat-send">→</button></form>
  </div>`;
}

function shell(profile: Profile, active: string, title: string, body: string): string {
  const accent = profile.persona?.archetype.color ?? "#7c5cff";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<style>${cssFor(accent)}${APP_CSS}</style>
</head>
<body>
  ${navBar(active)}
  ${body}
  ${liveWidgets(profile)}
<script>
(function(){
${CHART_JS}
${LIVE_JS}
})();
</script>
</body>
</html>`;
}

// ---- / — the Brain, full screen ----
export function brainPage(profile: Profile): string {
  return shell(profile, "brain", "Mirror — your brain", brainSection(profile, { fullscreen: true }));
}

// ---- /dashboard — every rhythm, interactive ----
function hourChart(hist: number[], golden: number): string {
  const W = 900;
  const H = 200;
  const max = Math.max(...hist, 1);
  const bw = W / 24;
  const bars = hist
    .map((v, h) => {
      const bh = Math.max(2, (v / max) * (H - 40));
      const label = h === 0 ? "12a" : h < 12 ? h + "a" : h === 12 ? "12p" : h - 12 + "p";
      return `<rect class="dbar" x="${(h * bw + 3).toFixed(1)}" y="${(H - bh - 24).toFixed(1)}" width="${(
        bw - 6
      ).toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="var(--accent)" opacity="${
        h === golden ? 1 : 0.45
      }" data-date="${label}" data-n="${v}"/>
      <text x="${(h * bw + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" fill="${
        h === golden ? "var(--accent)" : "#6a6a7a"
      }" font-size="10" font-family="Inter,system-ui,sans-serif">${h % 3 === 0 ? label : ""}</text>`;
    })
    .join("");
  return `<svg viewBox="0 0 ${W} ${H}" style="width:min(92vw,900px)" preserveAspectRatio="none">${bars}</svg>`;
}

function dowChart(hist: number[]): string {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const max = Math.max(...hist, 1);
  return `<div class="dow-row">${hist
    .map(
      (v, i) =>
        `<div class="dow-col"><div class="dow-bar" style="height:${Math.max(4, (v / max) * 110)}px" title="${names[i]}: ${v} prompts"></div><span>${names[i]}</span></div>`
    )
    .join("")}</div>`;
}

function barList(rows: { label: string; value: number }[], unit: string): string {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return `<div class="barlist">${rows
    .map(
      (r) =>
        `<div class="bl-row"><span class="bl-label">${esc(r.label)}</span><div class="bl-track"><div class="bl-fill" style="width:${(
          (r.value / max) * 100
        ).toFixed(1)}%"></div></div><b class="bl-val">${fmt(r.value)}</b></div>`
    )
    .join("")}<div class="bl-unit">${unit}</div></div>`;
}

export function dashboardPage(profile: Profile): string {
  const { stats, persona } = profile;
  const body = `
  <main class="dash">
    <section class="dash-sec">
      <div class="kicker">Activity</div>
      <div class="dash-nums">
        <div class="dash-num"><b>${fmt(stats.totals.prompts)}</b><span>prompts</span></div>
        <div class="dash-num"><b>${fmt(Math.round(stats.totals.estimatedHours))}h</b><span>active time</span></div>
        <div class="dash-num"><b>${stats.currentStreakDays}</b><span>current streak</span></div>
        <div class="dash-num"><b>${fmt(stats.totals.tokensOut)}</b><span>tokens generated</span></div>
      </div>
      ${dailyChart(stats.daily)}
    </section>

    ${habitSection(profile).replace('class="snap"', 'class="dash-sec"')}

    <section class="dash-sec">
      <div class="kicker">When you think</div>
      <h2>Your hours</h2>
      ${hourChart(stats.rhythm.hourHistogram, stats.rhythm.goldenHour)}
      <p class="muted small">Highlighted: your golden hour. Hover any bar.</p>
      <h2 style="margin-top:30px">Your days</h2>
      ${dowChart(stats.rhythm.dayHistogram)}
    </section>

    ${
      persona?.taskMix.length
        ? `<section class="dash-sec"><div class="kicker">What it's all for</div>${donut(persona.taskMix)}</section>`
        : ""
    }

    <section class="dash-sec">
      <div class="kicker">Where the time goes</div>
      <h2>Projects</h2>
      ${barList(
        stats.projects.top.slice(0, 6).map((p) => ({ label: p.name, value: p.prompts })),
        "prompts per project"
      )}
      <h2 style="margin-top:30px">Tools</h2>
      ${barList(
        stats.tools.top.slice(0, 6).map((t) => ({ label: t.name, value: t.count })),
        "invocations"
      )}
    </section>

    ${traitJourney(profile).replace('class="snap"', 'class="dash-sec"')}
  </main>`;
  return shell(profile, "dashboard", "Mirror — dashboard", body);
}

// ---- /connect — data sources ----
type Source = {
  icon: string;
  name: string;
  status: "connected" | "available" | "roadmap";
  note: string;
  steps?: string[];
};

export function connectPage(profile: Profile, opts: { localDetected: boolean; imported: string[] }): string {
  const sources: Source[] = [
    {
      icon: "⌨️",
      name: "Claude Code",
      status: opts.localDetected ? "connected" : "available",
      note: opts.localDetected
        ? "Local session history detected and ingested automatically."
        : "Install Claude Code and your sessions are picked up automatically.",
    },
    {
      icon: "💬",
      name: "ChatGPT",
      status: opts.imported.includes("ChatGPT") ? "connected" : "available",
      note: "Your full ChatGPT history joins the brain — one file.",
      steps: [
        "ChatGPT → Settings → Data controls → Export data",
        "You'll get an email link; download the zip",
        "Run: npx ai-mirror --import path/to/chatgpt-export.zip",
      ],
    },
    {
      icon: "✳️",
      name: "Claude (chat)",
      status: opts.imported.includes("Claude") ? "connected" : "available",
      note: "For claude.ai conversations outside Claude Code.",
      steps: [
        "claude.ai → Settings → Privacy → Export data",
        "Download the zip from the email",
        "Run: npx ai-mirror --import path/to/claude-export.zip",
      ],
    },
    { icon: "📝", name: "Notes (Markdown / Obsidian)", status: "roadmap", note: "Your written thoughts, linked into the graph." },
    { icon: "📧", name: "Email (Gmail export)", status: "roadmap", note: "How you talk to humans, not just AI." },
    { icon: "💼", name: "Slack", status: "roadmap", note: "Your work voice — threads, reactions, hours." },
    { icon: "🗓️", name: "Google Calendar", status: "roadmap", note: "Where your time actually goes." },
  ];
  const badge = { connected: "✓ connected", available: "ready to connect", roadmap: "on the roadmap" };
  const cards = sources
    .map(
      (s) => `<div class="src-card ${s.status}">
      <div class="src-head"><span class="src-icon">${s.icon}</span><b>${s.name}</b><span class="src-badge ${s.status}">${badge[s.status]}</span></div>
      <p class="src-note">${s.note}</p>
      ${s.steps ? `<ol class="src-steps">${s.steps.map((st) => `<li>${st.startsWith("Run:") ? `<code>${st.slice(5)}</code>` : st}</li>`).join("")}</ol>` : ""}
    </div>`
    )
    .join("");
  const body = `
  <main class="dash">
    <section class="dash-sec">
      <div class="kicker">Connect your life</div>
      <h2>The more it sees, the more it's you</h2>
      <p class="muted" style="max-width:560px;margin:10px auto 0">Every source is read <b>on this machine</b> and never uploaded. Patterns emerge from volume — each connection makes the brain denser and your Mirror more real. You can combine sources: <code>npx ai-mirror --import a.zip --import b.zip</code> merges them with your local history.</p>
      <div class="src-grid">${cards}</div>
    </section>
  </main>`;
  return shell(profile, "connect", "Mirror — connect sources", body);
}

/** Extra CSS for app pages, appended by the server. */
export const APP_CSS = `
.dash{max-width:1000px;margin:0 auto;padding:30px 4vw 80px}
.dash-sec{position:relative;padding:40px 0;text-align:center;border-bottom:1px solid #ffffff0a;display:flex;flex-direction:column;align-items:center}
.dow-row{display:flex;gap:14px;align-items:flex-end;justify-content:center;margin-top:16px}
.dow-col{display:flex;flex-direction:column;align-items:center;gap:8px}
.dow-col span{font-size:11px;color:var(--muted)}
.dow-bar{width:34px;background:var(--accent);opacity:.65;border-radius:6px 6px 2px 2px}
.dow-bar:hover{opacity:1}
.barlist{width:min(92vw,620px);display:grid;gap:10px;margin-top:14px}
.bl-row{display:flex;align-items:center;gap:12px}
.bl-label{width:130px;text-align:right;font-size:13px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bl-track{flex:1;height:10px;background:#ffffff10;border-radius:5px;overflow:hidden}
.bl-fill{height:100%;background:var(--accent);border-radius:5px}
.bl-val{font-size:13px;width:60px;text-align:left}
.bl-unit{color:#6a6a7a;font-size:11px;text-align:right}
.src-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-top:30px;width:100%}
.src-card{background:#15151f;border:1px solid #ffffff14;border-radius:18px;padding:22px;text-align:left}
.src-card.roadmap{opacity:.6}
.src-head{display:flex;align-items:center;gap:10px}
.src-icon{font-size:22px}
.src-badge{margin-left:auto;font-size:10px;text-transform:uppercase;letter-spacing:.1em;padding:4px 10px;border-radius:999px;border:1px solid}
.src-badge.connected{color:#4cffb8;border-color:#4cffb8}
.src-badge.available{color:var(--accent);border-color:var(--accent)}
.src-badge.roadmap{color:var(--muted);border-color:#ffffff2a}
.src-note{color:var(--muted);font-size:14px;margin-top:10px}
.src-steps{margin:12px 0 0 18px;color:#c9c9d6;font-size:13px;display:grid;gap:6px}
`;

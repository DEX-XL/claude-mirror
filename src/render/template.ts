import type { Profile, Snapshot, TraitScore } from "../types.js";
import { radarSvg } from "./radar.js";
import { brainSection, BRAIN_CSS } from "./brain.js";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

const HOUR_LABEL = (h: number) => {
  const ampm = h < 12 ? "AM" : "PM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr} ${ampm}`;
};

const MIX_COLORS: Record<string, string> = {
  "Work & building": "#7c5cff",
  Personal: "#4cffb8",
  Learning: "#ffb84c",
  Other: "#9a9aab",
};

// ---- Interactive daily bar chart (inline SVG + JS tooltip) ----
function dailyChart(daily: { date: string; prompts: number }[]): string {
  if (daily.length === 0) return "";
  const shown = daily.length > 120 ? daily.slice(-120) : daily;
  const W = 900;
  const H = 220;
  const pad = 8;
  const max = Math.max(...shown.map((d) => d.prompts), 1);
  const bw = (W - pad * 2) / shown.length;
  const bars = shown
    .map((d, i) => {
      const h = Math.max(d.prompts > 0 ? 3 : 1, (d.prompts / max) * (H - 30));
      const x = pad + i * bw;
      return `<rect class="dbar" x="${x.toFixed(1)}" y="${(H - h - 20).toFixed(1)}" width="${Math.max(
        1,
        bw - 1.5
      ).toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" data-date="${d.date}" data-n="${d.prompts}" fill="${
        d.prompts > 0 ? "var(--accent)" : "#ffffff14"
      }" opacity="${d.prompts > 0 ? 0.85 : 1}"/>`;
    })
    .join("");
  const first = shown[0].date;
  const last = shown[shown.length - 1].date;
  return `<div class="chart-wrap">
    <svg id="daily-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${bars}</svg>
    <div class="chart-x"><span>${first}</span><span>${last}</span></div>
    <div id="chart-tip" class="tip-float" hidden></div>
  </div>`;
}

// ---- Task mix donut (SVG arcs with hover) ----
function donut(mix: { label: string; pct: number }[]): string {
  const R = 80;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const segs = mix
    .map((m) => {
      const len = (m.pct / 100) * C;
      const color = MIX_COLORS[m.label] ?? "#9a9aab";
      const s = `<circle class="seg" r="${R}" cx="110" cy="110" fill="none" stroke="${color}" stroke-width="26" stroke-dasharray="${len.toFixed(1)} ${(C - len).toFixed(1)}" stroke-dashoffset="${(-offset).toFixed(1)}" data-label="${esc(m.label)}" data-pct="${m.pct}"/>`;
      offset += len;
      return s;
    })
    .join("");
  const legend = mix
    .map(
      (m) =>
        `<div class="leg"><span class="dot" style="background:${MIX_COLORS[m.label] ?? "#9a9aab"}"></span>${esc(
          m.label
        )} <b>${m.pct}%</b></div>`
    )
    .join("");
  return `<div class="donut-row">
    <svg viewBox="0 0 220 220" width="220" height="220" style="transform:rotate(-90deg)">${segs}</svg>
    <div class="legend">${legend}</div>
  </div>`;
}

// ---- Trait bars: pole names on both ends, score marker, evidence below ----
function traitBars(traits: TraitScore[]): string {
  const POLES: Record<string, [string, string]> = {
    curiosity: ["Focused", "Explorer"],
    precision: ["Fast-mover", "Craftsman"],
    persistence: ["Pragmatist", "Bulldog"],
    trust: ["Hands-on", "Delegator"],
    expression: ["Minimalist", "Storyteller"],
  };
  return traits
    .map((t) => {
      const [lo, hi] = POLES[t.axis] ?? ["", ""];
      return `<div class="tbar" title="${esc(t.evidence)}">
      <div class="tbar-labels"><span class="${t.score < 50 ? "on" : ""}">${lo}</span><span class="${
        t.score >= 50 ? "on" : ""
      }">${hi}</span></div>
      <div class="tbar-track"><div class="tbar-dot" style="left:${t.score}%"></div></div>
      <div class="tbar-ev">${esc(t.evidence)}</div>
    </div>`;
    })
    .join("");
}

// ---- Since-last-mirror deltas ----
function deltaSection(profile: Profile): string {
  const prev = profile.previous;
  if (!prev) return "";
  const { stats, persona } = profile;
  const rows: string[] = [];
  const dp = stats.totals.prompts - prev.prompts;
  const dh = Number((stats.totals.estimatedHours - prev.hours).toFixed(1));
  rows.push(
    `<div class="delta"><span>Prompts</span><b class="${dp >= 0 ? "up" : "down"}">${dp >= 0 ? "+" : ""}${fmt(dp)}</b></div>`,
    `<div class="delta"><span>Hours</span><b class="${dh >= 0 ? "up" : "down"}">${dh >= 0 ? "+" : ""}${dh}</b></div>`
  );
  if (persona && prev.traits) {
    const prevMap = new Map(prev.traits.map((t) => [t.axis, t.score]));
    for (const t of persona.traits) {
      const old = prevMap.get(t.axis);
      if (old === undefined) continue;
      const d = t.score - old;
      if (Math.abs(d) < 3) continue; // noise floor
      rows.push(
        `<div class="delta"><span>${esc(t.pole)}</span><b class="${d >= 0 ? "up" : "down"}">${d >= 0 ? "+" : ""}${d}</b></div>`
      );
    }
    if (prev.archetypeId && persona.archetype.id !== prev.archetypeId) {
      rows.push(`<div class="delta wide"><span>New archetype unlocked:</span><b>${esc(persona.archetype.name)}</b></div>`);
    }
  }
  return `<section class="snap">
    <div class="kicker">Since your last mirror (${esc(prev.date)})</div>
    <h2>What changed</h2>
    <div class="deltas">${rows.join("")}</div>
    <p class="muted small">Run <code>npx ai-mirror</code> monthly to track your progress.</p>
  </section>`;
}

export function renderReport(profile: Profile, opts: { live?: boolean } = {}): string {
  const live = opts.live ?? false;
  const { stats, persona, meta } = profile;
  const accent = persona?.archetype.color ?? "#7c5cff";
  const quirkTop = stats.conversationStyle.quirks.slice(0, 4);
  const politeness = stats.conversationStyle.politenessMarkers;
  const activeDays = stats.daily.filter((d) => d.prompts > 0).length;

  // rhythm ring
  const maxHour = Math.max(...stats.rhythm.hourHistogram, 1);
  const ringBars = stats.rhythm.hourHistogram
    .map((v, h) => {
      const a = (((360 / 24) * h - 90) * Math.PI) / 180;
      const inner = 70;
      const outer = 70 + (v / maxHour) * 70;
      const isGolden = h === stats.rhythm.goldenHour;
      return `<line x1="${(150 + inner * Math.cos(a)).toFixed(1)}" y1="${(150 + inner * Math.sin(a)).toFixed(
        1
      )}" x2="${(150 + outer * Math.cos(a)).toFixed(1)}" y2="${(150 + outer * Math.sin(a)).toFixed(1)}" stroke="${
        isGolden ? accent : "#ffffff40"
      }" stroke-width="${isGolden ? 6 : 4}" stroke-linecap="round"><title>${HOUR_LABEL(h)}: ${v} prompts</title></line>`;
    })
    .join("");

  const radar = persona ? radarSvg(persona.traits, { size: 300, accent, labels: true }) : "";
  const cardRadar = persona ? radarSvg(persona.traits, { size: 180, accent, labels: false }) : "";

  const personaSections = persona
    ? `
    <section class="snap">
      <div class="kicker">Your story</div>
      <p class="summary">${esc(persona.summary)}</p>
    </section>

    <section class="snap">
      <div class="kicker">What you built</div>
      <div class="projects">
        ${persona.projectTypes
          .map(
            (p) =>
              `<div class="proj"><div class="proj-label">${esc(p.label)}</div><div class="proj-detail">${esc(
                p.detail
              )}</div></div>`
          )
          .join("")}
      </div>
    </section>

    ${
      persona.taskMix.length
        ? `<section class="snap">
      <div class="kicker">What you use AI for</div>
      ${donut(persona.taskMix)}
      <p class="muted small">Estimated from a sample of your prompts.</p>
    </section>`
        : ""
    }

    <section class="snap">
      <div class="kicker">Your shape</div>
      <div class="shape-row">
        <div class="radar-box">${radar}</div>
        <div class="tbars">${traitBars(persona.traits)}</div>
      </div>
    </section>

    <section class="snap card-sec">
      <div class="kicker">Your archetype</div>
      <div id="share-card" class="share-card" style="--accent:${accent}">
        <div class="card-glow"></div>
        <div class="card-icon">${persona.archetype.icon}</div>
        <div class="card-name">${esc(persona.archetype.name)}</div>
        <div class="card-rarity">${esc(persona.archetype.rarity)}</div>
        <div class="card-desc">${esc(persona.archetype.description)}</div>
        <div class="card-radar">${cardRadar}</div>
        <div class="card-poles">
          ${persona.traits
            .slice()
            .sort((a, b) => b.score - a.score)
            .slice(0, 2)
            .map((t) => `<span class="pole-chip">${esc(t.pole)}</span>`)
            .join("")}
        </div>
        ${quirkTop[0] ? `<div class="card-quirk">You said “${esc(quirkTop[0].phrase)}” ${quirkTop[0].count}×</div>` : ""}
        <div class="card-watermark">npx ai-mirror</div>
      </div>
      <div class="card-actions">
        <button id="download-card" class="btn">Download card (PNG)</button>
        <a id="share-x" class="btn btn-ghost" target="_blank" rel="noopener">Share on X</a>
      </div>
    </section>

    <section class="snap evidence-sec">
      <div class="kicker">The evidence</div>
      <div class="evidence-list">
        ${persona.evidenceQuotes
          .map(
            (q) =>
              `<blockquote class="evidence"><p>“${esc(q.quote)}”</p><cite>— revealed your ${esc(q.reveals)}</cite></blockquote>`
          )
          .join("")}
      </div>
    </section>

    <section class="snap roast-sec">
      <div class="kicker">The roast</div>
      <p class="roast">${esc(persona.roast)}</p>
    </section>

    <section class="snap growth-sec">
      <div class="kicker">The mirror remembers</div>
      <h2>How you've changed</h2>
      <p class="growth">${esc(persona.growthNarrative)}</p>
      <div class="habits">
        ${persona.signatureHabits.map((h) => `<div class="habit">◆ ${esc(h)}</div>`).join("")}
      </div>
    </section>

    <section class="snap">
      <div class="kicker">Level up</div>
      <h2>Get even more out of AI</h2>
      <div class="tips">
        ${persona.improvements
          .map((t, i) => `<div class="tip"><span class="tip-n">${i + 1}</span><p>${esc(t)}</p></div>`)
          .join("")}
      </div>
    </section>`
    : `
    <section class="snap">
      <div class="kicker">Persona</div>
      <p class="muted">Persona analysis was skipped (stats-only mode). Re-run without <code>--stats-only</code> to see your archetype, traits, task mix, and coaching tips.</p>
    </section>`;

  const shareText = persona
    ? `I'm "${persona.archetype.name}" (${persona.archetype.rarity})${
        quirkTop[0] ? ` — apparently I say "${quirkTop[0].phrase}" a lot` : ""
      }. Get your Mirror → npx ai-mirror`
    : `I ran Mirror on my AI history. Get yours → npx ai-mirror`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Mirror${persona ? " — " + esc(persona.archetype.name) : ""}</title>
<style>
:root{--accent:${accent};--bg:#0d0d12;--fg:#f4f4f8;--muted:#9a9aab}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--fg);font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5;-webkit-font-smoothing:antialiased}
.snap{position:relative;min-height:88vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:7vh 6vw}
.kicker{text-transform:uppercase;letter-spacing:.25em;font-size:12px;color:var(--muted);margin-bottom:22px}
h2{font-size:clamp(24px,4vw,38px);letter-spacing:-.02em;margin-bottom:8px}
.muted{color:var(--muted)} .small{font-size:13px;margin-top:14px}
/* dashboard open */
.dash-nums{display:flex;gap:clamp(20px,6vw,70px);flex-wrap:wrap;justify-content:center;margin-bottom:34px}
.dash-num b{display:block;font-size:clamp(34px,7vw,64px);font-weight:800;letter-spacing:-.03em;color:var(--accent)}
.dash-num span{color:var(--muted);font-size:14px;text-transform:uppercase;letter-spacing:.12em}
.chart-wrap{width:min(92vw,900px);position:relative}
#daily-chart{width:100%;height:220px;display:block}
.dbar{cursor:pointer;transition:opacity .15s} .dbar:hover{opacity:1;filter:brightness(1.4)}
.chart-x{display:flex;justify-content:space-between;color:var(--muted);font-size:12px;margin-top:6px}
.tip-float{position:absolute;pointer-events:none;background:#1c1c28;border:1px solid #ffffff22;border-radius:8px;padding:6px 10px;font-size:13px;white-space:nowrap;z-index:5}
/* donut */
.donut-row{display:flex;gap:40px;align-items:center;flex-wrap:wrap;justify-content:center}
.seg{cursor:pointer;transition:stroke-width .15s} .seg:hover{stroke-width:32}
.legend{display:grid;gap:10px;text-align:left}
.leg{display:flex;align-items:center;gap:10px;font-size:16px}
.leg b{color:var(--fg)} .dot{width:12px;height:12px;border-radius:50%;display:inline-block}
/* traits */
.shape-row{display:flex;gap:40px;align-items:center;flex-wrap:wrap;justify-content:center}
.radar-box{flex:none}
.tbars{display:grid;gap:18px;width:min(90vw,420px);text-align:left}
.tbar-labels{display:flex;justify-content:space-between;font-size:14px;color:var(--muted)}
.tbar-labels .on{color:var(--fg);font-weight:700}
.tbar-track{position:relative;height:6px;border-radius:3px;background:#ffffff14;margin:6px 0}
.tbar-dot{position:absolute;top:50%;transform:translate(-50%,-50%);width:16px;height:16px;border-radius:50%;background:var(--accent);box-shadow:0 0 12px var(--accent)}
.tbar-ev{font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
/* content sections */
.summary{max-width:680px;font-size:clamp(19px,2.8vw,26px);color:#e8e8f0;text-align:left;line-height:1.6}
.projects{display:grid;gap:16px;max-width:640px;width:100%}
.proj{background:#15151f;border:1px solid #ffffff14;border-radius:16px;padding:20px 24px;text-align:left}
.proj-label{font-weight:800;font-size:18px;color:var(--accent)}
.proj-detail{color:var(--muted);font-size:15px;margin-top:6px}
.tips{display:grid;gap:16px;max-width:640px;width:100%;margin-top:20px}
.tip{display:flex;gap:16px;align-items:flex-start;background:#15151f;border:1px solid #ffffff14;border-radius:16px;padding:18px 22px;text-align:left}
.tip-n{flex:none;width:28px;height:28px;border-radius:50%;background:var(--accent);color:#0b0b10;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:14px}
.tip p{font-size:16px;color:#e8e8f0}
.quirks{display:grid;gap:18px;max-width:680px}
.quirk-line{font-size:clamp(20px,3.6vw,34px);font-weight:700}
.quirk-line b{color:var(--accent)}
.rhythm-sub{margin-top:16px;color:var(--muted);font-size:17px}
/* deltas */
.deltas{display:flex;gap:14px;flex-wrap:wrap;justify-content:center;max-width:680px;margin-top:14px}
.delta{background:#15151f;border:1px solid #ffffff14;border-radius:14px;padding:14px 20px;display:flex;gap:10px;align-items:baseline}
.delta span{color:var(--muted);font-size:14px} .delta b{font-size:20px}
.delta .up{color:#4cffb8} .delta .down{color:#ff5c7c} .delta.wide{width:100%;justify-content:center}
/* card */
.share-card{position:relative;width:360px;max-width:90vw;border-radius:24px;padding:34px 28px;background:linear-gradient(160deg,#15151f,#0e0e14);border:1px solid #ffffff14;overflow:hidden}
.card-glow{position:absolute;inset:-40% 20% auto;height:60%;background:radial-gradient(closest-side,var(--accent),transparent);opacity:.35;filter:blur(20px)}
.card-icon{font-size:56px;position:relative}
.card-name{font-size:26px;font-weight:800;margin-top:8px;position:relative}
.card-rarity{color:var(--accent);font-size:13px;letter-spacing:.08em;text-transform:uppercase;margin-top:4px}
.card-desc{color:var(--muted);font-size:14px;margin-top:12px;position:relative}
.card-radar{margin:14px auto 6px;width:180px;height:180px}
.card-poles{display:flex;gap:8px;justify-content:center;margin-top:6px}
.pole-chip{border:1px solid var(--accent);color:var(--accent);border-radius:999px;padding:4px 12px;font-size:12px;font-weight:600}
.card-quirk{margin-top:14px;font-size:14px;color:#dcdce6}
.card-watermark{margin-top:18px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;color:#7a7a8a}
.card-actions{display:flex;gap:12px;margin-top:26px;flex-wrap:wrap;justify-content:center}
.btn{background:var(--accent);color:#0b0b10;border:none;border-radius:12px;padding:12px 20px;font-size:15px;font-weight:700;cursor:pointer;text-decoration:none;display:inline-block}
.btn-ghost{background:transparent;color:var(--fg);border:1px solid #ffffff2a}
.evidence-list{display:grid;gap:22px;max-width:680px}
.evidence{border-left:3px solid var(--accent);padding:8px 0 8px 20px;text-align:left}
.evidence p{font-size:clamp(19px,3vw,27px);font-weight:600}
.evidence cite{color:var(--muted);font-style:normal;font-size:14px}
.roast{font-size:clamp(24px,4.5vw,42px);font-weight:800;max-width:760px;letter-spacing:-.02em}
.growth{max-width:680px;font-size:clamp(18px,2.6vw,23px);color:#dcdce6}
.habits{display:grid;gap:10px;margin-top:26px}
.habit{color:var(--muted);font-size:16px;max-width:640px}
.outro .cmd{font-family:ui-monospace,monospace;background:#15151f;border:1px solid #ffffff1a;border-radius:12px;padding:14px 20px;font-size:18px;margin:20px 0}
.big{font-size:clamp(26px,5vw,54px);font-weight:800;letter-spacing:-.02em}
footer{color:var(--muted);font-size:13px;padding:30px;text-align:center}
code{font-family:ui-monospace,monospace;background:#ffffff12;padding:2px 6px;border-radius:6px}
${BRAIN_CSS}
/* chat dock */
#chat-fab{position:fixed;bottom:22px;right:22px;z-index:50;width:56px;height:56px;border-radius:50%;background:var(--accent);color:#0b0b10;border:none;font-size:24px;cursor:pointer;box-shadow:0 6px 24px #0009}
#chat-dock{position:fixed;bottom:22px;right:22px;z-index:51;width:min(380px,92vw);height:min(540px,80vh);background:#12121a;border:1px solid #ffffff1e;border-radius:18px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 12px 48px #000c}
#chat-head{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid #ffffff12}
#chat-head .t{font-weight:800} #chat-head .s{color:var(--muted);font-size:12px}
#chat-close{margin-left:auto;background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer}
#chat-log{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px}
.msg{max-width:82%;padding:10px 14px;border-radius:14px;font-size:14px;line-height:1.45;text-align:left;white-space:pre-wrap}
.msg.user{align-self:flex-end;background:var(--accent);color:#0b0b10;border-bottom-right-radius:4px}
.msg.mirror{align-self:flex-start;background:#1e1e2a;border-bottom-left-radius:4px}
.msg.thinking{color:var(--muted);font-style:italic}
#chat-form{display:flex;gap:8px;padding:12px;border-top:1px solid #ffffff12}
#chat-in{flex:1;background:#1a1a24;border:1px solid #ffffff1a;border-radius:10px;color:var(--fg);padding:10px 12px;font-size:14px;outline:none}
#chat-send{background:var(--accent);border:none;border-radius:10px;color:#0b0b10;font-weight:800;padding:0 16px;cursor:pointer}
</style>
</head>
<body>
  ${brainSection(profile)}

  <section class="snap">
    <div class="kicker">Mirror · ${esc(meta.period)}</div>
    <div class="dash-nums">
      <div class="dash-num"><b>${fmt(stats.totals.prompts)}</b><span>prompts</span></div>
      <div class="dash-num"><b>${fmt(Math.round(stats.totals.estimatedHours))}h</b><span>active time</span></div>
      <div class="dash-num"><b>${fmt(activeDays)}</b><span>active days</span></div>
      <div class="dash-num"><b>${stats.rhythm.longestStreakDays}</b><span>day streak</span></div>
    </div>
    ${dailyChart(stats.daily)}
    <p class="muted small">Hover a bar for the day's detail.</p>
  </section>

  ${deltaSection(profile)}

  <section class="snap">
    <div class="kicker">Your rhythm</div>
    <svg viewBox="0 0 300 300" width="min(66vw,300px)" height="min(66vw,300px)">${ringBars}
      <circle cx="150" cy="150" r="60" fill="none" stroke="#ffffff10"/>
    </svg>
    <div class="rhythm-sub">Your golden hour: <b style="color:var(--accent)">${HOUR_LABEL(
      stats.rhythm.goldenHour
    )}</b> · busiest day ${stats.records.biggestDay ? esc(stats.records.biggestDay.date) + ` (${stats.records.biggestDay.prompts} prompts)` : "—"}</div>
  </section>

  <section class="snap">
    <div class="kicker">The tells</div>
    <div class="quirks">
      ${quirkTop
        .map((q) => `<div class="quirk-line">You said <b>“${esc(q.phrase)}”</b> ${fmt(q.count)} times.</div>`)
        .join("")}
      ${politeness > 0 ? `<div class="quirk-line">You were polite to an AI <b>${fmt(politeness)}</b> times.</div>` : ""}
    </div>
  </section>

  ${personaSections}

  ${
    live
      ? `<button id="chat-fab" title="Talk to your Mirror">🪞</button>
  <div id="chat-dock" hidden>
    <div id="chat-head"><span style="font-size:20px">🪞</span><div><div class="t">Your Mirror</div><div class="s">knows you from ${fmt(
      stats.totals.prompts
    )} prompts · local only</div></div><button id="chat-close">×</button></div>
    <div id="chat-log"></div>
    <form id="chat-form"><input id="chat-in" placeholder="Ask yourself anything…" autocomplete="off"/><button id="chat-send">→</button></form>
  </div>`
      : ""
  }

  <section class="snap outro">
    <div class="kicker">Keep the habit</div>
    <div class="big">Run it again next month.<br/>Watch yourself change.</div>
    <div class="cmd">npx ai-mirror</div>
    <div class="card-actions">
      <a class="btn" id="share-x-2" target="_blank" rel="noopener">Share on X</a>
      <a class="btn btn-ghost" href="https://github.com/" target="_blank" rel="noopener">Star on GitHub ★</a>
    </div>
  </section>

  <footer>
    Parsed ${fmt(meta.eventsParsed)} events, skipped ${fmt(meta.eventsSkipped)} · 100% local · generated ${esc(
    meta.generatedAtHint
  )}${persona ? " · persona via " + esc(persona.generatedBy) : " · stats-only"}
  </footer>

<script>
(function(){
  var shareText = ${JSON.stringify(shareText)};
  var xurl = "https://twitter.com/intent/tweet?text=" + encodeURIComponent(shareText);
  var a = document.getElementById('share-x'); if(a) a.href = xurl;
  var a2 = document.getElementById('share-x-2'); if(a2) a2.href = xurl;

  // Daily chart tooltip
  var chart = document.getElementById('daily-chart');
  var tip = document.getElementById('chart-tip');
  if (chart && tip) {
    chart.addEventListener('mousemove', function(e){
      var t = e.target;
      if (t && t.classList && t.classList.contains('dbar')) {
        tip.hidden = false;
        tip.textContent = t.getAttribute('data-date') + ' · ' + t.getAttribute('data-n') + ' prompts';
        var wrap = chart.parentElement.getBoundingClientRect();
        tip.style.left = Math.min(e.clientX - wrap.left + 12, wrap.width - 160) + 'px';
        tip.style.top = (e.clientY - wrap.top - 34) + 'px';
      } else { tip.hidden = true; }
    });
    chart.addEventListener('mouseleave', function(){ tip.hidden = true; });
  }

  // Donut hover → legend emphasis via title tooltips (native)
  document.querySelectorAll('.seg').forEach(function(s){
    var t = document.createElementNS('http://www.w3.org/2000/svg','title');
    t.textContent = s.getAttribute('data-label') + ': ' + s.getAttribute('data-pct') + '%';
    s.appendChild(t);
  });

  // PNG share-card export via SVG foreignObject (no server, no library)
  function exportCard(){
    var node = document.getElementById('share-card');
    if(!node) return;
    var rect = node.getBoundingClientRect();
    var w = Math.ceil(rect.width), h = Math.ceil(rect.height);
    var clone = node.cloneNode(true);
    var css = Array.prototype.map.call(document.styleSheets, function(s){
      try { return Array.prototype.map.call(s.cssRules, function(r){return r.cssText;}).join('\\n'); }
      catch(e){ return ''; }
    }).join('\\n');
    var xml = new XMLSerializer().serializeToString(clone);
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'">'
      + '<foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml">'
      + '<style>'+css+'</style>'
      + '<div style="width:'+w+'px">'+xml+'</div>'
      + '</div></foreignObject></svg>';
    var img = new Image();
    var svgBlob = new Blob([svg], {type:'image/svg+xml;charset=utf-8'});
    var url = URL.createObjectURL(svgBlob);
    img.onload = function(){
      var scale = 2;
      var canvas = document.createElement('canvas');
      canvas.width = w*scale; canvas.height = h*scale;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#0d0d12'; ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.scale(scale,scale);
      ctx.drawImage(img,0,0);
      URL.revokeObjectURL(url);
      canvas.toBlob(function(blob){
        var a = document.createElement('a');
        a.download = 'claude-mirror-card.png';
        a.href = URL.createObjectURL(blob);
        a.click();
      });
    };
    img.onerror = function(){ alert('PNG export not supported here — screenshot the card instead.'); URL.revokeObjectURL(url); };
    img.src = url;
  }
  var dl = document.getElementById('download-card');
  if(dl) dl.addEventListener('click', exportCard);

  // ---- Mirror chat (live dashboard only) ----
  var fab = document.getElementById('chat-fab');
  if (fab) {
    var dock = document.getElementById('chat-dock');
    var logEl = document.getElementById('chat-log');
    var form = document.getElementById('chat-form');
    var input = document.getElementById('chat-in');
    var messages = [];
    function bubble(role, text){
      var d = document.createElement('div');
      d.className = 'msg ' + role;
      d.textContent = text;
      logEl.appendChild(d);
      logEl.scrollTop = logEl.scrollHeight;
      return d;
    }
    fab.addEventListener('click', function(){
      dock.hidden = false; fab.style.display = 'none';
      if (messages.length === 0) bubble('mirror', "Hey. I'm you — well, the version of you built from your own prompts. Ask me what I think of your habits.");
      input.focus();
    });
    document.getElementById('chat-close').addEventListener('click', function(){
      dock.hidden = true; fab.style.display = '';
    });
    form.addEventListener('submit', function(e){
      e.preventDefault();
      var text = input.value.trim();
      if (!text) return;
      input.value = '';
      messages.push({role:'user', text:text});
      bubble('user', text);
      var think = bubble('mirror thinking', '…');
      fetch('/api/chat', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({messages:messages})})
        .then(function(r){ return r.json(); })
        .then(function(d){
          think.remove();
          var reply = d.reply || ('(' + (d.error || 'no reply') + ')');
          messages.push({role:'mirror', text:reply});
          bubble('mirror', reply);
        })
        .catch(function(err){ think.remove(); bubble('mirror', '(connection lost — is the mirror server still running?)'); });
    });
  }
})();
</script>
</body>
</html>`;
}

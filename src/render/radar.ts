import type { TraitScore } from "../types.js";

// Deterministic 2D SVG radar. Built FIRST (per spec) because it's both the
// graceful fallback for the 3D orb AND the mini-radar on the share card.

const AXIS_ORDER = ["curiosity", "precision", "persistence", "trust", "expression"];
const AXIS_LABEL: Record<string, string> = {
  curiosity: "Curiosity",
  precision: "Precision",
  persistence: "Persistence",
  trust: "Trust",
  expression: "Expression",
};

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

export function radarSvg(
  traits: TraitScore[],
  opts: { size?: number; accent?: string; labels?: boolean } = {}
): string {
  const size = opts.size ?? 320;
  const accent = opts.accent ?? "#7c5cff";
  const showLabels = opts.labels ?? true;
  const cx = size / 2;
  const cy = size / 2;
  const R = size * (showLabels ? 0.34 : 0.42);
  const n = AXIS_ORDER.length;

  const byAxis = new Map(traits.map((t) => [t.axis, t.score]));

  // Grid rings + spokes.
  const rings = [0.25, 0.5, 0.75, 1].map((f) => {
    const pts = AXIS_ORDER.map((_, i) => polar(cx, cy, R * f, (360 / n) * i))
      .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
      .join(" ");
    return `<polygon points="${pts}" fill="none" stroke="#ffffff14" stroke-width="1"/>`;
  });
  const spokes = AXIS_ORDER.map((_, i) => {
    const [x, y] = polar(cx, cy, R, (360 / n) * i);
    return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(
      1
    )}" stroke="#ffffff14" stroke-width="1"/>`;
  });

  // The data polygon.
  const dataPts = AXIS_ORDER.map((axis, i) => {
    const score = Math.max(0, Math.min(100, byAxis.get(axis as any) ?? 0));
    return polar(cx, cy, R * (score / 100), (360 / n) * i);
  });
  const dataStr = dataPts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const dots = dataPts
    .map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${accent}"/>`)
    .join("");

  const labels = showLabels
    ? AXIS_ORDER.map((axis, i) => {
        const [x, y] = polar(cx, cy, R + 18, (360 / n) * i);
        const anchor = Math.abs(x - cx) < 4 ? "middle" : x > cx ? "start" : "end";
        return `<text x="${x.toFixed(1)}" y="${y.toFixed(
          1
        )}" fill="#c9c9d6" font-size="11" text-anchor="${anchor}" dominant-baseline="middle" font-family="Inter,system-ui,sans-serif">${
          AXIS_LABEL[axis]
        }</text>`;
      }).join("")
    : "";

  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  ${rings.join("")}
  ${spokes.join("")}
  <polygon points="${dataStr}" fill="${accent}33" stroke="${accent}" stroke-width="2"/>
  ${dots}
  ${labels}
</svg>`;
}

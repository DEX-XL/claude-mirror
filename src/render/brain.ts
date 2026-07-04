import type { Profile } from "../types.js";

// The Brain: a 3D force-directed map of the user's history.
// Graph data is built here (deterministic); layout + rendering run in the
// browser on a plain <canvas> — no libraries, no CDN, fully offline.

// Category palette — validated (dataviz six checks, dark surface #0d0d12):
// worst adjacent CVD ΔE 15.7, all ≥3:1 contrast, lightness band OK.
export const BRAIN_COLORS = {
  project: "#3987e5", // blue
  tool: "#199e70", // aqua
  habit: "#c98500", // yellow
  trait: "#9085e9", // violet
  voice: "#d55181", // magenta
} as const;

type BrainNode = {
  id: string;
  label: string;
  cat: keyof typeof BRAIN_COLORS | "you";
  size: number; // 1..10 relative
  detail: string; // shown in the side panel
};
type BrainLink = { s: string; t: string; w: number };

export function buildGraph(profile: Profile): { nodes: BrainNode[]; links: BrainLink[] } {
  const { stats, persona } = profile;
  const nodes: BrainNode[] = [];
  const links: BrainLink[] = [];
  const add = (n: BrainNode) => {
    if (!nodes.some((x) => x.id === n.id)) nodes.push(n);
  };
  const link = (s: string, t: string, w = 1) => links.push({ s, t, w });

  // Center: you.
  const youLabel = persona ? persona.archetype.name : "You";
  add({
    id: "you",
    label: youLabel,
    cat: "you",
    size: 10,
    detail: persona
      ? `${persona.archetype.icon} ${persona.archetype.description} (${persona.archetype.rarity})`
      : `${stats.totals.prompts} prompts across ${stats.totals.sessions} sessions.`,
  });

  // Projects (top 6) — scaled by prompt share.
  const topProjects = stats.projects.top.slice(0, 6);
  const maxP = Math.max(...topProjects.map((p) => p.prompts), 1);
  for (const p of topProjects) {
    add({
      id: `proj:${p.name}`,
      label: p.name,
      cat: "project",
      size: 3 + (p.prompts / maxP) * 5,
      detail: `${p.prompts} prompts in this project.`,
    });
    link("you", `proj:${p.name}`, 2);
  }

  // Tools — linked to the projects they were used in (the cross-links that
  // make the graph organic instead of a star).
  const topToolNames = new Set(stats.tools.top.slice(0, 7).map((t) => t.name));
  const maxT = Math.max(...stats.tools.top.map((t) => t.count), 1);
  for (const t of stats.tools.top.slice(0, 7)) {
    add({
      id: `tool:${t.name}`,
      label: t.name,
      cat: "tool",
      size: 2 + (t.count / maxT) * 4,
      detail: `Used ${t.count} times.`,
    });
  }
  const linkedTools = new Set<string>();
  for (const bp of stats.tools.byProject) {
    if (!topToolNames.has(bp.name)) continue;
    if (!topProjects.some((p) => p.name === bp.project)) continue;
    link(`proj:${bp.project}`, `tool:${bp.name}`, Math.min(3, 1 + Math.log10(bp.count)));
    linkedTools.add(bp.name);
  }
  for (const name of topToolNames) {
    if (!linkedTools.has(name)) link("you", `tool:${name}`, 0.5);
  }

  // Voice: quirk phrases.
  for (const q of stats.conversationStyle.quirks.slice(0, 5)) {
    add({
      id: `q:${q.phrase}`,
      label: `“${q.phrase}”`,
      cat: "voice",
      size: 2 + Math.min(4, Math.log2(q.count + 1)),
      detail: `You said this ${q.count} times.`,
    });
    link("you", `q:${q.phrase}`, 0.7);
  }

  if (persona) {
    // Traits.
    for (const t of persona.traits) {
      add({
        id: `trait:${t.axis}`,
        label: t.pole,
        cat: "trait",
        size: 2 + (t.score / 100) * 5,
        detail: `${t.score}/100 — ${t.evidence}`,
      });
      link("you", `trait:${t.axis}`, 1.5);
    }
    // Habits.
    persona.signatureHabits.forEach((h, i) => {
      const short = h.length > 40 ? h.slice(0, 37) + "…" : h;
      add({ id: `habit:${i}`, label: short, cat: "habit", size: 3, detail: h });
      link("you", `habit:${i}`, 1);
    });
    // Work themes attach to their closest project by name overlap, else you.
    persona.projectTypes.forEach((pt, i) => {
      const id = `theme:${i}`;
      add({ id, label: pt.label, cat: "project", size: 3.5, detail: pt.detail });
      const words = pt.detail.toLowerCase();
      const home = topProjects.find((p) => words.includes(p.name.toLowerCase()));
      link(home ? `proj:${home.name}` : "you", id, 1);
    });
  }

  return { nodes, links };
}

/** The hero section markup + the whole 3D engine, inlined. */
export function brainSection(profile: Profile): string {
  const graph = buildGraph(profile);
  const legend = (
    [
      ["project", "Projects"],
      ["trait", "Traits"],
      ["tool", "Tools"],
      ["habit", "Habits"],
      ["voice", "Voice"],
    ] as const
  )
    .map(
      ([k, label]) =>
        `<span class="bl"><i style="background:${BRAIN_COLORS[k]}"></i>${label}</span>`
    )
    .join("");

  return `
  <section class="brain-hero">
    <div class="brain-head">
      <div class="kicker">Your brain</div>
      <div class="brain-legend">${legend}</div>
    </div>
    <div id="brain-wrap">
      <canvas id="brain"></canvas>
      <div id="brain-panel" hidden>
        <button id="bp-close">×</button>
        <div id="bp-title"></div>
        <div id="bp-cat"></div>
        <div id="bp-detail"></div>
      </div>
      <div class="brain-hint">drag to spin · scroll to zoom · click a node</div>
    </div>
  </section>
  <script>
  (function(){
    var GRAPH = ${JSON.stringify(graph)};
    var COLORS = ${JSON.stringify({ ...BRAIN_COLORS, you: "ACCENT" })};
    var canvas = document.getElementById('brain');
    if (!canvas || !canvas.getContext) return;
    var accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#9085e9';
    COLORS.you = accent;
    var ctx = canvas.getContext('2d');
    var wrap = document.getElementById('brain-wrap');
    var DPR = Math.min(2, window.devicePixelRatio || 1);
    var W, H;
    function resize(){
      W = wrap.clientWidth; H = wrap.clientHeight;
      canvas.width = W*DPR; canvas.height = H*DPR;
      canvas.style.width = W+'px'; canvas.style.height = H+'px';
      ctx.setTransform(DPR,0,0,DPR,0,0);
    }
    resize(); window.addEventListener('resize', resize);

    // ---- graph setup ----
    var N = GRAPH.nodes.map(function(n,i){
      var golden = 2.399963; var r = n.id==='you' ? 0 : 60 + (i%5)*18;
      var th = i*golden, ph = (i*1.7)%Math.PI;
      return {
        d: n,
        x: r*Math.sin(ph)*Math.cos(th), y: r*Math.sin(ph)*Math.sin(th), z: r*Math.cos(ph),
        vx:0, vy:0, vz:0,
        px:0, py:0, ps:1, pz:0
      };
    });
    var idx = {}; N.forEach(function(n,i){ idx[n.d.id]=i; });
    var L = GRAPH.links.filter(function(l){return idx[l.s]!=null && idx[l.t]!=null;})
      .map(function(l){ return {a:idx[l.s], b:idx[l.t], w:l.w}; });
    var neighbors = {}; L.forEach(function(l){
      (neighbors[l.a]=neighbors[l.a]||[]).push(l.b);
      (neighbors[l.b]=neighbors[l.b]||[]).push(l.a);
    });

    // ---- force simulation (3D) ----
    var settled = 0;
    function tick(){
      var i,j,n,m;
      for(i=0;i<N.length;i++){
        n=N[i];
        for(j=i+1;j<N.length;j++){
          m=N[j];
          var dx=n.x-m.x, dy=n.y-m.y, dz=n.z-m.z;
          var d2=dx*dx+dy*dy+dz*dz+0.01;
          var f=1400/d2;
          if(f>2)f=2;
          var d=Math.sqrt(d2);
          dx/=d;dy/=d;dz/=d;
          n.vx+=dx*f;n.vy+=dy*f;n.vz+=dz*f;
          m.vx-=dx*f;m.vy-=dy*f;m.vz-=dz*f;
        }
      }
      L.forEach(function(l){
        var a=N[l.a],b=N[l.b];
        var dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z;
        var d=Math.sqrt(dx*dx+dy*dy+dz*dz)+0.01;
        var target = 55 + 18/(l.w||1);
        var f=(d-target)*0.012*(l.w||1);
        dx/=d;dy/=d;dz/=d;
        a.vx+=dx*f;a.vy+=dy*f;a.vz+=dz*f;
        b.vx-=dx*f;b.vy-=dy*f;b.vz-=dz*f;
      });
      var ke=0;
      N.forEach(function(n){
        // gentle centering
        n.vx-=n.x*0.002;n.vy-=n.y*0.002;n.vz-=n.z*0.002;
        n.vx*=0.86;n.vy*=0.86;n.vz*=0.86;
        if(n.d.id!=='you'){ n.x+=n.vx;n.y+=n.vy;n.z+=n.vz; }
        ke+=n.vx*n.vx+n.vy*n.vy+n.vz*n.vz;
      });
      if(ke<0.5) settled++;
      return ke;
    }
    for(var w=0; w<120; w++) tick(); // pre-warm

    // ---- camera / interaction ----
    var rotY=0.4, rotX=0.25, zoom=1, auto=true;
    var drag=false, lx=0, ly=0, moved=0;
    var hover=-1, selected=-1;
    canvas.addEventListener('pointerdown',function(e){drag=true;moved=0;lx=e.clientX;ly=e.clientY;auto=false;});
    window.addEventListener('pointerup',function(e){
      drag=false;
      if(moved<5){ // treat as click
        if(hover>=0){ select(hover); } else { select(-1); }
      }
      setTimeout(function(){auto=true;},4000);
    });
    window.addEventListener('pointermove',function(e){
      if(drag){
        rotY+=(e.clientX-lx)*0.006; rotX+=(e.clientY-ly)*0.004;
        rotX=Math.max(-1.2,Math.min(1.2,rotX));
        moved+=Math.abs(e.clientX-lx)+Math.abs(e.clientY-ly);
        lx=e.clientX;ly=e.clientY;
      }
    });
    canvas.addEventListener('wheel',function(e){
      e.preventDefault();
      zoom*=e.deltaY<0?1.1:0.9; zoom=Math.max(0.4,Math.min(2.6,zoom));
    },{passive:false});
    canvas.addEventListener('mousemove',function(e){
      var r=canvas.getBoundingClientRect();
      var mx=e.clientX-r.left,my=e.clientY-r.top;
      hover=-1;var best=18;
      for(var i=0;i<N.length;i++){
        var dx=N[i].px-mx,dy=N[i].py-my;
        var d=Math.sqrt(dx*dx+dy*dy);
        var hit=Math.max(10, N[i].ps*N[i].d.size*1.6);
        if(d<hit && d<best){best=d;hover=i;}
      }
      canvas.style.cursor=hover>=0?'pointer':'grab';
    });

    var panel=document.getElementById('brain-panel');
    var bpT=document.getElementById('bp-title'),bpC=document.getElementById('bp-cat'),bpD=document.getElementById('bp-detail');
    document.getElementById('bp-close').addEventListener('click',function(){select(-1);});
    var CATNAME={you:'You',project:'Project',tool:'Tool',habit:'Habit',trait:'Trait',voice:'Voice'};
    function select(i){
      selected=i;
      if(i<0){panel.hidden=true;return;}
      var n=N[i].d;
      bpT.textContent=n.label;
      bpC.textContent=CATNAME[n.cat]||n.cat;
      bpC.style.color=COLORS[n.cat]||accent;
      bpD.textContent=n.detail;
      panel.hidden=false;
    }

    // ---- render loop ----
    function frame(){
      requestAnimationFrame(frame);
      if(settled<40) tick();
      if(auto && !drag) rotY+=0.0022;
      var sy=Math.sin(rotY),cy=Math.cos(rotY),sx=Math.sin(rotX),cx=Math.cos(rotX);
      var cxp=W/2, cyp=H/2;
      var FOV=420;
      for(var i=0;i<N.length;i++){
        var n=N[i];
        var x=n.x*cy+n.z*sy, z1=-n.x*sy+n.z*cy;
        var y=n.y*cx-z1*sx, z=n.y*sx+z1*cx;
        var s=FOV/(FOV+z*1.4)*zoom;
        n.px=cxp+x*s*1.5; n.py=cyp+y*s*1.5; n.ps=s; n.pz=z;
      }
      ctx.clearRect(0,0,W,H);
      // edges
      L.forEach(function(l){
        var a=N[l.a],b=N[l.b];
        var lit = hover>=0 && (l.a===hover||l.b===hover) || selected>=0 && (l.a===selected||l.b===selected);
        var depth=Math.max(0.12, 1-((a.pz+b.pz)/2+160)/420);
        ctx.strokeStyle=lit?accent:'rgba(255,255,255,'+(0.06+depth*0.10).toFixed(3)+')';
        ctx.lineWidth=lit?1.4:0.7;
        ctx.beginPath();ctx.moveTo(a.px,a.py);ctx.lineTo(b.px,b.py);ctx.stroke();
      });
      // nodes back-to-front
      var order=N.map(function(_,i){return i;}).sort(function(a,b){return N[b].pz-N[a].pz;});
      order.forEach(function(i){
        var n=N[i];
        var col=COLORS[n.d.cat]||accent;
        var r=Math.max(2.5, n.d.size*2.1*n.ps);
        var dim = (hover>=0 || selected>=0);
        var isLit = i===hover || i===selected ||
          (hover>=0 && (neighbors[hover]||[]).indexOf(i)>=0) ||
          (selected>=0 && (neighbors[selected]||[]).indexOf(i)>=0);
        ctx.globalAlpha = dim && !isLit ? 0.25 : 1;
        // glow
        var g=ctx.createRadialGradient(n.px,n.py,0,n.px,n.py,r*2.2);
        g.addColorStop(0,col);g.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle=g;ctx.globalAlpha*= 0.5;
        ctx.beginPath();ctx.arc(n.px,n.py,r*2.2,0,7);ctx.fill();
        ctx.globalAlpha = dim && !isLit ? 0.3 : 1;
        ctx.fillStyle=col;
        ctx.beginPath();ctx.arc(n.px,n.py,r,0,7);ctx.fill();
        // labels: center + big nodes always; others when lit/near
        var showLabel = n.d.cat==='you' || n.d.size>=4.2 || isLit;
        if(showLabel && n.ps>0.55){
          ctx.font=(n.d.cat==='you'?'700 ':'')+(Math.max(10,11*n.ps))+'px Inter,system-ui,sans-serif';
          ctx.fillStyle= isLit||n.d.cat==='you' ? '#f4f4f8' : 'rgba(220,220,235,0.75)';
          ctx.textAlign='center';
          ctx.fillText(n.d.label, n.px, n.py - r - 6);
        }
        ctx.globalAlpha=1;
      });
    }
    frame();
  })();
  </script>`;
}

/** CSS for the brain hero (kept next to its markup). */
export const BRAIN_CSS = `
.brain-hero{position:relative;min-height:96vh;display:flex;flex-direction:column;padding:4vh 4vw 2vh}
.brain-head{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px}
.brain-legend{display:flex;gap:14px;flex-wrap:wrap}
.bl{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--muted)}
.bl i{width:10px;height:10px;border-radius:50%;display:inline-block}
#brain-wrap{position:relative;flex:1;min-height:72vh;border:1px solid #ffffff10;border-radius:20px;background:radial-gradient(ellipse at 50% 40%,#14141d 0%,#0d0d12 70%)}
#brain{position:absolute;inset:0;width:100%;height:100%;border-radius:20px;cursor:grab}
.brain-hint{position:absolute;bottom:12px;left:0;right:0;text-align:center;color:#6a6a7a;font-size:12px;pointer-events:none}
#brain-panel{position:absolute;top:16px;right:16px;width:min(300px,80vw);background:#15151fee;border:1px solid #ffffff1e;border-radius:16px;padding:18px 20px;text-align:left;backdrop-filter:blur(8px)}
#bp-close{position:absolute;top:8px;right:12px;background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer}
#bp-title{font-weight:800;font-size:18px;padding-right:20px}
#bp-cat{font-size:11px;text-transform:uppercase;letter-spacing:.15em;margin:4px 0 8px}
#bp-detail{color:#c9c9d6;font-size:14px;line-height:1.5}
`;

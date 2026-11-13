// Tide-pool renderer, seen from above: sea at the top, rocky shore below.
// Values = tide pools. Size = how much a value matters now; the life inside = its nuance.
// Emotion = the tide. Hard days bring the water in over the pools; it always goes back out.
// Interface: createPools(canvas) -> { set(state), hitTest(x, y) }.
import { hash, starPos } from './layout.js';

const TAU = Math.PI * 2;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const ease = (a, b, k = 0.06) => a + (b - a) * k;

// Creatures appear in this order as nuance grows: [kind, nuance threshold, max count].
const LIFE = [['weed', 0, 4], ['snail', 0.15, 3], ['anemone', 0.3, 3], ['star', 0.45, 2], ['crab', 0.6, 1], ['fish', 0.72, 3]];

export function createPools(canvas) {
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, dpr = 1, rocks = null;
  let state = { brightness: {}, weather: { storm: 0, glow: 0 }, links: [], nuance: {}, selected: null };
  const shown = { storm: 0, glow: 0, b: {}, n: {}, pos: {} };
  let placed = {}; // name -> { x, y, r } as drawn, for tapping
  const drops = Array.from({ length: 180 }, (_, i) => ({ x: hash('dx' + i), y: hash('dy' + i), v: 0.7 + hash('dv' + i) }));

  const scale = () => clamp(w / 1100, 0.55, 1);
  const zone = () => ({ top: h * 0.42, bot: Math.max(h * 0.42 + 60, h - 245) }); // between the note/panel and the footer

  function resize() {
    dpr = window.devicePixelRatio || 1;
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rocks = paintShore();
  }

  // The shore never changes, so paint it once per resize.
  function paintShore() {
    const c = document.createElement('canvas'); c.width = w * dpr; c.height = h * dpr;
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const base = g.createLinearGradient(0, h * 0.2, 0, h);
    base.addColorStop(0, '#3f4b4f'); base.addColorStop(0.45, '#5f5c55'); base.addColorStop(1, '#7d725f');
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const s = scale();
    for (let i = 0; i < 320; i++) {
      const x = hash('rx' + i) * w, y = h * 0.2 + hash('ry' + i) * h * 0.85, r = (5 + hash('rr' + i) * 28) * s;
      const l = 60 + hash('rl' + i) * 55 + (y / h) * 25;
      g.fillStyle = `rgba(${l | 0},${(l * 0.95) | 0},${(l * 0.86) | 0},${0.35 + 0.4 * hash('ra' + i)})`;
      g.beginPath(); g.ellipse(x, y, r * (1 + hash('re' + i)), r, hash('rt' + i) * TAU, 0, TAU); g.fill();
    }
    for (let i = 0; i < 500; i++) { // pebbles and grit
      g.fillStyle = `rgba(230,220,200,${0.08 + 0.12 * hash('pa' + i)})`;
      g.fillRect(hash('px' + i) * w, h * 0.22 + hash('py' + i) * h * 0.8, 1.5, 1.5);
    }
    return c;
  }
  window.addEventListener('resize', resize); resize();

  // Deterministic layout from each value's name, then nudge pools apart so none overlap.
  function layout(names) {
    const { top, bot } = zone(), s = scale();
    const pts = names.map((n) => {
      const p = starPos(n);
      return { n, x: w * (0.08 + ((p.x - 0.1) / 0.8) * 0.84), y: top + ((p.y - 0.12) / 0.5) * (bot - top), r: (16 + 44 * (state.brightness[n] || 0)) * s };
    });
    for (let it = 0; it < 60; it++) {
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j];
        let dx = (b.x - a.x) / 1.25, dy = (b.y - a.y) / 0.8; // pools are wide ellipses
        let d = Math.hypot(dx, dy);
        const min = a.r + b.r + 22 * s;
        if (d >= min) continue;
        if (d < 1e-3) { dx = Math.cos(hash(a.n + b.n) * TAU); dy = Math.sin(hash(a.n + b.n) * TAU); d = 1; }
        const push = (min - d) / 2;
        a.x -= (dx / d) * push * 1.25; a.y -= (dy / d) * push * 0.8;
        b.x += (dx / d) * push * 1.25; b.y += (dy / d) * push * 0.8;
      }
      for (const p of pts) { p.x = clamp(p.x, p.r * 1.3 + 8, w - p.r * 1.3 - 8); p.y = clamp(p.y, top, bot); }
    }
    return Object.fromEntries(pts.map((p) => [p.n, p]));
  }

  function poolPath(x, y, r, seed, grow = 1) {
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * TAU;
      const k = grow * (1 + 0.12 * Math.sin(3 * a + seed * 6) + 0.07 * Math.sin(5 * a + seed * 11));
      const px = x + Math.cos(a) * r * k * 1.25, py = y + Math.sin(a) * r * k * 0.8;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  }

  // ---- creatures --------------------------------------------------------------------------
  const draw = {
    weed(x, y, s, t, ph) {
      ctx.strokeStyle = 'rgba(96,160,92,0.9)'; ctx.lineWidth = 2 * s; ctx.lineCap = 'round';
      for (let k = -1; k <= 1; k++) {
        const sway = Math.sin(t * 1.1 + ph + k) * 4 * s;
        ctx.beginPath(); ctx.moveTo(x + k * 3 * s, y + 6 * s);
        ctx.quadraticCurveTo(x + k * 4 * s + sway * 0.5, y, x + k * 3 * s + sway, y - (9 + 3 * Math.abs(k)) * s); ctx.stroke();
      }
    },
    snail(x, y, s) {
      ctx.fillStyle = '#7a5a3e'; ctx.beginPath(); ctx.arc(x, y, 3 * s, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(240,220,190,0.7)'; ctx.lineWidth = 0.8 * s;
      ctx.beginPath(); ctx.arc(x, y, 1.6 * s, 0, TAU * 0.8); ctx.stroke();
    },
    anemone(x, y, s, t, ph) {
      ctx.strokeStyle = 'rgba(236,128,170,0.9)'; ctx.lineWidth = 1.4 * s; ctx.lineCap = 'round';
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU + Math.sin(t * 1.5 + ph + i) * 0.18;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 6 * s, y + Math.sin(a) * 6 * s); ctx.stroke();
      }
      ctx.fillStyle = '#f6c0d4'; ctx.beginPath(); ctx.arc(x, y, 2.4 * s, 0, TAU); ctx.fill();
    },
    star(x, y, s, t, ph) {
      ctx.fillStyle = '#ef8a4a'; ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = ph * TAU + (i / 10) * TAU, rr = (i % 2 ? 2.4 : 6.5) * s;
        i ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.fill();
    },
    crab(x, y, s, t, ph, pool) {
      const cx = x + Math.sin(t * 0.6 + ph * 9) * pool.r * 0.25;
      ctx.strokeStyle = '#c4503a'; ctx.lineWidth = 1.2 * s;
      for (let k = -1; k <= 1; k++) for (const side of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(cx + side * 4 * s, y + k * 1.6 * s); ctx.lineTo(cx + side * 8 * s, y + k * 2.6 * s + 2 * s); ctx.stroke();
      }
      ctx.fillStyle = '#d8604a'; ctx.beginPath(); ctx.ellipse(cx, y, 5 * s, 3.4 * s, 0, 0, TAU); ctx.fill();
      for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + side * 6 * s, y - 4 * s, 1.8 * s, 0, TAU); ctx.fill(); }
    },
    fish(x, y, s, t, ph, pool, i) {
      const dir = i % 2 ? 1 : -1, a = t * 0.45 * dir + ph * TAU;
      const fx = pool.x + Math.cos(a) * pool.r * 0.6 * 1.25, fy = pool.y + Math.sin(a) * pool.r * 0.6 * 0.8;
      const heading = a + (dir * Math.PI) / 2;
      ctx.save(); ctx.translate(fx, fy); ctx.rotate(heading);
      ctx.fillStyle = 'rgba(220,236,240,0.9)'; ctx.beginPath(); ctx.ellipse(0, 0, 4 * s, 1.7 * s, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-3.5 * s, 0); ctx.lineTo(-6.5 * s, -2 * s); ctx.lineTo(-6.5 * s, 2 * s); ctx.closePath(); ctx.fill();
      ctx.restore();
    },
  };

  function drawPool(name, p, br, nu, t, G, selected) {
    const seed = hash(name + 'seed'), s = clamp(p.r / 30, 0.75, 1.6);
    // rim of darker rock, then the water
    ctx.fillStyle = 'rgba(40,44,46,0.55)'; poolPath(p.x, p.y + 2, p.r, seed, 1.12); ctx.fill();
    const wg = ctx.createRadialGradient(p.x, p.y, p.r * 0.1, p.x, p.y, p.r * 1.3);
    wg.addColorStop(0, `rgb(${18 + 20 * G},${78 + 40 * br},${96 + 30 * br})`);
    wg.addColorStop(1, `rgb(${70 + 40 * G},${150 + 30 * br},${158 + 20 * br})`);
    ctx.fillStyle = wg; poolPath(p.x, p.y, p.r, seed); ctx.fill();

    ctx.save(); poolPath(p.x, p.y, p.r, seed); ctx.clip();
    for (const [kind, th, max] of LIFE) {
      if (nu < th) continue;
      const count = Math.min(max, 1 + Math.floor((nu - th) * max * 2.5));
      ctx.globalAlpha = clamp((nu - th) / 0.05, 0, 1);
      for (let i = 0; i < count; i++) {
        const a = hash(name + kind + i) * TAU, rr = Math.sqrt(hash(name + kind + 'r' + i)) * 0.72 * p.r;
        draw[kind](p.x + Math.cos(a) * rr * 1.25, p.y + Math.sin(a) * rr * 0.8, s, t, hash(name + kind + 'p' + i), p, i);
      }
    }
    ctx.globalAlpha = 1;
    // sunlight dancing on the surface on good days
    if (G > 0.05) {
      for (let i = 0; i < 6; i++) {
        const a = hash(name + 'g' + i) * TAU, rr = hash(name + 'gr' + i) * p.r;
        ctx.fillStyle = `rgba(255,246,210,${Math.max(0, Math.sin(t * 1.6 + i * 2)) * 0.6 * G})`;
        ctx.fillRect(p.x + Math.cos(a) * rr * 1.2, p.y + Math.sin(a) * rr * 0.75, 4 * s, 1.2);
      }
    }
    ctx.restore();

    ctx.strokeStyle = selected ? 'rgba(255,236,170,0.9)' : 'rgba(220,240,240,0.25)'; ctx.lineWidth = selected ? 2 : 1;
    poolPath(p.x, p.y, p.r, seed, selected ? 1.06 : 1); ctx.stroke();
  }

  function frame(ms) {
    const t = ms / 1000;
    shown.storm = ease(shown.storm, state.weather.storm, 0.04);
    shown.glow = ease(shown.glow, state.weather.glow, 0.04);
    for (const k of new Set([...Object.keys(shown.b), ...Object.keys(state.brightness)])) shown.b[k] = ease(shown.b[k] || 0, state.brightness[k] || 0);
    for (const k of new Set([...Object.keys(shown.n), ...Object.keys(state.nuance)])) shown.n[k] = ease(shown.n[k] || 0, state.nuance[k] || 0);
    const S = shown.storm, G = shown.glow;

    const names = Object.keys(shown.b).filter((n) => shown.b[n] > 0.02);
    const target = layout(names);
    placed = {};
    for (const n of names) {
      const tp = target[n], cur = (shown.pos[n] ||= { x: tp.x, y: tp.y });
      cur.x = ease(cur.x, tp.x, 0.08); cur.y = ease(cur.y, tp.y, 0.08);
      placed[n] = { x: cur.x, y: cur.y, r: tp.r };
    }

    ctx.drawImage(rocks, 0, 0, w, h);

    // channels between values that come up together
    for (const [a, b, c] of state.links) {
      const pa = placed[a], pb = placed[b];
      if (!pa || !pb) continue;
      ctx.strokeStyle = `rgba(110,170,176,${Math.min(0.6, 0.15 * c) * Math.min(shown.b[a], shown.b[b])})`;
      ctx.lineWidth = 3 * scale(); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y);
      ctx.quadraticCurveTo((pa.x + pb.x) / 2 + (hash(a + b) - 0.5) * 40, (pa.y + pb.y) / 2 + 14, pb.x, pb.y); ctx.stroke();
    }

    for (const n of names) drawPool(n, placed[n], shown.b[n], shown.n[n] || 0, t, G, state.selected === n);

    // pool labels
    ctx.textAlign = 'center'; ctx.font = `${Math.round(12 + scale())}px Inter, system-ui, sans-serif`;
    for (const n of names) {
      const p = placed[n];
      ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.45 * shown.b[n]})`;
      ctx.fillText(n, p.x, p.y + p.r * 0.8 * 1.15 + 15);
    }

    // THE TIDE. Low tide sits near the top; hard feelings bring it in over the pools. Always eased, always receding.
    const low = h * 0.27, edgeBase = low + S * h * 0.58 + Math.sin(t * 0.25) * 5;
    const edgeAt = (x) => edgeBase + Math.sin(x / 90 + t * 1.2) * (3 + S * 10) + Math.sin(x / 37 - t * 1.7) * (1.5 + S * 4);
    const deep = [[18, 52, 86], [44, 56, 72]], shallow = [[60, 140, 156], [70, 92, 106]];
    const mixc = (pair, k) => pair[0].map((v, i) => Math.round(v + (pair[1][i] - v) * k));
    const d = mixc(deep, S), sh = mixc(shallow, S);
    const tg = ctx.createLinearGradient(0, 0, 0, edgeBase + 20);
    tg.addColorStop(0, `rgba(${d},1)`);
    tg.addColorStop(clamp(low / (edgeBase + 20), 0.01, 0.99), `rgba(${sh},0.95)`);
    tg.addColorStop(1, `rgba(${sh},0.55)`); // over the rocks the water is see-through: the pools are still there
    ctx.fillStyle = tg;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, 0);
    for (let x = w; x >= -10; x -= 10) ctx.lineTo(x, edgeAt(x));
    ctx.closePath(); ctx.fill();
    // foam lines
    for (const [off, a] of [[0, 0.6], [-9, 0.25]]) {
      ctx.strokeStyle = `rgba(240,250,255,${a})`; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = -10; x <= w + 10; x += 10) { const y = edgeAt(x) + off + Math.sin(x / 23 + t * 2) * 1.2; x < 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.stroke();
    }
    // sparkle on the open sea on good days
    if (G > 0.05) {
      for (let i = 0; i < 50; i++) {
        const gx = hash('sx' + i) * w, gy = hash('sy' + i) * Math.max(10, edgeBase - 20);
        ctx.fillStyle = `rgba(255,240,200,${Math.max(0, Math.sin(t * 1.3 + i)) * 0.5 * G})`;
        ctx.fillRect(gx, gy, 3 + hash('sw' + i) * 5, 1.3);
      }
      const sun = ctx.createRadialGradient(w * 0.85, 0, 0, w * 0.85, 0, h * 0.6);
      sun.addColorStop(0, `rgba(255,214,150,${0.22 * G})`); sun.addColorStop(1, 'rgba(255,214,150,0)');
      ctx.fillStyle = sun; ctx.fillRect(0, 0, w, h);
    }
    // storm: dim light and rain
    if (S > 0.03) {
      ctx.fillStyle = `rgba(20,26,40,${0.3 * S})`; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = `rgba(190,210,235,${0.4 * S})`; ctx.lineWidth = 1;
      for (const dr of drops) {
        const y = ((dr.y + t * 0.6 * dr.v) % 1) * h;
        ctx.beginPath(); ctx.moveTo(dr.x * w, y); ctx.lineTo(dr.x * w - 4, y + 14); ctx.stroke();
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    set: (s) => { state = { ...state, ...s }; },
    hitTest(x, y) {
      let best = null, bestD = Infinity;
      for (const [n, p] of Object.entries(placed)) {
        const d = Math.hypot((x - p.x) / (p.r * 1.25), (y - p.y) / (p.r * 0.8));
        if (d < 1.15 && d < bestD) { best = n; bestD = d; }
      }
      return best;
    },
  };
}

// Canvas renderer. Values = stars (slow). Emotion = weather (fast, always clears).
import { hash, starPos } from './layout.js';

export function createSky(canvas) {
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, state = { brightness: {}, weather: { storm: 0, glow: 0 }, links: [] };
  // Smoothed copies so the sky eases between states instead of snapping.
  const shown = { storm: 0, glow: 0, b: {} };
  const bg = Array.from({ length: 140 }, (_, i) => ({ x: hash('bx' + i), y: hash('by' + i) * 0.8, r: 0.4 + hash('br' + i) * 1.1, p: hash('bp' + i) * 6.28 }));
  const drops = Array.from({ length: 160 }, (_, i) => ({ x: hash('dx' + i), y: hash('dy' + i), v: 0.6 + hash('dv' + i) }));

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize); resize();

  const ease = (a, b) => a + (b - a) * 0.06;

  function frame(ts) {
    const t = ts / 1000;
    shown.storm = ease(shown.storm, state.weather.storm);
    shown.glow = ease(shown.glow, state.weather.glow);
    for (const k of new Set([...Object.keys(shown.b), ...Object.keys(state.brightness)])) shown.b[k] = ease(shown.b[k] || 0, state.brightness[k] || 0);

    // Sky gradient: deep indigo, warmed by glow, greyed by storm.
    const g = ctx.createLinearGradient(0, 0, 0, h);
    const mix = (a, b, k) => Math.round(a + (b - a) * k);
    g.addColorStop(0, `rgb(${mix(10, 28, shown.storm)},${mix(14, 30, shown.storm)},${mix(40, 46, shown.storm)})`);
    g.addColorStop(1, `rgb(${mix(28, 40, shown.storm) + shown.glow * 30},${mix(30, 40, shown.storm) + shown.glow * 40},${mix(70, 58, shown.storm)})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    // Aurora (positive emotion).
    if (shown.glow > 0.02) {
      for (let i = 0; i < 3; i++) {
        const y0 = h * (0.18 + i * 0.09);
        const ag = ctx.createLinearGradient(0, y0 - 60, 0, y0 + 90);
        ag.addColorStop(0, 'rgba(120,255,200,0)'); ag.addColorStop(0.5, `rgba(${120 + i * 40},255,${200 - i * 30},${0.22 * shown.glow})`); ag.addColorStop(1, 'rgba(120,200,255,0)');
        ctx.fillStyle = ag; ctx.beginPath(); ctx.moveTo(0, y0 + 90);
        for (let x = 0; x <= w; x += 20) ctx.lineTo(x, y0 + Math.sin(x / 140 + t * 0.4 + i) * 28);
        ctx.lineTo(w, y0 + 90); ctx.closePath(); ctx.fill();
      }
    }

    // Background stars.
    for (const s of bg) {
      ctx.globalAlpha = (0.25 + 0.35 * Math.sin(t + s.p) ** 2) * (1 - 0.7 * shown.storm);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s.x * w, s.y * h, s.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Constellation lines between values that co-occur.
    ctx.lineWidth = 1;
    for (const [a, b, n] of state.links) {
      const pa = starPos(a), pb = starPos(b), ba = shown.b[a] || 0, bb = shown.b[b] || 0;
      ctx.strokeStyle = `rgba(190,210,255,${Math.min(0.5, 0.08 * n) * Math.min(ba, bb)})`;
      ctx.beginPath(); ctx.moveTo(pa.x * w, pa.y * h); ctx.lineTo(pb.x * w, pb.y * h); ctx.stroke();
    }

    // Value stars.
    ctx.textAlign = 'center'; ctx.font = '13px Inter, system-ui, sans-serif';
    for (const [name, br] of Object.entries(shown.b)) {
      if (br < 0.02) continue;
      const { x, y } = starPos(name), r = 3 + br * 9, px = x * w, py = y * h + Math.sin(t * 0.5 + x * 9) * 3;
      const rg = ctx.createRadialGradient(px, py, 0, px, py, r * 4);
      rg.addColorStop(0, `rgba(255,236,170,${0.55 * br})`); rg.addColorStop(1, 'rgba(255,236,170,0)');
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(px, py, r * 4, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff6d6'; ctx.beginPath(); ctx.arc(px, py, r * 0.6, 0, 7); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.55 * br})`; ctx.fillText(name, px, py + r * 1.6 + 12);
    }

    // Storm: clouds + rain, only as strong as the decayed emotion.
    if (shown.storm > 0.02) {
      for (let i = 0; i < 6; i++) {
        const cx = ((hash('c' + i) + t * 0.01 * (0.5 + hash('cs' + i))) % 1.2 - 0.1) * w, cy = h * (0.08 + 0.1 * hash('cy' + i));
        const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 160);
        cg.addColorStop(0, `rgba(70,76,96,${0.55 * shown.storm})`); cg.addColorStop(1, 'rgba(70,76,96,0)');
        ctx.fillStyle = cg; ctx.fillRect(cx - 160, cy - 160, 320, 320);
      }
      ctx.strokeStyle = `rgba(170,190,230,${0.35 * shown.storm})`; ctx.lineWidth = 1;
      for (const d of drops) {
        const y = ((d.y + t * 0.5 * d.v) % 1) * h;
        ctx.beginPath(); ctx.moveTo(d.x * w, y); ctx.lineTo(d.x * w - 3, y + 12); ctx.stroke();
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return { set: (s) => { state = s; } };
}

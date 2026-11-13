// Pure model logic: no DOM, so it is testable in node.
export const DAY = 86400000;
export const EMOTION_HALF_LIFE_DAYS = 2;
export const VALUE_HALF_LIFE_DAYS = 30;

const decay = (ageMs, halfLifeDays) => Math.pow(0.5, ageMs / (halfLifeDays * DAY));

/** Entries visible at time t (the sky can be scrubbed back in time). */
export const upTo = (entries, t) => entries.filter((e) => e.ts <= t);

/**
 * Current emotional "weather" at time t.
 * storm: 0..1 decayed negative intensity; glow: 0..1 decayed positive intensity.
 * Because of decay, a single spike can never dominate for long.
 */
export function weather(entries, t) {
  let neg = 0, pos = 0;
  for (const e of upTo(entries, t)) {
    const w = e.emotion.intensity * decay(t - e.ts, EMOTION_HALF_LIFE_DAYS);
    if (e.emotion.valence < 0) neg += w * -e.emotion.valence;
    else pos += w * e.emotion.valence;
  }
  const squash = (x) => 1 - Math.exp(-x); // keeps result in 0..1
  return { storm: squash(neg), glow: squash(pos) };
}

/** Brightness 0..1 per value name at time t (slow-moving, normalised to the brightest). */
export function valueBrightness(entries, t) {
  const raw = {};
  for (const e of upTo(entries, t)) {
    const d = decay(t - e.ts, VALUE_HALF_LIFE_DAYS);
    for (const v of e.values) raw[v.name] = (raw[v.name] || 0) + v.weight * d;
  }
  const max = Math.max(1e-9, ...Object.values(raw));
  const out = {};
  for (const [k, x] of Object.entries(raw)) out[k] = x / max;
  return out;
}

/** What rose / fell between two moments. Positive delta = brighter now. */
export function thenVsNow(entries, now, daysBack = 90) {
  const then = valueBrightness(entries, now - daysBack * DAY);
  const cur = valueBrightness(entries, now);
  const names = new Set([...Object.keys(then), ...Object.keys(cur)]);
  return [...names]
    .map((name) => ({ name, then: then[name] || 0, now: cur[name] || 0, delta: (cur[name] || 0) - (then[name] || 0) }))
    .sort((a, b) => b.delta - a.delta);
}

/** Everything known about each value up to time t: the raw material for nuance and stories. */
function valueFacts(entries, t) {
  const facts = {};
  for (const e of upTo(entries, t)) {
    const names = e.values.map((v) => v.name);
    for (const name of names) {
      const f = (facts[name] ||= { count: 0, first: e.ts, last: e.ts, low: e, high: e, links: {} });
      f.count++; f.first = Math.min(f.first, e.ts); f.last = Math.max(f.last, e.ts);
      if (e.emotion.valence < f.low.emotion.valence) f.low = e;
      if (e.emotion.valence > f.high.emotion.valence) f.high = e;
      for (const other of names) if (other !== name) f.links[other] = (f.links[other] || 0) + 1;
    }
  }
  return facts;
}

/**
 * Nuance 0..1 per value: how richly you have explored it, separate from how much it matters right now.
 * Grows with: separate thoughts, emotional range (felt it on good AND hard days), links to other values,
 * and how long it has been part of your life. Unlike brightness it does not decay: understanding accumulates.
 */
export function nuance(entries, t) {
  const out = {};
  for (const [name, f] of Object.entries(valueFacts(entries, t))) {
    const thoughts = 1 - Math.exp(-f.count / 4);
    const range = (f.high.emotion.valence - f.low.emotion.valence) / 2;
    const links = 1 - Math.exp(-Object.keys(f.links).length / 2.5);
    const span = 1 - Math.exp(-(f.last - f.first) / (45 * DAY));
    out[name] = 0.35 * thoughts + 0.25 * range + 0.2 * links + 0.2 * span;
  }
  return out;
}

/** Plain-language story for one value, shown when its pool is tapped. */
export function valueStory(entries, t, name) {
  const f = valueFacts(entries, t)[name];
  if (!f) return null;
  const title = name[0].toUpperCase() + name.slice(1);
  const since = new Date(f.first).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  const lines = [`${f.count} ${f.count === 1 ? 'thought' : 'thoughts'} since ${since}.`];
  const lo = f.low.emotion.label, hi = f.high.emotion.label;
  if (f.count > 1 && lo && hi && lo !== hi) lines.push(`Felt it from ${lo} to ${hi}.`);
  else if (f.count === 1) lines.push('Just starting to take shape.');
  const linked = Object.entries(f.links).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n);
  if (linked.length) lines.push(`Grows alongside ${linked.length > 1 ? linked.slice(0, -1).join(', ') + ' and ' + linked.at(-1) : linked[0]}.`);
  return { title, lines };
}

const NOTE_WORDS = {
  tide: { quiet: 'A calm shore. Whenever you are ready, add a thought.', event: 'A high tide', cleared: 'and it has gone back out.', fading: 'It is already going back out.' },
  sky: { quiet: 'A quiet sky. Whenever you are ready, add a thought.', event: 'A storm', cleared: 'and it has cleared.', fading: 'It is already fading.' },
};

/** Hopeful one-liner. Frames passing emotion as passing, never as a "mood drop". */
export function weeklyNote(entries, now, style = 'tide') {
  const words = NOTE_WORDS[style] || NOTE_WORDS.tide;
  const week = entries.filter((e) => e.ts > now - 7 * DAY && e.ts <= now);
  if (!week.length) return words.quiet;
  const peak = week.reduce((a, b) => (b.emotion.valence * -b.emotion.intensity > a.emotion.valence * -a.emotion.intensity ? b : a));
  const rising = thenVsNow(entries, now, 30)[0];
  const w = weather(entries, now);
  const parts = [];
  if (peak.emotion.valence < -0.3 && peak.emotion.intensity > 0.5) {
    const day = new Date(peak.ts).toLocaleDateString(undefined, { weekday: 'long' });
    parts.push(w.storm < 0.25 ? `${words.event} on ${day}, ${words.cleared}` : `${words.event} on ${day}. ${words.fading}`);
  } else parts.push('A steady week.');
  if (rising && rising.delta > 0.1) parts.push(`${rising.name[0].toUpperCase() + rising.name.slice(1)} has been growing in importance to you.`);
  return parts.join(' ');
}

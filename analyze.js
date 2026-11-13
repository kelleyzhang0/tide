// Turns free text into { values: [{name, weight}], emotion: {valence, intensity, label} }.
// Uses Claude if the user supplied a key (kept in localStorage only), else a local heuristic.
const MODEL = 'claude-haiku-5-5';

const PROMPT = `You read a short private journal thought. Return ONLY JSON:
{"values":[{"name":"<1-2 word lowercase value/theme>","weight":0..1}],
 "emotion":{"valence":-1..1,"intensity":0..1,"label":"<one word>"}}
Rules: 1-3 values describing what the person CARES about (e.g. craft, family, autonomy, growth),
not the topic. Emotion is how they feel right now. No commentary.`;

export async function analyze(text, apiKey) {
  if (apiKey) {
    try { return await viaClaude(text, apiKey); } catch (err) { console.warn('Claude failed, using heuristic', err); }
  }
  return heuristic(text);
}

async function viaClaude(text, apiKey) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 300, system: PROMPT, messages: [{ role: 'user', content: text }] }),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  const raw = data.content?.[0]?.text ?? '';
  return normalize(JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)));
}

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, Number(x) || 0));
export function normalize(o) {
  return {
    values: (o.values || []).slice(0, 3).map((v) => ({ name: String(v.name).toLowerCase().trim(), weight: clamp(v.weight, 0, 1) })),
    emotion: { valence: clamp(o.emotion?.valence, -1, 1), intensity: clamp(o.emotion?.intensity, 0, 1), label: String(o.emotion?.label || '') },
  };
}

const VALUE_WORDS = {
  craft: ['build', 'ship', 'quality', 'design', 'code', 'make', 'craft'],
  family: ['mom', 'dad', 'family', 'sister', 'brother', 'home', 'parents'],
  growth: ['learn', 'grow', 'better', 'improve', 'practice', 'skill'],
  autonomy: ['freedom', 'choose', 'own', 'independent', 'control', 'my way'],
  impact: ['help', 'impact', 'matter', 'change', 'purpose', 'meaning'],
  connection: ['friend', 'together', 'talk', 'miss', 'lonely', 'people'],
  stability: ['money', 'rent', 'safe', 'secure', 'stable', 'job', 'salary'],
  rest: ['tired', 'sleep', 'rest', 'burnout', 'break', 'slow'],
};
const POS = ['happy', 'excited', 'proud', 'grateful', 'love', 'great', 'hope', 'good', 'calm', 'joy'];
const NEG = ['sad', 'angry', 'anxious', 'worried', 'stress', 'afraid', 'hate', 'awful', 'bad', 'overwhelmed', 'frustrated', 'lost'];

export function heuristic(text) {
  const t = text.toLowerCase();
  const values = Object.entries(VALUE_WORDS)
    .map(([name, words]) => ({ name, weight: Math.min(1, words.filter((w) => t.includes(w)).length / 2) }))
    .filter((v) => v.weight > 0).sort((a, b) => b.weight - a.weight).slice(0, 3);
  if (!values.length) values.push({ name: 'reflection', weight: 0.5 });
  const pos = POS.filter((w) => t.includes(w)).length, neg = NEG.filter((w) => t.includes(w)).length;
  const bangs = (t.match(/!/g) || []).length;
  const valence = clamp((pos - neg) / Math.max(1, pos + neg), -1, 1);
  const intensity = clamp(0.25 + 0.2 * (pos + neg) + 0.1 * bangs, 0, 1);
  return { values, emotion: { valence, intensity, label: valence > 0.2 ? 'bright' : valence < -0.2 ? 'heavy' : 'even' } };
}

import { DAY, weather, valueBrightness, thenVsNow, weeklyNote, upTo, nuance, valueStory } from './model.js';
import { analyze } from './analyze.js';
import { load, save, exportJson, demoData, API_KEY, VIEW_KEY } from './store.js';

const $ = (id) => document.getElementById(id);
// Same data, two drawings. The renderer is loaded on demand; switching reloads the page.
const view = localStorage.getItem(VIEW_KEY) === 'sky' ? 'sky' : 'shore';
document.body.classList.add(`view-${view}`);
const sky = view === 'sky' ? (await import('./sky.js')).createSky($('sky')) : (await import('./pools.js')).createPools($('sky'));
$('view').textContent = view === 'sky' ? 'Switch to shore' : 'Switch to sky';
$('view').onclick = () => { localStorage.setItem(VIEW_KEY, view === 'sky' ? 'shore' : 'sky'); location.reload(); };
let entries = load();
let viewT = Date.now(); // the moment being shown; slider scrubs it
let selected = null; // tapped tide pool

function showStory() {
  const story = selected && valueStory(entries, viewT, selected);
  if (!story) { $('story').hidden = true; selected = null; return; }
  $('storyTitle').textContent = story.title;
  $('storyText').replaceChildren(...story.lines.map((l) => Object.assign(document.createElement('p'), { textContent: l })));
  $('story').hidden = false;
}
if (sky.hitTest) {
  $('sky').addEventListener('click', (ev) => {
    const r = $('sky').getBoundingClientRect();
    selected = sky.hitTest(ev.clientX - r.left, ev.clientY - r.top);
    render();
  });
  $('sky').style.cursor = 'pointer';
}
$('storyClose').onclick = () => { selected = null; render(); };

const span = () => {
  const start = entries.length ? Math.min(...entries.map((e) => e.ts)) - DAY : Date.now() - 30 * DAY;
  return { start, end: Date.now() };
};

function links(t) {
  const n = {};
  for (const e of upTo(entries, t)) {
    const names = e.values.map((v) => v.name);
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
      const k = [names[i], names[j]].sort().join('|'); n[k] = (n[k] || 0) + 1;
    }
  }
  return Object.entries(n).map(([k, c]) => [...k.split('|'), c]);
}

function render() {
  sky.set({ brightness: valueBrightness(entries, viewT), weather: weather(entries, viewT), links: links(viewT), nuance: nuance(entries, viewT), selected });
  showStory();
  const live = Math.abs(viewT - Date.now()) < 60000;
  $('when').textContent = live ? 'Now' : new Date(viewT).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  $('note').textContent = weeklyNote(entries, viewT, view === 'sky' ? 'sky' : 'tide');
  $('driftList').replaceChildren(...thenVsNow(entries, viewT, 90).filter((d) => d.then || d.now).slice(0, 6).map((d) => {
    const li = document.createElement('li'), name = document.createElement('b'), arrow = document.createElement('span');
    name.textContent = d.name;
    const pct = Math.round(d.delta * 100);
    arrow.textContent = pct === 0 ? '·' : `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}`;
    arrow.className = pct > 0 ? 'up' : 'down';
    li.append(name, arrow); return li;
  }));
  $('mode').textContent = localStorage.getItem(API_KEY) ? 'Analysis: Claude' : 'Analysis: local heuristic';
  if (!entries.length) $('note').textContent = 'An empty shore. Add a thought, or load the demo.';
}

function syncSlider() {
  const { start, end } = span();
  $('time').value = Math.round(((viewT - start) / (end - start)) * 1000);
}

$('time').addEventListener('input', (ev) => {
  const { start, end } = span();
  viewT = start + (ev.target.value / 1000) * (end - start);
  render();
});

$('form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const text = $('text').value.trim(); if (!text) return;
  $('text').value = ''; $('text').placeholder = 'Reading the tide…';
  const a = await analyze(text, localStorage.getItem(API_KEY));
  entries.push({ id: crypto.randomUUID(), ts: Date.now(), text, ...a }); save(entries);
  $('text').placeholder = "What's on your mind?";
  viewT = Date.now(); syncSlider(); render();
});

$('demo').onclick = () => { entries = demoData(); save(entries); viewT = Date.now(); syncSlider(); render(); };
$('clear').onclick = () => { if (confirm('Delete all entries from this browser?')) { entries = []; save(entries); render(); } };
$('key').onclick = () => {
  const k = prompt('Paste an Anthropic API key (stored only in this browser). Leave blank to remove.');
  if (k === null) return;
  k.trim() ? localStorage.setItem(API_KEY, k.trim()) : localStorage.removeItem(API_KEY); render();
};
$('export').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([exportJson(entries)], { type: 'application/json' }));
  a.download = 'tide-export.json'; a.click();
};

const validEntry = (e) => e && Number.isFinite(e.ts) && typeof e.text === 'string' && Array.isArray(e.values) && e.emotion && Number.isFinite(e.emotion.valence) && Number.isFinite(e.emotion.intensity);
$('import').onclick = () => $('importFile').click();
$('importFile').addEventListener('change', async (ev) => {
  const file = ev.target.files[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data) || !data.every(validEntry)) throw new Error('bad shape');
    const have = new Set(entries.map((e) => e.id));
    entries = [...entries, ...data.filter((e) => !have.has(e.id))].sort((a, b) => a.ts - b.ts); // skip duplicates
    save(entries); viewT = Date.now(); syncSlider(); render();
  } catch { alert('That file is not a Tide export.'); }
  ev.target.value = '';
});

syncSlider(); render();

import assert from 'node:assert/strict';
import { DAY, weather, valueBrightness, thenVsNow, nuance, valueStory, weeklyNote } from './model.js';

const T = Date.UTC(2026, 0, 31);
const mk = (daysAgo, valence, intensity, values = [{ name: 'craft', weight: 1 }]) => ({
  ts: T - daysAgo * DAY, text: 'x', values, emotion: { valence, intensity, label: '' },
});

// A spike fades: storm right after > storm a week later.
const spike = [mk(0, -1, 1)];
const s0 = weather(spike, T).storm, s7 = weather(spike, T + 7 * DAY).storm;
assert.ok(s0 > 0.5 && s7 < s0 / 4, `spike should fade: ${s0} -> ${s7}`);

// Future entries are ignored when scrubbing back.
assert.equal(weather(spike, T - DAY).storm, 0);

// Values are slow: an old, repeated value outshines a single fresh one after 3 days.
const vals = [mk(40, 0, 0, [{ name: 'family', weight: 1 }]), mk(35, 0, 0, [{ name: 'family', weight: 1 }]), mk(0, 0, 0, [{ name: 'speed', weight: 1 }])];
const b = valueBrightness(vals, T);
assert.ok(b.family > b.speed * 0.5, 'old values should not vanish quickly');

// then-vs-now surfaces the riser first.
const drift = thenVsNow([mk(120, 0, 0, [{ name: 'a', weight: 1 }]), mk(5, 0, 0, [{ name: 'b', weight: 1 }])], T, 90);
assert.equal(drift[0].name, 'b');

// Nuance: a value explored many times, on good and hard days, with links, beats a one-off mention.
const v = (name, extra = []) => [{ name, weight: 1 }, ...extra.map((n) => ({ name: n, weight: 0.5 }))];
const rich = [mk(80, -0.8, 0.8, v('craft', ['rest'])), mk(50, 0.9, 0.7, v('craft', ['impact'])), mk(20, 0.2, 0.4, v('craft')), mk(5, 0.6, 0.5, v('craft', ['autonomy']))];
const thin = [mk(1, 0.5, 0.5, v('speed'))];
const nu = nuance([...rich, ...thin], T);
assert.ok(nu.craft > 0.6 && nu.speed < 0.2, `nuance should separate rich from thin: ${nu.craft} vs ${nu.speed}`);
assert.ok(nu.craft >= nuance(rich.slice(0, 2), T).craft, 'nuance should not shrink as you write more');
assert.equal(nuance(rich, T - 90 * DAY).craft, undefined, 'nuance ignores the future');

// Story reads naturally and respects time.
const story = valueStory(rich, T, 'craft');
assert.equal(story.title, 'Craft');
assert.match(story.lines[0], /^4 thoughts since/);
assert.match(story.lines.at(-1), /^Grows alongside /);
assert.equal(valueStory(rich, T, 'nope'), null);

// Weekly note uses tide words by default.
assert.match(weeklyNote([mk(1, -0.9, 0.9)], T), /high tide/i);

console.log('model tests passed');

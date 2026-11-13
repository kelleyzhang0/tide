import { DAY } from './model.js';

const KEY = 'tide.entries.v1';
export const API_KEY = 'tide.apikey';
export const VIEW_KEY = 'tide.view';

export const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
export const save = (entries) => localStorage.setItem(KEY, JSON.stringify(entries));
export const exportJson = (entries) => JSON.stringify(entries, null, 2);

/** ~5 months of fictional history: values drift from stability toward craft/autonomy; storms pass. */
export function demoData(now = Date.now()) {
  const e = (d, text, values, valence, intensity, label) => ({
    id: `demo${d}`, ts: now - d * DAY, text, values: values.map(([name, weight]) => ({ name, weight })), emotion: { valence, intensity, label },
  });
  return [
    e(150, 'Need the salary to be safe. Rent keeps going up.', [['stability', 1]], -0.3, 0.5, 'tense'),
    e(140, 'Another quarter at the job. Secure, but is this it?', [['stability', 0.8], ['growth', 0.3]], -0.1, 0.3, 'even'),
    e(120, 'Called mom. Grateful for family dinners.', [['family', 1]], 0.7, 0.5, 'warm'),
    e(105, 'Learned something new today, felt great to get better at it.', [['growth', 0.9]], 0.6, 0.5, 'bright'),
    e(90, 'Rejected from the role. Awful. Feeling lost.', [['stability', 0.6], ['growth', 0.4]], -0.9, 0.95, 'crushed'),
    e(87, 'Still stung, but talked it through with a friend.', [['connection', 0.9]], -0.2, 0.35, 'softer'),
    e(75, 'Started building a side project. Love making things.', [['craft', 0.9], ['autonomy', 0.5]], 0.7, 0.7, 'excited'),
    e(60, 'Shipped the first version! Proud of the design.', [['craft', 1], ['impact', 0.4]], 0.9, 0.8, 'proud'),
    e(45, 'I want to choose my own work. Freedom matters more than I thought.', [['autonomy', 1]], 0.4, 0.5, 'clear'),
    e(30, 'Overwhelmed with deadlines, so stressed!', [['rest', 0.8], ['craft', 0.3]], -0.8, 0.85, 'frazzled'),
    e(27, 'Slept, took a real break. Calm again.', [['rest', 0.9]], 0.5, 0.4, 'calm'),
    e(14, 'Want to build things that help people. Purpose, finally.', [['impact', 1], ['craft', 0.6]], 0.8, 0.7, 'hopeful'),
    e(6, 'Friends came over. Good to be together.', [['connection', 0.8]], 0.7, 0.5, 'warm'),
    e(2, 'Anxious about applications, but I know what I value now.', [['craft', 0.6], ['autonomy', 0.5], ['impact', 0.5]], -0.3, 0.5, 'steady'),
  ];
}

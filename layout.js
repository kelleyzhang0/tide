// Shared deterministic layout: the same value name always lands in the same spot.
export const hash = (s) => {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  // avalanche finalizer: without it, keys differing only in the last char give correlated values
  h ^= h >>> 16; h = Math.imul(h, 2246822507); h ^= h >>> 13; h = Math.imul(h, 3266489909); h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
};
export const starPos = (name) => ({ x: 0.1 + 0.8 * hash(name + 'x'), y: 0.12 + 0.5 * hash(name + 'y') });


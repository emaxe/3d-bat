// Детерминированный RNG (mulberry32) — одинаковые сиды => одинаковые волны/эффекты.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rng = {
  float(r, min, max) { return min + r() * (max - min); },
  int(r, min, max) { return Math.floor(min + r() * (max - min + 1)); },
  pick(r, arr) { return arr[Math.floor(r() * arr.length)]; },
  chance(r, p) { return r() < p; },
};

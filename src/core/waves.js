// Композиции волн, фазы луны, генератор бесконечного режима.
import { mulberry32, rng as rngUtil } from './rng.js';

export const MOON_PHASES = {
  blood: {
    name: 'Кровавая луна',
    desc: 'Враги быстрее и жаднее: +25% скорость, +20% эссенция',
    speedMul: 1.25, rewardMul: 1.2, towerMul: 1.0, cloakAll: false, color: '#ff4455',
  },
  new: {
    name: 'Новолуние',
    desc: 'Тьма скрывает врагов — все невидимы! Построй Эхо или Фонарь.',
    speedMul: 1.0, rewardMul: 1.0, towerMul: 1.0, cloakAll: true, color: '#8890c0',
  },
  full: {
    name: 'Полнолуние',
    desc: 'Лунный свет заряжает стражей: +50% эссенция, +10% урон башен',
    speedMul: 1.0, rewardMul: 1.5, towerMul: 1.1, cloakAll: false, color: '#ffe9a0',
  },
};

// Ручные волны 1..10: группы {type, count, interval(с), delay(с до первой)}.
const HANDCRAFTED = [
  { groups: [{ type: 'moth', count: 6, interval: 1.6, delay: 1.0 }] },                                       // 1
  { groups: [{ type: 'moth', count: 10, interval: 1.1, delay: 1.0 }, { type: 'beetle', count: 2, interval: 4, delay: 8 }] }, // 2
  { groups: [{ type: 'moth', count: 8, interval: 0.9, delay: 0.5 }, { type: 'beetle', count: 4, interval: 3, delay: 6 }, { type: 'swarm', count: 6, interval: 0.35, delay: 14 }] }, // 3
  { groups: [{ type: 'beetle', count: 6, interval: 2.5, delay: 1 }, { type: 'cloak', count: 3, interval: 3.5, delay: 6 }, { type: 'swarm', count: 12, interval: 0.3, delay: 16 }, { type: 'healer', count: 2, interval: 6, delay: 12 }] }, // 4
  { groups: [{ type: 'moth', count: 6, interval: 1.4, delay: 1 }, { type: 'spider', count: 1, interval: 1, delay: 12 }, { type: 'ranger', count: 2, interval: 5, delay: 7 }] },   // 5 босс
  { groups: [{ type: 'cloak', count: 5, interval: 2.2, delay: 1 }, { type: 'regen', count: 3, interval: 4, delay: 8 }, { type: 'swarm', count: 12, interval: 0.3, delay: 18 }, { type: 'healer', count: 3, interval: 5, delay: 14 }] }, // 6
  { groups: [{ type: 'beetle', count: 8, interval: 1.6, delay: 1 }, { type: 'regen', count: 4, interval: 3, delay: 7 }, { type: 'cloak', count: 2, interval: 4, delay: 15 }, { type: 'ranger', count: 3, interval: 4, delay: 10 }, { type: 'healer', count: 2, interval: 6, delay: 18 }] },  // 7
  { groups: [{ type: 'cloak', count: 6, interval: 2.0, delay: 1 }, { type: 'swarm', count: 10, interval: 0.6, delay: 7 }, { type: 'healer', count: 2, interval: 5, delay: 12 }, { type: 'regen', count: 3, interval: 3.5, delay: 15 }, { type: 'ranger', count: 2, interval: 5, delay: 20 }] }, // 8
  { groups: [{ type: 'regen', count: 6, interval: 2.4, delay: 1 }, { type: 'swarm', count: 12, interval: 0.3, delay: 8 }, { type: 'beetle', count: 2, interval: 3, delay: 16 }, { type: 'ranger', count: 4, interval: 3.5, delay: 10 }, { type: 'healer', count: 3, interval: 4, delay: 18 }] }, // 9
  { groups: [{ type: 'cloak', count: 6, interval: 2.0, delay: 1 }, { type: 'swarm', count: 12, interval: 0.45, delay: 8 }, { type: 'healer', count: 2, interval: 5, delay: 12 }, { type: 'vampmoth', count: 1, interval: 1, delay: 18 }, { type: 'ranger', count: 2, interval: 5, delay: 22 }] }, // 10 босс
];

export const TOTAL_WAVES = HANDCRAFTED.length; // 10 — после них бесконечный режим

const MOON_SCHEDULE = { 2: 'new', 3: 'blood', 4: 'full', 5: 'new', 6: 'blood', 8: 'new', 9: 'full', 10: 'blood' };

export function moonForWave(wave) {
  if (wave > TOTAL_WAVES) {
    // endless: циклично blood/new/full
    const seq = ['blood', 'new', 'full'];
    return seq[(wave - 1) % 3];
  }
  return MOON_SCHEDULE[wave] || null;
}

// Разворачивает группы волны в плоский список спавнов [{type, t}].
export function flattenWave(groups) {
  const spawns = [];
  for (const g of groups) {
    for (let i = 0; i < g.count; i++) {
      spawns.push({ type: g.type, t: g.delay + i * g.interval });
    }
  }
  spawns.sort((a, b) => a.t - b.t);
  return spawns;
}

// Генератор бесконечной волны (детерминирован от номера волны).
export function genEndlessWave(wave) {
  const r = mulberry32(wave * 7919 + 13);
  const count = 8 + Math.floor(wave * 1.6);
  const pool = ['moth', 'beetle', 'swarm', 'cloak', 'regen', 'healer', 'ranger'];
  const groups = [];
  // 2-4 группы случайного состава
  const nGroups = rngUtil.int(r, 2, 4);
  for (let gi = 0; gi < nGroups; gi++) {
    const type = rngUtil.pick(r, pool);
    const cnt = Math.max(2, Math.round(count / nGroups) + rngUtil.int(r, -2, 4));
    const interval = rngUtil.float(r, 0.3, 1.8);
    const delay = 1 + gi * rngUtil.float(r, 5, 8);
    groups.push({ type, count: cnt, interval, delay });
  }
  // с шансом босс-камео
  if (wave % 5 === 0) {
    groups.push({ type: wave % 10 === 0 ? 'vampmoth' : 'spider', count: 1, interval: 1, delay: 8 });
  }
  return groups;
}

export function waveGroups(wave) {
  if (wave <= TOTAL_WAVES) {return HANDCRAFTED[wave - 1].groups;}
  return genEndlessWave(wave);
}

export function waveSpawns(wave) {
  return flattenWave(waveGroups(wave));
}

// Превью состава волны: [{type, n}] — для показа игроку до старта.
export function wavePreview(wave) {
  const counts = {};
  for (const s of waveSpawns(wave)) {counts[s.type] = (counts[s.type] || 0) + 1;}
  return Object.entries(counts).map(([type, n]) => ({ type, n }));
}

export function isBossWave(wave) {
  return waveGroups(wave).some(g => ENEMY_IS_BOSS(g.type));
}

import { ENEMY_TYPES } from './enemies.js';
function ENEMY_IS_BOSS(type) { return ENEMY_TYPES[type]?.boss || false; }

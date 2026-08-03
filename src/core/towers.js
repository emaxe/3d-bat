// Статы башен-стражей, таргетинг, эффект стаи, слияние. Всё чистое, без three.

export const TOWER_TYPES = {
  screamer: {
    id: 'screamer', name: 'Визгун', cost: 50,
    upgradeCost: [40, 70],
    damage: [14, 26, 42], rate: [0.8, 0.72, 0.65], range: [7, 7.6, 8.2],
    color: '#ff5a4e', glow: '#ff8a7a',
    desc: 'Быстрые сонар-болты. Меткий одиночный урон.',
    alpha: {
      name: 'Альфа-Визгун', damage: 34, rate: 0.45, range: 9,
      color: '#ff2a1e', glow: '#ffb0a0',
      passive: 'Цепная молния: болт перескакивает на 2 соседних врагов.',
    },
  },
  frost: {
    id: 'frost', name: 'Иней', cost: 60,
    upgradeCost: [45, 75],
    damage: [6, 10, 16], rate: [1.0, 0.9, 0.8], range: [6, 6.5, 7],
    color: '#5ac8ff', glow: '#a8e8ff',
    desc: 'Ледяные болты замедляют врагов.',
    alpha: {
      name: 'Альфа-Иней', damage: 12, rate: 0.7, range: 8,
      color: '#3aa8ff', glow: '#d0f0ff',
      passive: 'Вечная аура мороза: замедляет всех врагов в радиусе 6.',
    },
  },
  spore: {
    id: 'spore', name: 'Спора', cost: 40,
    upgradeCost: [30, 55],
    damage: [4, 7, 11], rate: [1.4, 1.25, 1.1], range: [5.5, 6, 6.5],
    color: '#7be04a', glow: '#c8ffa0',
    desc: 'Дешёвый страж. Яд гложет врагов 4 секунды.',
    alpha: {
      name: 'Альфа-Спора', damage: 9, rate: 0.9, range: 7,
      color: '#5ac02a', glow: '#e0ffc0',
      passive: 'Грибница: убитый враг заражает ближайших ядом.',
    },
  },
  echo: {
    id: 'echo', name: 'Эхо', cost: 70,
    upgradeCost: [55, 90],
    damage: [5, 9, 15], rate: [2.0, 1.8, 1.6], range: [9, 9.5, 10],
    color: '#c56bff', glow: '#e8c0ff',
    desc: 'Сонар-импульс раскрывает невидимок и делает врагов уязвимее.',
    alpha: {
      name: 'Альфа-Эхо', damage: 12, rate: 1.2, range: 12,
      color: '#a040ff', glow: '#f0d8ff',
      passive: 'Вечное эхо: поле раскрытия и уязвимости в радиусе 8.',
    },
  },
  fire: {
    id: 'fire', name: 'Жар', cost: 85,
    upgradeCost: [65, 110],
    damage: [12, 20, 34], rate: [1.6, 1.45, 1.3], range: [6.5, 7, 7.5],
    color: '#ff9a2a', glow: '#ffd0a0',
    desc: 'Огненные шары с взрывом по площади.',
    alpha: {
      name: 'Альфа-Жар', damage: 26, rate: 1.0, range: 8,
      color: '#ff7a00', glow: '#ffe0b0',
      passive: 'Пожарище: взрывы поджигают землю, враги горят 3 с.',
    },
  },
  lantern: {
    id: 'lantern', name: 'Фонарь', cost: 60,
    upgradeCost: [45, 80],
    damage: [0, 0, 0], rate: [5, 4.2, 3.5], range: [4.5, 5.5, 6.5],
    color: '#ffd94a', glow: '#fff0b0',
    desc: 'Приманка: манит врагов к себе, сбивая с пути.',
    alpha: {
      name: 'Альфа-Фонарь', damage: 0, rate: 2.6, range: 8.5,
      color: '#ffc94a', glow: '#fff6c8',
      passive: 'Сирена: приманивает издалека, приманенные замедлены.',
    },
  },
  vampire: {
    id: 'vampire', name: 'Вампир', cost: 140,
    upgradeCost: [100, 160],
    damage: [22, 36, 55], rate: [0.7, 0.6, 0.5], range: [7, 7.5, 8],
    color: '#e03050', glow: '#ff90a0',
    desc: 'Кровопийца. Каждое убийство лечит Кристалл.',
    alpha: {
      name: 'Альфа-Вампир', damage: 30, rate: 0.5, range: 8.5,
      color: '#b02040', glow: '#ff90a0',
      passive: 'Вампиризм: убийства лечат Кристалл втрое и дают +50% эссенции.',
    },
  },
};

export const MAX_LEVEL = 3;
export const FLOCK_RADIUS = 3.0;
export const FLOCK_BONUS = 0.15;
export const FLOCK_MAX = 4; // макс соседей учитывается
export const MERGE_RADIUS = 3.0;

export function towerStats(typeId, level) {
  const t = TOWER_TYPES[typeId];
  const i = Math.min(level, MAX_LEVEL) - 1;
  return {
    damage: t.damage[i],
    rate: t.rate[i],
    range: t.range[i],
  };
}

export function upgradeCost(typeId, level) {
  const t = TOWER_TYPES[typeId];
  if (!t.upgradeCost) return Infinity;
  return t.upgradeCost[level - 1] ?? Infinity; // level 1->2, 2->3
}

// Выбор цели: враг с максимальным прогрессом по пути в радиусе.
// Предпочитаем раскрытых невидимок (если есть) — иначе берём лучшую из видимых.
export function pickTarget(enemies, origin, range, preferRevealed = true) {
  let best = null, bestProg = -Infinity;
  let bestRevealed = null, bestRevealedProg = -Infinity;
  for (const e of enemies) {
    if (!e.alive || e.dead) continue;
    const d = e.pos.distSq(origin);
    if (d > range * range) continue;
    const revealed = !e.cloaked || e.effects.revealed > 0;
    if (revealed && e.progress > bestRevealedProg) { bestRevealed = e; bestRevealedProg = e.progress; }
    if (e.progress > bestProg) { best = e; bestProg = e.progress; }
  }
  if (preferRevealed && bestRevealed) return bestRevealed;
  return best;
}

// Эффект стаи: +15% урона за соседнюю башню того же типа (макс +60%).
export function flockBonus(typeId, towers, origin) {
  let n = 0;
  for (const t of towers) {
    if (t.typeId === typeId && t !== origin && t.alive && t.pos.distSq(origin) <= FLOCK_RADIUS * FLOCK_RADIUS) n++;
  }
  return Math.min(n, FLOCK_MAX) * FLOCK_BONUS;
}

// Проверка возможности слияния двух башен.
export function canMerge(a, b) {
  if (!a || !b) return false;
  if (a === b || a.typeId !== b.typeId || a.dead || b.dead) return false;
  const t = TOWER_TYPES[a.typeId];
  if (!t.alpha) return false;
  if (a.level < MAX_LEVEL || b.level < MAX_LEVEL) return false;
  return a.pos.distSq(b.pos) <= MERGE_RADIUS * MERGE_RADIUS;
}

// Найти кандидата на слияние для башни (первого подходящего соседа).
export function mergePartner(tower, towers) {
  for (const t of towers) {
    if (canMerge(tower, t)) return t;
  }
  return null;
}

// Стоимость слияния: 60% от суммы цен апгрейдов обеих.
export function mergeCost(a, b) {
  const t = TOWER_TYPES[a.typeId];
  const total = (t.cost + t.upgradeCost[0] + t.upgradeCost[1]) * 2;
  return Math.round(total * 0.6);
}

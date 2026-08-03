// Статы врагов и эффекты. Чистые функции.

export const ENEMY_TYPES = {
  moth:       { name: 'Мотылёк',     hp: 60,   speed: 2.2, reward: 8,   r: 0.32, dmg: 1,  armor: 0,    heal: 0,  cloaked: false, color: '#c9b7ff', boss: false, icon: '🦋' },
  beetle:     { name: 'Бронежук',    hp: 180,  speed: 1.4, reward: 16,  r: 0.45, dmg: 1,  armor: 0.2,  heal: 0,  cloaked: false, color: '#8a7f6a', boss: false, icon: '🪲' },
  swarm:      { name: 'Рой',         hp: 25,   speed: 3.4, reward: 4,   r: 0.22, dmg: 1,  armor: 0,    heal: 0,  cloaked: false, color: '#ffe98a', boss: false, icon: '🐝' },
  cloak:      { name: 'Невидимка',   hp: 90,   speed: 2.6, reward: 20,  r: 0.34, dmg: 1,  armor: 0,    heal: 0,  cloaked: true,  color: '#9fe8ff', boss: false, icon: '👻' },
  regen:      { name: 'Регенератор', hp: 140,  speed: 2.0, reward: 25,  r: 0.40, dmg: 1,  armor: 0,    heal: 6,  cloaked: false, color: '#ff9ad5', boss: false, icon: '🧬' },
  healer:     { name: 'Жрец',        hp: 150,  speed: 1.9, reward: 24,  r: 0.42, dmg: 1,  armor: 0,    heal: 0,  cloaked: false, color: '#ffd0e8', boss: false, icon: '🕯️', healAura: 5, healAuraR: 2.6 },
  ranger:     { name: 'Стрелок',     hp: 110,  speed: 1.8, reward: 26,  r: 0.38, dmg: 0,  armor: 0,    heal: 0,  cloaked: false, color: '#ffb84a', boss: false, icon: '🎯', ranged: { dmg: 1, cd: 2.2, dist: 9 } },
  spider:     { name: 'Паучиха',     hp: 1400, speed: 0.8, reward: 120, r: 1.00, dmg: 5,  armor: 0.25, heal: 0,  cloaked: false, color: '#4a3f66', boss: true, icon: '🕷️' },
  spiderling: { name: 'Паучонок',    hp: 120,  speed: 1.6, reward: 10,  r: 0.30, dmg: 1,  armor: 0,    heal: 0,  cloaked: false, color: '#6a5a8a', boss: false, icon: '🕷️' },
  vampmoth:   { name: 'Вампир-мотылёк', hp: 2600, speed: 1.5, reward: 250, r: 1.10, dmg: 10, armor: 0.15, heal: 4, cloaked: false, color: '#ff3355', boss: true, icon: '🦇' },
};

export const EFFECT_DEFS = {
  slow:   { dur: 1.5, strong: 0.35, names: ['Мороз', 'Стужа', 'Ледяная хватка'] },
  poison: { dps: 8, names: ['Яд', 'Токсин', 'Грибная гниль'] },
  vuln:   { bonus: 0.25, names: ['Разрез', 'Раскол', 'Разрыв эха'] },
  burn:   { dps: 10, dur: 3, names: ['Ожог', 'Пламя', 'Пожарище'] },
};

// Базовая скорость с учётом замедления.
export function effectiveSpeed(baseSpeed, slowMult) {
  return baseSpeed * Math.max(0.15, 1 - slowMult);
}

// Итоговый урон с учётом брони и уязвимости.
export function damageTaken(baseDamage, armor, vulnBonus) {
  return baseDamage * (1 - Math.min(0.8, armor)) * (1 + vulnBonus);
}

// ХП врага с учётом скейлинга волны.
export function scaledHp(baseHp, wave, endless = false) {
  const k = endless ? 1.22 : 1.18;
  return baseHp * Math.pow(k, wave - 1);
}

// Награда с учётом скейлинга волны (округляется до целых).
export function scaledReward(baseReward, wave, endless = false) {
  const k = endless ? 1.1 : 1.06;
  return Math.round(baseReward * Math.pow(k, wave - 1));
}

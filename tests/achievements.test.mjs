// Юнит-тесты системы достижений: node --test 'tests/*.test.mjs'
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACHIEVEMENTS,
  getAchievement,
  evaluateMetric,
  achievementProgress,
  checkAchievements,
  applyRunToLifetime,
  normalizeUnlocked,
} from '../src/core/achievements.js';

test('ACHIEVEMENTS: каталог содержит ровно 14 достижений с уникальными id и валидными полями', () => {
  assert.equal(ACHIEVEMENTS.length, 14, 'в каталоге должно быть ровно 14 достижений');

  const seenIds = new Set();
  for (const ach of ACHIEVEMENTS) {
    assert.ok(typeof ach.id === 'string' && ach.id.length > 0, `id должен быть непустой строкой: ${ach.id}`);
    assert.ok(!seenIds.has(ach.id), `дубликат id достижения: ${ach.id}`);
    seenIds.add(ach.id);

    assert.ok(typeof ach.name === 'string' && ach.name.length > 0, `у ${ach.id} должно быть непустое имя`);
    assert.ok(typeof ach.desc === 'string' && ach.desc.length > 0, `у ${ach.id} должно быть непустое описание`);
    assert.ok(typeof ach.icon === 'string' && ach.icon.length > 0, `у ${ach.id} должна быть иконка`);
    assert.ok(typeof ach.metric === 'string' && ach.metric.length > 0, `у ${ach.id} должна быть метрика`);
    assert.ok(typeof ach.target === 'number' && Number.isFinite(ach.target) && ach.target > 0, `у ${ach.id} target должен быть > 0: ${ach.target}`);
  }

  // Проверка getAchievement
  for (const ach of ACHIEVEMENTS) {
    const found = getAchievement(ach.id);
    assert.equal(found, ach, `getAchievement(${ach.id}) возвращает не тот объект`);
  }
  assert.equal(getAchievement('unknown_ach_id'), undefined, 'несуществующий id возвращает undefined');
});

test('evaluateMetric: корректное извлечение простых, вложенных и особых метрик', () => {
  const stats = {
    kills: 42,
    bossKills: 3,
    towersBuilt: 15,
    merges: 4,
    maxCombo: 18,
    essenceEarned: 2500,
    essence: 950,
    wave: 12,
    won: true,
    towerTypesBuilt: {
      vampire: 2,
      screamer: 5,
    },
    lifetime: {
      kills: 520,
      bosses: 11,
      towers: 40,
      merges: 10,
      runs: 8,
      wins: 2,
      endlessBest: 16,
    },
    best: {
      kills: 80,
      wave: 14,
      maxCombo: 26,
      essenceEarned: 3000,
    },
  };

  // Простые поля
  assert.equal(evaluateMetric('kills', stats), 42);
  assert.equal(evaluateMetric('bossKills', stats), 3);
  assert.equal(evaluateMetric('towersBuilt', stats), 15);
  assert.equal(evaluateMetric('essence', stats), 950);
  assert.equal(evaluateMetric('wave', stats), 12);

  // Вложенные точечные пути
  assert.equal(evaluateMetric('lifetime.kills', stats), 520);
  assert.equal(evaluateMetric('lifetime.bosses', stats), 11);
  assert.equal(evaluateMetric('towerTypesBuilt.vampire', stats), 2);
  assert.equal(evaluateMetric('best.maxCombo', stats), 26);

  // Булева метрика won
  assert.equal(evaluateMetric('won', stats), 1);
  assert.equal(evaluateMetric('won', { won: false }), 0);
  assert.equal(evaluateMetric('won', {}), 0);

  // Особая метрика endlessBest
  assert.equal(evaluateMetric('endlessBest', stats), 16);
  assert.equal(evaluateMetric('endlessBest', { endlessBest: 20 }), 20);

  // Отсутствующие пути и невалидные входы -> 0
  assert.equal(evaluateMetric('missing.deep.path', stats), 0);
  assert.equal(evaluateMetric('towerTypesBuilt.frost', stats), 0);
  assert.equal(evaluateMetric('kills', null), 0);
  assert.equal(evaluateMetric('kills', undefined), 0);
  assert.equal(evaluateMetric(null, stats), 0);
  assert.equal(evaluateMetric('', stats), 0);
});

test('achievementProgress: расчёт прогресса cur/target/done и клампинг done', () => {
  const ach = getAchievement('towers_20'); // target: 20
  assert.ok(ach);

  // cur < target -> done: false
  const p1 = achievementProgress(ach, { towersBuilt: 5 });
  assert.deepEqual(p1, { cur: 5, target: 20, done: false });

  // cur == target -> done: true
  const p2 = achievementProgress(ach, { towersBuilt: 20 });
  assert.deepEqual(p2, { cur: 20, target: 20, done: true });

  // cur > target -> done: true
  const p3 = achievementProgress(ach, { towersBuilt: 35 });
  assert.deepEqual(p3, { cur: 35, target: 20, done: true });

  // Вызов по id строки вместо объекта
  const p4 = achievementProgress('first_blood', { kills: 1 });
  assert.deepEqual(p4, { cur: 1, target: 1, done: true });

  // Несуществующее достижение
  const p5 = achievementProgress('non_existent', { kills: 100 });
  assert.deepEqual(p5, { cur: 0, target: 0, done: false });
});

test('checkAchievements: обнаружение новых разблокировок и исключение уже открытых', () => {
  const stats = {
    kills: 120, // first_blood (>=1), slayer_100 (>=100)
    bossKills: 1, // boss_first (>=1)
    towersBuilt: 5,
    maxCombo: 10,
    essenceEarned: 500,
    essence: 200,
    wave: 4,
    won: false,
    towerTypesBuilt: { vampire: 0 },
    lifetime: { kills: 120, bosses: 1, endlessBest: 0 },
    best: { maxCombo: 10 },
  };

  // Ничего не разблокировано ранее
  const unlocked1 = checkAchievements(stats, []);
  const ids1 = unlocked1.map((u) => u.id);
  assert.ok(ids1.includes('first_blood'));
  assert.ok(ids1.includes('slayer_100'));
  assert.ok(ids1.includes('boss_first'));
  assert.ok(!ids1.includes('towers_20'));

  // Проверка структуры каждого разблокированного объекта
  for (const u of unlocked1) {
    assert.ok(u.id && u.name && u.desc && u.icon);
    assert.ok(typeof u.value === 'number');
  }

  // Уже открытые не выдаются повторно
  const unlocked2 = checkAchievements(stats, ['first_blood', 'boss_first']);
  const ids2 = unlocked2.map((u) => u.id);
  assert.ok(!ids2.includes('first_blood'));
  assert.ok(!ids2.includes('boss_first'));
  assert.ok(ids2.includes('slayer_100'));

  // Если все выполненные уже открыты -> пустой массив
  const unlocked3 = checkAchievements(stats, ['first_blood', 'slayer_100', 'boss_first']);
  assert.equal(unlocked3.length, 0);

  // При пустой статистике ничего не открывается
  assert.equal(checkAchievements({}, []).length, 0);
  assert.equal(checkAchievements(null, []).length, 0);
});

test('applyRunToLifetime: агрегация статистики забега и неизменяемость входного объекта', () => {
  const lifetime = Object.freeze({
    kills: 100,
    bosses: 2,
    towers: 15,
    merges: 3,
    runs: 5,
    wins: 1,
    endlessBest: 10,
  });

  const runStats = {
    kills: 50,
    bossKills: 1,
    towersBuilt: 8,
    merges: 2,
    won: true,
    endless: 14,
  };

  const updated = applyRunToLifetime(lifetime, runStats);

  // Проверка значений
  assert.equal(updated.kills, 150);
  assert.equal(updated.bosses, 3);
  assert.equal(updated.towers, 23);
  assert.equal(updated.merges, 5);
  assert.equal(updated.runs, 6);
  assert.equal(updated.wins, 2);
  assert.equal(updated.endlessBest, 14);

  // Проверка, что исходный объект не был изменён
  assert.equal(lifetime.kills, 100);
  assert.equal(lifetime.runs, 5);

  // Проверка endlessBest при меньшем значении за забег
  const run2 = {
    kills: 10,
    bossKills: 0,
    towersBuilt: 0,
    merges: 0,
    won: false,
    endless: 8,
  };
  const updated2 = applyRunToLifetime(updated, run2);
  assert.equal(updated2.endlessBest, 14, 'endlessBest сохраняет максимальное значение');
  assert.equal(updated2.wins, 2, 'wins не увеличивается при won: false');
  assert.equal(updated2.runs, 7);

  // Корректная работа с пустым / undefined lifetime
  const fresh = applyRunToLifetime(null, { kills: 10, bossKills: 1, towersBuilt: 2, merges: 1, won: true, endless: 5 });
  assert.deepEqual(fresh, {
    kills: 10,
    bosses: 1,
    towers: 2,
    merges: 1,
    runs: 1,
    wins: 1,
    endlessBest: 5,
  });
});

test('normalizeUnlocked: очистка, дефолты и санитизация состояния', () => {
  // null / undefined -> дефолтная структура
  const def1 = normalizeUnlocked(null);
  assert.deepEqual(def1, {
    v: 1,
    ids: [],
    counters: { kills: 0, bosses: 0, towers: 0, merges: 0, runs: 0, wins: 0, endlessBest: 0 },
    best: { kills: 0, wave: 0, maxCombo: 0, essenceEarned: 0 },
  });

  const def2 = normalizeUnlocked(undefined);
  assert.equal(def2.v, 1);
  assert.deepEqual(def2.ids, []);

  // Легаси-массив строк -> ids с фильтрацией неизвестных
  const legacy = ['first_blood', 'unknown_xyz', 'slayer_100', 'first_blood'];
  const normLegacy = normalizeUnlocked(legacy);
  assert.deepEqual(normLegacy.ids, ['first_blood', 'slayer_100']);
  assert.equal(normLegacy.counters.kills, 0);

  // Объект с мусором и нечисловыми значениями
  const dirty = {
    v: 1,
    ids: ['vampire_fan', 'invalid_id', 123, null],
    counters: {
      kills: '500', // строка вместо числа -> 0
      bosses: -5,   // отрицательное -> 0
      towers: 25,
      merges: NaN,  // NaN -> 0
      runs: 10,
      wins: Infinity, // Infinity -> 0
      endlessBest: 12,
    },
    best: {
      kills: 50,
      wave: undefined,
      maxCombo: 15,
      essenceEarned: -100,
    },
  };

  const clean = normalizeUnlocked(dirty);
  assert.deepEqual(clean.ids, ['vampire_fan']);
  assert.equal(clean.counters.kills, 0);
  assert.equal(clean.counters.bosses, 0);
  assert.equal(clean.counters.towers, 25);
  assert.equal(clean.counters.merges, 0);
  assert.equal(clean.counters.runs, 10);
  assert.equal(clean.counters.wins, 0);
  assert.equal(clean.counters.endlessBest, 12);
  assert.equal(clean.best.kills, 50);
  assert.equal(clean.best.wave, 0);
  assert.equal(clean.best.maxCombo, 15);
  assert.equal(clean.best.essenceEarned, 0);
});

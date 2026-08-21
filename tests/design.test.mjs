// Интеграционные тесты гейм-дизайна: волны, луна, экономика, состояние.
// Интеграционные тесты дизайна: уровни, волны, луна, экономика, состояние, прокачка.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, CRYSTAL, ENTRANCE, buildLevelPath } from '../src/core/layout.js';
import { waveSpawns, wavePreview, moonForWave, waveGroups, MOON_PHASES, TOTAL_WAVES } from '../src/core/waves.js';
import { ECONOMY, sellPrice, killReward, waveClearReward } from '../src/core/economy.js';
import { GameState } from '../src/core/state.js';
import { UPGRADE_POOL, pickUpgrades } from '../src/core/upgrades.js';
import { mulberry32 } from '../src/core/rng.js';
import { ENEMY_TYPES, scaledHp, scaledReward } from '../src/core/enemies.js';
import { TOWER_TYPES, towerStats, upgradeCost, MAX_LEVEL, canMerge } from '../src/core/towers.js';

test('все 10 волн имеют непустой список спавнов и только известных врагов', () => {
  for (let w = 1; w <= TOTAL_WAVES; w++) {
    const spawns = waveSpawns(w);
    assert.ok(spawns.length > 0, `волна ${w} пустая`);
    for (const s of spawns) {
      assert.ok(ENEMY_TYPES[s.type], `волна ${w}: неизвестный враг ${s.type}`);
      assert.ok(s.t >= 0);
    }
    // спавны отсортированы по времени
    for (let i = 1; i < spawns.length; i++) {
      assert.ok(spawns[i].t >= spawns[i - 1].t, `волна ${w}: спавны не отсортированы`);
    }
  }
});

test('босс-волны 5 и 10 содержат босса', () => {
  const w5 = waveSpawns(5).map(s => s.type);
  const w10 = waveSpawns(10).map(s => s.type);
  assert.ok(w5.includes('spider'), 'волна 5 должна содержать Паучиху');
  assert.ok(w10.includes('vampmoth'), 'волна 10 должна содержать Вампира-мотылька');
});

test('moonForWave: ручное расписание + детерминированный цикл для endless', () => {
  assert.equal(moonForWave(1), null);
  assert.equal(moonForWave(2), 'new');
  assert.equal(moonForWave(10), 'blood');
  for (const w of [11, 12, 13]) {
    assert.ok(MOON_PHASES[moonForWave(w)], `волна ${w} без фазы луны`);
  }
  // детерминизм
  assert.equal(moonForWave(25), moonForWave(25));
});

test('endless-волны генерируются детерминированно от номера', () => {
  const a = waveGroups(14).map(g => `${g.type}:${g.count}`);
  const b = waveGroups(14).map(g => `${g.type}:${g.count}`);
  assert.deepEqual(a, b);
  const g = waveGroups(20);
  assert.ok(g.length >= 2, 'endless-волна должна иметь минимум 2 группы');
});

test('скейлинг: волна 10 заметно сильнее волны 1', () => {
  const hp1 = scaledHp(ENEMY_TYPES.moth.hp, 1);
  const hp10 = scaledHp(ENEMY_TYPES.moth.hp, 10);
  assert.ok(hp10 > hp1 * 3, 'ХП должно вырасти минимум втрое к 10-й волне');
  const r1 = scaledReward(ENEMY_TYPES.moth.reward, 1);
  const r10 = scaledReward(ENEMY_TYPES.moth.reward, 10);
  assert.ok(r10 > r1, 'награда растёт с волнами');
});

test('экономика: стартовых 120 хватает на Визгуна, но не на Вампира', () => {
  const s = new GameState();
  assert.equal(s.essence, ECONOMY.startEssence);
  assert.ok(s.canAfford(TOWER_TYPES.screamer.cost));
  assert.ok(!s.canAfford(TOWER_TYPES.vampire.cost));
  assert.ok(s.spend(TOWER_TYPES.screamer.cost));
  assert.equal(s.essence, ECONOMY.startEssence - TOWER_TYPES.screamer.cost);
});

test('killReward растёт с комбо и капается на comboMax', () => {
  const base = 10;
  const r0 = killReward(base, 0);
  const r2 = killReward(base, 2);
  const r9 = killReward(base, 9);
  assert.equal(r0, 10);
  assert.ok(r2 > r0);
  assert.equal(r9, killReward(base, ECONOMY.comboMax)); // кап
});

test('waveClearReward и sellPrice', () => {
  assert.ok(waveClearReward(5) > waveClearReward(1));
  assert.equal(sellPrice(100), Math.round(100 * ECONOMY.sellRatio));
});

test('GameState: урон кристалла и событие gameover', () => {
  const s = new GameState();
  let over = 0;
  s.on('gameover', () => over++);
  s.damageCrystal(5);
  assert.equal(s.crystalHp, ECONOMY.startHp - 5);
  s.damageCrystal(999);
  assert.equal(s.crystalHp, 0);
  assert.ok(s.over);
  assert.equal(over, 1);
  // повторный урон после gameover игнорируется
  s.damageCrystal(10);
  assert.equal(s.crystalHp, 0);
  assert.equal(over, 1);
});

test('GameState: healCrystal не превышает максимум', () => {
  const s = new GameState();
  s.healCrystal(50);
  assert.equal(s.crystalHp, s.maxHp);
});

test('апгрейды: 3 уровня, стоимость растёт, выше максимума — Infinity', () => {
  const t = TOWER_TYPES.screamer;
  assert.equal(MAX_LEVEL, 3);
  assert.equal(towerStats('screamer', 1).damage, t.damage[0]);
  assert.equal(towerStats('screamer', 3).damage, t.damage[2]);
  assert.ok(upgradeCost('screamer', 2) > upgradeCost('screamer', 1));
  assert.equal(upgradeCost('screamer', 1), t.upgradeCost[0]);
  assert.equal(upgradeCost('screamer', 3), Infinity); // выше максимума нельзя
});

test('комбо: сбрасывается по таймеру', () => {
  const s = new GameState();
  s.addKill();
  s.addKill();
  assert.equal(s.combo, 2);
  s.tickCombo(ECONOMY.comboWindow + 0.1);
  assert.equal(s.combo, 0);
});

test('статистика забега: maxCombo растёт и не сбрасывается таймером', () => {
  const s = new GameState();
  s.addKill();
  s.addKill();
  s.addKill();
  assert.equal(s.maxCombo, 3);
  // комбо сброшено, но пик за забег сохраняется
  s.tickCombo(ECONOMY.comboWindow + 0.1);
  assert.equal(s.combo, 0);
  assert.equal(s.maxCombo, 3);
  s.addKill();
  assert.equal(s.maxCombo, 3); // не превысило прежний пик
});

test('статистика забега: essenceEarned копит только положительные начисления', () => {
  const s = new GameState();
  s.addEssence(10);
  s.addEssence(25);
  assert.equal(s.essenceEarned, 35);
  s.addEssence(-5); // списания не считаются «добыто»
  assert.equal(s.essenceEarned, 35);
});

test('у всех типов башен есть иконные поля (цвет/свечение)', () => {
  for (const id of Object.keys(TOWER_TYPES)) {
    const t = TOWER_TYPES[id];
    assert.ok(t.name && t.cost > 0 && t.color && t.glow, `${id}: неполные данные`);
    assert.ok(t.damage.length === 3 && t.rate.length === 3 && t.range.length === 3, `${id}: статы не по уровням`);
  }
});

test('новые механики: альфы у всех типов, новые враги в данных', () => {
  for (const id of Object.keys(TOWER_TYPES)) {
    assert.ok(TOWER_TYPES[id].alpha, `${id}: должна быть альфа-форма`);
    assert.ok(TOWER_TYPES[id].alpha.name && TOWER_TYPES[id].alpha.passive, `${id}: альфа неполная`);
  }
  const healer = ENEMY_TYPES.healer;
  assert.ok(healer && healer.healAura > 0 && healer.healAuraR > 0, 'жрец: аура лечения');
  const ranger = ENEMY_TYPES.ranger;
  assert.ok(ranger && ranger.ranged && ranger.ranged.dmg >= 1 && ranger.ranged.cd > 0, 'стрелок: дальнобойность');
  // слияние теперь доступно всем типам
  const a = { typeId: 'lantern', level: MAX_LEVEL, pos: { distSq: () => 1 }, dead: false };
  const b = { typeId: 'lantern', level: MAX_LEVEL, pos: { distSq: () => 1 }, dead: false };
  assert.equal(canMerge(a, b), true, 'фонарь можно слить');
  const c = { typeId: 'vampire', level: MAX_LEVEL, pos: { distSq: () => 1 }, dead: false };
  const d = { typeId: 'vampire', level: MAX_LEVEL, pos: { distSq: () => 1 }, dead: false };
  assert.equal(canMerge(c, d), true, 'вампир можно слить');
});

test('уровни: у каждого пути разумная длина, конец у кристалла, вход общий', () => {
  assert.ok(LEVELS.length >= 3, 'минимум 3 уровня');
  for (const cfg of LEVELS) {
    const path = buildLevelPath(cfg.id);
    assert.ok(path.length > 30 && path.length < 120, `${cfg.name}: длина пути ${path.length} вне [30,120]`);
    // конец пути у кристалла
    const end = path.pointAt(path.length);
    assert.ok(Math.hypot(end.x - CRYSTAL.pos.x, end.z - CRYSTAL.pos.z) < 3.5, `${cfg.name}: конец пути далеко от кристалла`);
    // вход общий (ENTRANCE)
    assert.equal(cfg.pathPoints[0][0], ENTRANCE.x);
    assert.equal(cfg.pathPoints[0][2], ENTRANCE.z);
    assert.ok(cfg.unlockedTowers.length >= 3, `${cfg.name}: минимум 3 башни`);
    assert.ok(cfg.theme && cfg.theme.accent, `${cfg.name}: тема`);
  }
});

test('уровни: насесты не дальше 7 от пути и не ближе 2.6 к кристаллу', () => {
  for (const cfg of LEVELS) {
    const path = buildLevelPath(cfg.id);
    for (const p of cfg.perches) {
      // дистанция до пути (выборка)
      let best = Infinity;
      for (let d = 0; d <= path.length; d += 0.5) {
        const q = path.pointAt(d);
        best = Math.min(best, Math.hypot(q.x - p.pos.x, q.z - p.pos.z));
      }
      assert.ok(best <= 7, `${cfg.name}: насест (${p.pos.x},${p.pos.z}) на ${best.toFixed(1)} от пути`);
      const dc = Math.hypot(p.pos.x - CRYSTAL.pos.x, p.pos.z - CRYSTAL.pos.z);
      assert.ok(dc >= 2.6, `${cfg.name}: насест (${p.pos.x},${p.pos.z}) слишком близко к кристаллу: ${dc.toFixed(1)}`);
    }
  }
});

test('прокачка: пул улучшений уникален, выбор даёт 3 разных', () => {
  const ids = UPGRADE_POOL.map(u => u.id);
  assert.equal(new Set(ids).size, UPGRADE_POOL.length, 'дубликаты id');
  for (const u of UPGRADE_POOL) assert.ok(u.name && u.desc && u.icon);
  const picks = pickUpgrades(UPGRADE_POOL, mulberry32(1));
  assert.equal(picks.length, 3);
  assert.equal(new Set(picks.map(p => p.id)).size, 3, 'выбор без повторов');
  // детерминизм
  assert.deepEqual(pickUpgrades(UPGRADE_POOL, mulberry32(1)).map(p => p.id), picks.map(p => p.id));
});

test('wavePreview: количество совпадает с составом волны', () => {
  for (const w of [1, 3, 5, 7, 10, 14]) {
    const preview = wavePreview(w);
    const total = preview.reduce((acc, p) => acc + p.n, 0);
    assert.equal(total, waveSpawns(w).length, `волна ${w}: превью не совпадает`);
  }
});

import { DIFFICULTIES, getDifficulty, DEFAULT_DIFFICULTY } from '../src/config/difficulty.js';

test('сложность: getDifficulty возвращает пресет по id, дефолт = normal', () => {
  assert.equal(getDifficulty('normal').hpMult, 1);
  assert.equal(getDifficulty('nonexistent').id, DEFAULT_DIFFICULTY);
  assert.equal(getDifficulty().id, DEFAULT_DIFFICULTY);
});

test('сложность: у всех пресетов валидные множители и стартовые', () => {
  for (const [id, d] of Object.entries(DIFFICULTIES)) {
    assert.ok(d.hpMult > 0 && d.hpMult < 2, `${id}: hpMult`);
    assert.ok(d.dmgMult > 0 && d.dmgMult < 2, `${id}: dmgMult`);
    assert.ok(d.rewardMult > 0 && d.rewardMult < 2, `${id}: rewardMult`);
    assert.ok(d.speedMult >= 0.5 && d.speedMult <= 2, `${id}: speedMult`);
    assert.ok(d.startEssence >= 60 && d.startEssence <= 300, `${id}: startEssence`);
    assert.ok(d.startHp >= 10 && d.startHp <= 50, `${id}: startHp`);
  }
});

test('сложность: normal = единичные множители и базовые стартовые', () => {
  const n = getDifficulty('normal');
  assert.equal(n.hpMult, 1);
  assert.equal(n.dmgMult, 1);
  assert.equal(n.rewardMult, 1);
  assert.equal(n.startEssence, 120);
  assert.equal(n.startHp, 20);
});

test('сложность: easy снижает HP мотылька на волне 10', () => {
  const easy = getDifficulty('easy');
  const base = scaledHp(ENEMY_TYPES.moth.hp, 10);
  assert.ok(scaledHp(ENEMY_TYPES.moth.hp, 10) * easy.hpMult < base, 'лёгкая сложность уменьшает HP');
});


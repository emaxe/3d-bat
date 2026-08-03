// Юнит-тесты чистой логики: node --test tests/logic.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { Vec3, Path } from '../src/core/math.js';
import { PATH_POINTS, PERCHES, CRYSTAL, buildPath } from '../src/core/layout.js';
import { pickTarget, canMerge, mergeCost, flockBonus, upgradeCost, towerStats, MAX_LEVEL } from '../src/core/towers.js';
import { ENEMY_TYPES, scaledHp, scaledReward, effectiveSpeed, damageTaken } from '../src/core/enemies.js';
import { killReward, ECONOMY, sellPrice } from '../src/core/economy.js';
import { waveSpawns, moonForWave, TOTAL_WAVES, genEndlessWave, waveGroups, MOON_PHASES } from '../src/core/waves.js';
import { GameState } from '../src/core/state.js';
import { mulberry32 } from '../src/core/rng.js';

test('путь: длина разумная и точкаAt монотонна', () => {
  const path = buildPath();
  assert.ok(path.length > 40 && path.length < 120, `length=${path.length}`);
  const p0 = path.pointAt(0);
  const pm = path.pointAt(path.length * 0.5);
  const pe = path.pointAt(path.length);
  assert.ok(p0.dist(pe) > 10, 'начало и конец далеко');
  // конец пути рядом с кристаллом
  assert.ok(pe.dist(CRYSTAL.pos) < 3.5, `конец пути у кристалла: ${pe.dist(CRYSTAL.pos)}`);
  // равномерность движения: при шаге 0.5 по дуге хорда ~0.5 (±20%) — выборка достаточно плотная
  let min = Infinity, max = -Infinity;
  for (let d = 0; d < path.length - 0.5; d += 2.3) {
    const c = path.pointAt(d).dist(path.pointAt(d + 0.5));
    if (c < min) min = c;
    if (c > max) max = c;
  }
  assert.ok(min > 0.4 && max < 0.6, `хорды 0.5-шага: min=${min.toFixed(3)} max=${max.toFixed(3)}`);
});

test('насесты: каждый в полезной близости от пути (< 7) и не занят кристаллом', () => {
  const path = buildPath();
  const report = [];
  for (const perch of PERCHES) {
    const d = path.distanceToPoint(perch.pos, 1.0);
    report.push(`${perch.id}:${d.toFixed(2)}`);
    assert.ok(d < 7.0, `насест ${perch.id} далеко от пути: ${d.toFixed(2)}`);
    assert.ok(perch.pos.dist(CRYSTAL.pos) > CRYSTAL.radius + 1.2, `насест ${perch.id} на кристалле`);
  }
  console.log('distances:', report.join(' '));
  assert.ok(PERCHES.length >= 14, 'хватает насестов');
});

test('сплайн: ровные скорости — касательные не нулевые', () => {
  const path = buildPath();
  for (let d = 0; d <= path.length; d += 3) {
    const t = path.tangentAt(d);
    assert.ok(t.len() > 0.5, `тангенс в ${d}`);
  }
});

test('таргетинг: берётся враг с макс. прогрессом в радиусе', () => {
  const origin = new Vec3(0, 0, 0);
  const mk = (progress, x, cloaked = false, revealed = false) => ({
    alive: true, dead: false, progress, cloaked,
    effects: { cloaked, revealed },
    pos: new Vec3(x, 0, 0),
  });
  const enemies = [
    mk(10, 5), mk(20, 6), mk(15, 4),
  ];
  const pick = pickTarget(enemies, origin, 7);
  assert.equal(pick.progress, 20);
  // вне радиуса игнор
  const enemies2 = [mk(10, 20), mk(99, 20)];
  assert.equal(pickTarget(enemies2, origin, 7), null);
  // предпочтение раскрытой невидимки
  const enemies3 = [mk(30, 3, true, false), mk(25, 3, true, true)];
  assert.equal(pickTarget(enemies3, origin, 7).progress, 25);
});

test('башни: статы, апгрейды, слияние, стая', () => {
  assert.deepEqual(towerStats('screamer', 1), { damage: 14, rate: 0.8, range: 7 });
  assert.equal(upgradeCost('screamer', 1), 40);
  assert.equal(upgradeCost('screamer', 3), Infinity);
  const a = { typeId: 'screamer', level: 3, dead: false, pos: new Vec3(0, 0, 0) };
  const b = { typeId: 'screamer', level: 3, dead: false, pos: new Vec3(1.5, 0, 0) };
  const c = { typeId: 'screamer', level: 2, dead: false, pos: new Vec3(1.5, 0, 0) };
  const d = { typeId: 'frost', level: 3, dead: false, pos: new Vec3(1.5, 0, 0) };
  assert.ok(canMerge(a, b), 'две макс. соседние — можно');
  assert.ok(!canMerge(a, c), 'не макс. уровень');
  assert.ok(!canMerge(a, d), 'разные типы');
  assert.ok(!canMerge(a, a), 'сама с собой');
  assert.equal(mergeCost(a, b), Math.round(((50 + 40 + 70) * 2) * 0.6));
  // стая
  const towers = [a, { typeId: 'screamer', alive: true, pos: new Vec3(2.2, 0, 0) }, { typeId: 'screamer', alive: true, pos: new Vec3(2.6, 0, 0) }];
  const bonus = flockBonus('screamer', towers, a.pos);
  assert.equal(bonus, 0.3);
  // фонарь и вампир теперь тоже сливаются (у всех типов есть альфа)
  const l1 = { typeId: 'lantern', level: 3, dead: false, pos: new Vec3(0, 0, 0) };
  const l2 = { typeId: 'lantern', level: 3, dead: false, pos: new Vec3(1, 0, 0) };
  assert.ok(canMerge(l1, l2), 'фонарь сливается');
});

test('враги: скейлинг и эффекты', () => {
  assert.ok(scaledHp(100, 1) === 100);
  assert.ok(scaledHp(100, 2) > 100 && scaledHp(100, 2) < 125);
  assert.equal(scaledReward(10, 1), 10);
  assert.ok(scaledReward(10, 5) > 10);
  assert.equal(effectiveSpeed(2.0, 0.35).toFixed(3), '1.300');
  assert.equal(effectiveSpeed(2.0, 0.99).toFixed(3), '0.300'); // не ниже 15%
  assert.equal(damageTaken(100, 0.2, 0.25), 100 * 0.8 * 1.25);
  assert.ok(ENEMY_TYPES.spider.boss && ENEMY_TYPES.vampmoth.boss);
});

test('экономика: комбо и продажа', () => {
  assert.equal(killReward(10, 0), 10);
  assert.equal(killReward(10, 5), 15);
  assert.equal(killReward(10, 99), 15); // кап
  assert.equal(sellPrice(100), 70);
  assert.equal(ECONOMY.startEssence, 120);
});

test('волны: композиции, порядок, фазы луны, endless', () => {
  assert.equal(TOTAL_WAVES, 10);
  for (let w = 1; w <= TOTAL_WAVES; w++) {
    const spawns = waveSpawns(w);
    assert.ok(spawns.length > 0, `волна ${w} непустая`);
    for (let i = 1; i < spawns.length; i++) assert.ok(spawns[i].t >= spawns[i - 1].t, `волна ${w} отсортирована`);
    for (const s of spawns) assert.ok(ENEMY_TYPES[s.type], `тип ${s.type} существует`);
  }
  // боссы
  assert.ok(waveSpawns(5).some(s => s.type === 'spider'));
  assert.ok(waveSpawns(10).some(s => s.type === 'vampmoth'));
  // фазы
  assert.equal(moonForWave(2), 'new');
  assert.equal(moonForWave(3), 'blood');
  assert.equal(moonForWave(10), 'blood');
  assert.equal(moonForWave(1), null);
  assert.ok(MOON_PHASES[moonForWave(11)]);
  // endless детерминирован
  const a = genEndlessWave(12).map(g => `${g.type}:${g.count}:${g.delay.toFixed(1)}`).join('|');
  const b = genEndlessWave(12).map(g => `${g.type}:${g.count}:${g.delay.toFixed(1)}`).join('|');
  assert.equal(a, b);
  assert.ok(waveGroups(15).length >= 2);
});

test('состояние: судьба кристалла, комбо, комбо-таймер', () => {
  const st = new GameState();
  assert.equal(st.essence, 120);
  assert.ok(st.spend(50));
  assert.equal(st.essence, 70);
  assert.ok(!st.spend(100));
  let hpSeen = 0, overSeen = 0;
  st.on('hp', h => (hpSeen = h));
  st.on('gameover', () => overSeen++);
  st.damageCrystal(5);
  assert.equal(hpSeen, 15);
  assert.equal(overSeen, 0);
  st.damageCrystal(15);
  assert.equal(overSeen, 1);
  assert.equal(st.over, true);
  // комбо
  const st2 = new GameState();
  st2.addKill(); st2.addKill();
  assert.equal(st2.combo, 2);
  st2.tickCombo(3.5);
  assert.equal(st2.combo, 0);
});

test('RNG детерминирован', () => {
  const r1 = mulberry32(42), r2 = mulberry32(42);
  const s1 = Array.from({ length: 20 }, () => r1()).join(',');
  const s2 = Array.from({ length: 20 }, () => r2()).join(',');
  assert.equal(s1, s2);
  assert.ok(r1() >= 0 && r1() < 1);
});

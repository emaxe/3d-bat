// managers.test.mjs — исполняет методы BuildSystem/WaveManager/CameraController
// с реальными three-объектами и заглушками. Поймал 2 реальных бага:
//  1) BuildSystem.upgradeTower → mergePartner(tower, undefined) → «t is not iterable»
//  2) CameraController pinch: второй палец ещё не в Map → b undefined
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// --- заглушки браузерных API ---
function makeCtx() {
  const grad = { addColorStop(o, c) { if (typeof c !== 'string') throw new Error(`addColorStop: цвет не строка: ${c}`); } };
  return new Proxy({}, {
    get(_t, prop) {
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => grad;
      if (prop === 'createImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
      if (prop === 'measureText') return () => ({ width: 10 });
      if (prop === 'canvas') return null;
      return () => {};
    },
    set() { return true; },
  });
}
const fakeCanvas = () => ({ width: 1, height: 1, getContext: (k) => (k === '2d' ? makeCtx() : null), toDataURL: () => 'data:image/png;base64,AAAA' });
const fakeEl = () => ({ style: {}, dataset: {}, textContent: '', innerHTML: '', classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, addEventListener() {}, setAttribute() {}, querySelector: () => fakeEl(), querySelectorAll: () => [] });
globalThis.document = { createElement: (t) => (t === 'canvas' ? fakeCanvas() : fakeEl()), getElementById: () => fakeEl(), body: { appendChild() {} }, addEventListener() {}, querySelector: () => fakeEl() };
globalThis.window = { addEventListener() {}, innerWidth: 800, innerHeight: 600, devicePixelRatio: 2 };
globalThis.performance = globalThis.performance || { now: () => Date.now() };

const noop = () => {};
const fakeSfx = new Proxy({}, { get: () => noop, set: () => true });

const { buildCave } = await import('../src/world/cave.js');
const { buildPathVisual } = await import('../src/world/path.js');
const { buildPerches } = await import('../src/world/perches.js');
const { GameState } = await import('../src/core/state.js');
const { TOWER_TYPES } = await import('../src/core/towers.js');
const { BuildSystem } = await import('../src/managers/buildSystem.js');
const { WaveManager } = await import('../src/managers/waveManager.js');
const { CameraController } = await import('../src/managers/cameraController.js');

function makeGameParts() {
  const cave = buildCave();
  const pathVis = buildPathVisual(cave.scene);
  const perches = buildPerches(cave.scene, cave.materials.rockMat);
  const state = new GameState();
  const effects = { showBanner() {}, damageNumber: noop, update: noop };
  const particles = { burst: noop, spawn: noop, update: noop };
  const hud = { showToast: noop, showBoss: noop, updateBoss: noop, setWaveState: noop };
  const panel = { select: noop, deselect: noop };
  const camera = { updateProjectionMatrix: noop, position: { set() {} }, lookAt: noop };
  return { cave, pathVis, perches, state, effects, particles, hud, panel, camera };
}

test('managers: BuildSystem — стройка/апгрейд/слияние/продажа', () => {
  const { cave, perches, state, effects, particles, hud, panel, camera } = makeGameParts();
  const build = new BuildSystem(state, effects, fakeSfx, particles, hud, panel, camera);
  build.setScene(cave.scene);
  state.essence = 1000;

  build.enterBuildMode('screamer', TOWER_TYPES.screamer, perches);
  const tower = build.buildTower('screamer', perches.find(p => !p.occupied), cave.scene);
  assert.ok(tower, 'башня построена');
  assert.ok(perches.some(p => p.occupied), 'насест занят');

  state.essence = 1000;
  assert.ok(build.upgradeTower(tower, particles, [tower]), 'апгрейд без падения (бывший баг)');

  state.essence = 1000;
  build.selectTower(tower, [tower]);
  const t2 = build.buildTower('frost', perches.find(p => !p.occupied), cave.scene);
  state.essence = 1000;
  assert.ok(build.mergeTowers(tower, t2, () => {}), 'слияние');
  assert.ok(tower.isAlpha, 'башня стала альфой');

  state.essence = 1000;
  const t3 = build.buildTower('spore', perches.find(p => !p.occupied), cave.scene);
  build.sellTower(t3, perches);
  assert.ok(!perches.some(p => p.tower === t3), 'насест освобождён после продажи');

  build.cancelBuildMode(perches);
  build.reset();
});

test('managers: WaveManager — волна, спавн, задержка, босс', () => {
  const { cave, pathVis, state, effects, hud, particles } = makeGameParts();
  const waves = new WaveManager(state, effects, fakeSfx, hud);
  const ctx = { scene: cave.scene, towers: [], enemies: [], projectiles: [], pulses: [], moonSpeedMul: 1, moonRewardMul: 1, moonTowerMul: 1, cloakAll: false, particles };
  const enemies = [];

  waves.startWave(1, ctx);
  assert.equal(state.wave, 1, 'волна установлена');
  for (let i = 0; i < 60; i++) waves.updateSpawning(0.25, enemies, pathVis.path, cave.scene, ctx);
  assert.ok(enemies.length > 0, 'враги заспавнены');
  enemies.forEach(e => e.dispose());

  waves.setWaveDelay(2.0);
  assert.equal(waves.updateWaveDelay(0.5), false, 'задержка ещё не вышла');
  state.spawning = false; // задержка волны считается только вне спавна
  waves.setWaveDelay(2.0);
  assert.equal(waves.updateWaveDelay(2.5), true, 'задержка вышла — пора волну');
  waves.skipDelay();

  // завершение волны проверяется в момент активного спавна
  state.spawning = true;
  assert.equal(waves.checkWaveComplete([]), true, 'волна завершена при пустом поле');
  waves.reset();
  assert.equal(waves.currentBoss, null, 'босс сброшен');
});

test('managers: CameraController — тап, драг, пинч', () => {
  const { camera } = makeGameParts();
  const cc = new CameraController(camera, {});
  const ev = (x, y, extra = {}) => ({ clientX: x, clientY: y, pointerId: 1, pointerType: 'touch', button: 0, ...extra });

  // тап
  cc.handlePointerDown(ev(100, 100));
  cc.addPointer(ev(100, 100));
  const tap = cc.handlePointerUp(ev(100, 100));
  assert.equal(tap.type, 'tap');
  assert.deepEqual(tap.pos, { x: 100, y: 100 });

  // драг
  cc.handlePointerDown(ev(50, 50));
  cc.addPointer(ev(50, 50));
  cc.handlePointerMove(ev(70, 70));
  cc.handlePointerMove(ev(90, 70));
  assert.equal(cc.handlePointerUp(ev(90, 70)).type, 'drag-end');

  // пинч: второй палец до addPointer не роняет (бывший баг)
  cc.handlePointerDown(ev(100, 100, { pointerId: 1 }));
  cc.addPointer(ev(100, 100, { pointerId: 1 }));
  assert.equal(cc.handlePointerDown(ev(120, 100, { pointerId: 2 })), 'pinch');
  cc.addPointer(ev(120, 100, { pointerId: 2 }));
  cc.handlePointerMove(ev(140, 100, { pointerId: 2 }));
  cc.handlePointerUp(ev(140, 100, { pointerId: 2 }));
  cc.handlePointerUp(ev(100, 100, { pointerId: 1 }));
});

test('managers: BuildSystem — выбор башни по близости к тапу, а не по мешам', () => {
  const { cave, perches, state, effects, particles, hud, panel } = makeGameParts();
  const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 200);
  const build = new BuildSystem(state, effects, fakeSfx, particles, hud, panel, camera);
  build.setScene(cave.scene);
  state.essence = 1000;

  // ближайшая пара насестов — на ней и проверим плотную застройку
  let a = null, b = null, bestDist = Infinity;
  for (let i = 0; i < perches.length; i++) {
    for (let j = i + 1; j < perches.length; j++) {
      const d = Math.hypot(
        perches[i].def.pos.x - perches[j].def.pos.x,
        perches[i].def.pos.z - perches[j].def.pos.z
      );
      if (d < bestDist) {bestDist = d; a = perches[i]; b = perches[j];}
    }
  }
  const t1 = build.buildTower('screamer', a, cave.scene);
  const t2 = build.buildTower('frost', b, cave.scene);

  // камера строго сверху — тап проецируется на землю честно
  camera.position.set(0, 30, 0.001);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const raycaster = new THREE.Raycaster();

  // экранные координаты мировых позиций башен (точечный тап по центру)
  const W = window.innerWidth, H = window.innerHeight;
  const toScreen = (pos) => {
    const v = new THREE.Vector3(pos.x, pos.y, pos.z).project(camera);
    return { x: (v.x + 1) * 0.5 * W, y: (1 - v.y) * 0.5 * H };
  };
  const s1 = toScreen(t1.pos);
  const s2 = toScreen(t2.pos);

  // тап точно по центру t1 → выбирается t1, даже если меши «пересекаются»
  assert.equal(build.raycastTower(s1.x, s1.y, [t1, t2], raycaster), t1, 'тап по центру выбирает эту башню');
  assert.equal(build.raycastTower(s2.x, s2.y, [t1, t2], raycaster), t2, 'тап по центру второй выбирает вторую');

  // тап в середину между ними → кандидаты отсортированы по близости
  const mid = { x: (s1.x + s2.x) / 2, y: (s1.y + s2.y) / 2 };
  const cands = build.raycastTowerCandidates(mid.x, mid.y, [t1, t2], raycaster);
  if (cands.length === 2) {
    const d1 = Math.hypot(mid.x - s1.x, mid.y - s1.y);
    const d2 = Math.hypot(mid.x - s2.x, mid.y - s2.y);
    const expectedFirst = d1 <= d2 ? t1 : t2;
    assert.equal(cands[0], expectedFirst, 'первый кандидат — ближайший к тапу');
    assert.equal(cands[1], expectedFirst === t1 ? t2 : t1, 'второй кандидат — соседний');
  } else {
    assert.ok(cands.length === 1, 'населёные пункты далеко — хотя бы один кандидат');
  }

  build.cancelBuildMode(perches);
  build.reset();
});

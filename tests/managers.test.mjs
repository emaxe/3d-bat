// managers.test.mjs — исполняет методы BuildSystem/WaveManager/CameraController
// с реальными three-объектами и заглушками. Поймал 2 реальных бага:
//  1) BuildSystem.upgradeTower → mergePartner(tower, undefined) → «t is not iterable»
//  2) CameraController pinch: второй палец ещё не в Map → b undefined
import { test } from 'node:test';
import assert from 'node:assert/strict';

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

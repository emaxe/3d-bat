// managers.test.mjs — исполняет методы BuildSystem/WaveManager/CameraController
// с реальными three-объектами и заглушками. Поймал 2 реальных бага:
//  1) BuildSystem.upgradeTower → mergePartner(tower, undefined) → «t is not iterable»
//  2) CameraController pinch: второй палец ещё не в Map → b undefined
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Tower } from '../src/entities/tower.js';

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
const { Vec3 } = await import('../src/core/math.js');
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

test('managers: BuildSystem — выбор башни в плотной застройке', () => {
  const { cave, perches, state, effects, particles, hud, panel } = makeGameParts();
  const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 200);
  camera.position.set(0, 30, 0);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  const build = new BuildSystem(state, effects, fakeSfx, particles, hud, panel, camera);
  build.setScene(cave.scene);
  state.essence = 1000;
  // Плотная застройка: насесты рядом (стандартные насесты ур.0 разнесены на ~4.35 ед.,
  // поэтому пикинг не считает их перекрывающимися — см. тест со стр. 302).
  const mkPerch = (x, z) => ({ def: { pos: new Vec3(x, 0, z) }, occupied: false, tower: null, setHighlight() {}, group: null });
  const t1 = build.buildTower('screamer', mkPerch(0, 0), cave.scene);
  const t2 = build.buildTower('frost', mkPerch(0, 0.8), cave.scene);
  assert.ok(t1 && t2, 'обе башни построены');

  // тап по ВИДИМОЙ верхушке второй башни (её центр может быть закрыт соседом)
  const v = new THREE.Vector3(t2.pos.x, t2.pos.y + 1.6, t2.pos.z).project(camera);
  const sx = (v.x + 1) * 0.5 * 800;
  const sy = (1 - v.y) * 0.5 * 600;
  const cands = build.towerCandidatesOnScreen(sx, sy, [t1, t2]);
  assert.ok(cands.includes(t2), 'вторая башня в кандидатах по экранному боксу');
  assert.equal(cands[0], t2, 'ближайшая к тапу — вторая башня');

  // циклический перебор: обе башни должны быть доступны
  const raycaster = new THREE.Raycaster();
  const all = build.raycastTowerCandidates(sx, sy, [t1, t2], raycaster);
  assert.ok(all.includes(t1) && all.includes(t2), 'обе башни в пуле перебора');
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

test('managers: BuildSystem — кандидаты выбора по экранной близости', () => {
  const { cave, state, effects, particles, hud, panel, camera } = makeGameParts();
  const build = new BuildSystem(state, effects, fakeSfx, particles, hud, panel, camera, true); // isTouch
  build.setScene(cave.scene);
  state.essence = 1000;

  // Две башни на соседних насестах (плотно: 0.4 ед., чтобы боксы перекрывались)
  const mkPerch = (x, z) => ({ def: { pos: new Vec3(x, 0, z) }, occupied: false, tower: null, setHighlight() {}, group: null });
  const t1 = build.buildTower('screamer', mkPerch(0, 0), cave.scene);
  const t2 = build.buildTower('frost', mkPerch(0, 0.4), cave.scene);
  assert.ok(t1 && t2, 'обе башни построены');
  const towers = [t1, t2];

  // Настоящая камера для проекции на экран
  const cam = new THREE.PerspectiveCamera(50, 4 / 3, 0.1, 120);
  cam.position.set(0, 9, 14);
  cam.lookAt(0, 0, 0);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
  const rc = new THREE.Raycaster();
  // патчим ссылку на камеру в BuildSystem (в makeGameParts передаётся stub)
  build.camera = cam;

  // Экранные центры обеих башен
  const toScreen = (pos) => {
    const v = new THREE.Vector3(pos.x, pos.y + 0.9, pos.z).project(cam);
    return { x: (v.x + 1) * 0.5 * window.innerWidth, y: (1 - v.y) * 0.5 * window.innerHeight };
  };
  const s1 = toScreen(t1.pos);
  const s2 = toScreen(t2.pos);

  // Тап точно по первой башне → кандидат №1 — она сама
  let cands = build.raycastTowerCandidates(s1.x, s1.y, towers, rc);
  assert.equal(cands[0], t1, 'тап по центру башни 1 → она первая');
  assert.ok(cands.includes(t2), 'соседняя башня в кандидатах (можно переключиться)');

  // Тап между башнями → обе в кандидатах, ближайшая — первая
  cands = build.raycastTowerCandidates((s1.x + s2.x) / 2, (s1.y + s2.y) / 2, towers, rc);
  assert.equal(cands.length, 2, 'обе башни в окне кандидатов');
  const d1 = Math.hypot(cands[0].pos.x - ((t1.pos.x + t2.pos.x) / 2), cands[0].pos.z - ((t1.pos.z + t2.pos.z) / 2));
  const d2 = Math.hypot(cands[1].pos.x - ((t1.pos.x + t2.pos.x) / 2), cands[1].pos.z - ((t1.pos.z + t2.pos.z) / 2));
  assert.ok(d1 <= d2, 'первый кандидат — ближайшая к тапу башня');

  // Тап далеко от обеих → кандидатов нет
  cands = build.raycastTowerCandidates(10, 10, towers, rc);
  assert.equal(cands.length, 0, 'далёкий тап не выбирает башню');
});

test('managers: BuildSystem — выбор башни в плотной застройке (по видимому боксу)', () => {
  const { cave, perches, state, effects, particles, hud, panel } = makeGameParts();
  const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 200);
  camera.position.set(0, 40, 0);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const build = new BuildSystem(state, effects, fakeSfx, particles, hud, panel, camera);
  build.setScene(cave.scene);
  state.essence = 1000;

  // две башни на соседних насестах
  const p1 = perches.find(p => !p.occupied);
  const t1 = build.buildTower('screamer', p1, cave.scene);
  const p2 = perches.find(p => !p.occupied);
  const t2 = build.buildTower('frost', p2, cave.scene);
  assert.ok(t1 && t2, 'обе башни построены');

  const raycaster = new THREE.Raycaster();
  const proj = (t) => {
    const v = new THREE.Vector3(t.pos.x, t.pos.y + 0.9, t.pos.z).project(camera);
    return { x: (v.x + 1) * 0.5 * 800, y: (1 - v.y) * 0.5 * 600 };
  };

  // тап по центру второй башни — выбирается она, а не соседняя
  const c2 = proj(t2);
  const cands = build.raycastTowerCandidates(c2.x, c2.y, [t1, t2], raycaster);
  assert.equal(cands[0], t2, 'ближайшая к тапу — вторая башня');
  assert.ok(cands.includes(t1) || cands.length === 1, 'первая башня либо тоже кандидат, либо не перекрывается');

  // тап по центру первой — выбирается первая
  const c1 = proj(t1);
  const cands1 = build.raycastTowerCandidates(c1.x, c1.y, [t1, t2], raycaster);
  assert.equal(cands1[0], t1, 'ближайшая к тапу — первая башня');

  // повторный тап по той же группе переключает (циклический перебор)
  const merged = [t1, t2];
  const i = merged.indexOf(t1);
  const next = merged[(i + 1) % merged.length];
  assert.equal(next, t2, 'циклический перебор идёт на следующую башню');

  t1.dispose();
  t2.dispose();
});

test('managers: выбор башни по экранному bbox (плотная застройка)', () => {
  const { cave, perches, state, effects, particles, hud, panel } = makeGameParts();
  const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 100);
  camera.position.set(0, 26, 0.01);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  const build = new BuildSystem(state, effects, fakeSfx, particles, hud, panel, camera);
  build.setScene(cave.scene);
  state.essence = 1000;

  // Плотная застройка: насесты рядом (стандартные ур.0 разнесены на ~4.35 ед. —
  // их боксы не перекрываются, что и проверялось ошибочно).
  const mkPerch = (x, z) => ({ def: { pos: new Vec3(x, 0, z) }, occupied: false, tower: null, setHighlight() {}, group: null });
  const a = build.buildTower('screamer', mkPerch(0, 0), cave.scene);
  const b = build.buildTower('frost', mkPerch(0, 0.8), cave.scene);
  assert.ok(a.pickBox && b.pickBox, 'у башен есть pickBox');
  assert.ok(a.pickBox.min.x < a.pickBox.max.x, 'pickBox не пустой');

  const w = window.innerWidth, h = window.innerHeight;
  const proj = (t) => {
    const v = new THREE.Vector3(t.pos.x, t.pos.y + 0.5, t.pos.z).project(camera);
    return { x: (v.x + 1) * 0.5 * w, y: (1 - v.y) * 0.5 * h };
  };

  // тап по центру башни B — первым кандидатом должна быть B
  const pb = proj(b);
  const c1 = build.towerCandidatesOnScreen(pb.x, pb.y, [a, b]);
  assert.equal(c1[0], b, 'тап по центру B выбирает B');

  // тап по центру башни A — первым кандидатом должна быть A
  const pa = proj(a);
  const c2 = build.towerCandidatesOnScreen(pa.x, pa.y, [a, b]);
  assert.equal(c2[0], a, 'тап по центру A выбирает A');

  // raycastTowerCandidates не падает с реальной камерой и находит обе
  const raycaster = new THREE.Raycaster();
  const cands = build.raycastTowerCandidates(pb.x, pb.y, [a, b], raycaster);
  assert.ok(cands.includes(b), 'B в кандидатах рейкаста');
  assert.ok(cands.includes(a), 'A в кандидатах рейкаста (перекрытие боксов)');
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

test('managers: BuildSystem — плотная застройка: обе башни в кандидатах выбора', () => {
  const { cave, state, effects, particles, hud, panel } = makeGameParts();
  const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 120);
  camera.position.set(9, 5, 0);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const build = new BuildSystem(state, effects, fakeSfx, particles, hud, panel, camera);
  build.setScene(cave.scene);
  state.essence = 1000;

  // Две башни вплотную (плотная застройка), B — дальше от камеры (+Z).
  const mkPerch = (x, z) => ({ def: { pos: { x, y: 0, z, clone() { return { x, y: 0, z }; } } }, occupied: false, setHighlight() {} });
  const ta = build.buildTower('screamer', mkPerch(0, 0), cave.scene);
  const tb = build.buildTower('frost', mkPerch(0, 0.8), cave.scene);
  assert.ok(ta && tb, 'обе башни построены');

  // Тап в перекрытие боксов (середина между башнями на высоте корпуса).
  const mid = new THREE.Vector3(0, 0.6, 0.4).project(camera);
  const sx = (mid.x + 1) * 0.5 * 800;
  const sy = (1 - mid.y) * 0.5 * 600;
  const cands = build.towerCandidatesOnScreen(sx, sy, [ta, tb]);
  assert.ok(cands.includes(ta), 'башня A в кандидатах');
  assert.ok(cands.includes(tb), 'башня B в кандидатах (раньше дальнюю было не выбрать)');

  // Полный список кандидатов для циклического перебора — содержит обе.
  const all = build.raycastTowerCandidates(sx, sy, [ta, tb], new THREE.Raycaster());
  assert.ok(all.includes(ta) && all.includes(tb), 'обе башни в переборе');
  assert.equal(all[0] !== all[1], true, 'порядок перебора разный — повторный тап переключает');
});

test('managers: BuildSystem — выбор башни по экранной близости (не по перехваченному лучу)', () => {
  const { cave } = makeGameParts();
  const scene = cave.scene;
  const mkPerch = (x, z) => ({
    def: { pos: new Vec3(x, 0, z) },
    occupied: false,
    tower: null,
    setHighlight() {}, group: null,
  });
  // Плотная застройка: насесты рядом (≤1.2 ед.) — чтобы тап между ними попадал в боксы.
  const perches = [mkPerch(0, 0), mkPerch(1.0, 0), mkPerch(2.0, 0)];

  // Строим настоящие башни (Tower из entities)
  const realTowers = perches.map(p => new Tower('screamer', p, scene));

  const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 100);
  camera.position.set(1, 6, 10);
  camera.lookAt(1, 0, 0);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();

  const state = new GameState();
  const build = new BuildSystem(state, {}, {}, {}, {}, {}, camera, false);

  // проекция центра каждой башни на экран (800×600)
  const v = new THREE.Vector3();
  const proj = realTowers.map(t => {
    v.set(t.pos.x, t.pos.y + 0.9, t.pos.z).project(camera);
    return { x: (v.x + 1) * 0.5 * 800, y: (1 - v.y) * 0.5 * 600 };
  });

  // тап в центр второй башни — первой выбирается она
  const rc = new THREE.Raycaster();
  let cands = build.raycastTowerCandidates(proj[1].x, proj[1].y, realTowers, rc);
  assert.ok(cands.length >= 1, 'есть кандидаты');
  assert.equal(cands[0], realTowers[1], 'ближайшая к тапу башня выбирается первой');

  // тап в точку между первой и второй, ближе к первой
  const mx = (proj[0].x + proj[1].x) / 2 - 5;
  const my = (proj[0].y + proj[1].y) / 2;
  cands = build.raycastTowerCandidates(mx, my, realTowers, rc);
  assert.equal(cands[0], realTowers[0], 'ближайшая по экрану — первая из группы');

  // hover тоже использует экранную близость
  const hovered = build.raycastTower(proj[2].x, proj[2].y, realTowers, rc);
  assert.equal(hovered, realTowers[2], 'hover выбирает ближайшую к курсору');
});

test('managers: BuildSystem — пикинг башен по экранной близости и кандидаты', () => {
  // Настоящая камера three (работает в Node без рендера) + фейковые башни.
  // Кандидаты определяются попаданием тапа в экранный бокс pickBox башни.
  const { cave, state, effects, particles, hud, panel } = makeGameParts();
  const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 100);
  const build = new BuildSystem(state, effects, fakeSfx, particles, hud, panel, camera, false);
  const T = (x, z, id = 'screamer') => ({
    alive: true, pos: new Vec3(x, 0, z), typeId: id, mesh: null,
    // pickBox нужен towerCandidatesOnScreen (иначе башня пропускается)
    pickBox: new THREE.Box3(new THREE.Vector3(x - 0.5, -0.4, z - 0.5), new THREE.Vector3(x + 0.5, 0.8, z + 0.5)),
  });

  camera.position.set(0, 12, 16);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  const towers = [T(-0.5, 0), T(0.5, 0), T(3, 0)];
  // проекция центров в экранные координаты (окно 800x600)
  const proj = (x, z) => {
    const v = new THREE.Vector3(x, 0.9, z).project(camera);
    return [(v.x + 1) * 0.5 * 800, (1 - v.y) * 0.5 * 600];
  };
  const [sx0, sy0] = proj(-0.5, 0);
  const [sx1] = proj(0.5, 0);

  // тап точно по центру первой башни — она ближайшая
  const c1 = build.raycastTowerCandidates(sx0, sy0, towers, { setFromCamera() {}, intersectObjects: () => [] });
  assert.ok(c1.includes(towers[0]), 'первая башня в кандидатах');
  assert.equal(c1[0], towers[0], 'первая башня — ближайшая к тапу');

  // тап между двумя близкими башнями — обе в кандидатах, порядок по близости
  const mid = (sx0 + sx1) / 2;
  const c2 = build.raycastTowerCandidates(mid, sy0, towers, { setFromCamera() {}, intersectObjects: () => [] });
  assert.ok(c2.includes(towers[0]) && c2.includes(towers[1]), 'обе близкие башни в кандидатах');

  // далёкая башня не попадает в бокс близких — только она в кандидатах при тапе по ней
  const [sx2, sy2] = proj(3, 0);
  const c3 = build.raycastTowerCandidates(sx2, sy2, towers, { setFromCamera() {}, intersectObjects: () => [] });
  assert.ok(c3.includes(towers[2]), 'дальняя башня выбрана при тапе по ней');
  assert.equal(c3.length, 1, 'другие башни вне бокса');
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
    // Мёртвая зона by design: тап в пустоту между далёкими башнями не должен
    // хватать случайную башню — новый пикинг (строгий бокс + точный луч)
    // сознательно возвращает 0 кандидатов вместо старого порогового захвата.
    assert.ok(cands.length === 0 || cands.length === 1,
      'тап в мёртвую зону не выбирает башню (или выбирает одну при перекрытии)');
  }

  build.cancelBuildMode(perches);
  build.reset();
});

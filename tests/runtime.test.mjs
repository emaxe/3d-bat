// Runtime-смоук: реально ВЫПОЛНЯЕТ сборщики сцены и конструкторы сущностей
// с заглушками 2D-canvas. Ловит TDZ / TypeError / неверные методы,
// которые import-тесты не видят (код просто не выполняется при импорте).
import { test } from 'node:test';
import assert from 'node:assert/strict';

// --- заглушки браузерных API ---
function makeCtx() {
  const grad = {
    addColorStop(offset, color) {
      // Canvas API требует СТРОКУ цвета — числа (0xffb066) падают в браузере.
      if (typeof color !== 'string') throw new Error(`addColorStop: цвет не строка: ${color}`);
    },
  };
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

function fakeCanvas() {
  return { width: 1, height: 1, getContext: (k) => (k === '2d' ? makeCtx() : null), toDataURL: () => 'data:image/png;base64,AAAA' };
}

const fakeEl = () => ({
  style: {}, dataset: {}, textContent: '', innerHTML: '',
  classList: { add() {}, remove() {}, toggle() {} },
  appendChild() {}, addEventListener() {}, setAttribute() {},
});

globalThis.document = {
  createElement: (t) => (t === 'canvas' ? fakeCanvas() : fakeEl()),
  getElementById: () => fakeEl(),
  body: { appendChild() {} },
  addEventListener() {},
};
globalThis.window = { addEventListener() {}, innerWidth: 800, innerHeight: 600, devicePixelRatio: 2 };

test('runtime: сборщики мира выполняются без ошибок', async () => {
  const { buildCave, updateCave } = await import('../src/world/cave.js');
  const { buildPathVisual } = await import('../src/world/path.js');
  const { buildPerches } = await import('../src/world/perches.js');
  const cave = buildCave();
  assert.ok(cave.scene, 'сцена создана');
  const pathVis = buildPathVisual(cave.scene);
  assert.ok(pathVis.path && pathVis.path.length > 0, 'путь создан');
  const perches = buildPerches(cave.scene, cave.materials.rockMat);
  assert.ok(perches.length >= 10, 'насесты созданы');
  updateCave(cave, 1.23);
  assert.ok(cave.crystalLight.intensity > 500, 'пульс кристалла работает');
});

test('runtime: все модели врагов строятся', async () => {
  const { buildEnemyMesh } = await import('../src/entities/enemy.js');
  const types = ['moth', 'beetle', 'swarm', 'cloak', 'regen', 'healer', 'ranger', 'spider', 'spiderling', 'vampmoth'];
  for (const t of types) {
    const g = buildEnemyMesh(t, '#ffaa00', 0.4);
    assert.ok(g.children.length > 0, `${t}: модель собрана`);
  }
});

test('runtime: все башни строятся (обычные и альфа)', async () => {
  const { buildTowerMesh } = await import('../src/entities/tower.js');
  const { TOWER_TYPES } = await import('../src/core/towers.js');
  const types = ['screamer', 'frost', 'spore', 'echo', 'fire', 'lantern', 'vampire'];
  for (const t of types) {
    const g = buildTowerMesh(t, 1, false);
    assert.ok(g.children.length > 0, `${t}: модель собрана`);
    // альфа только для типов, у которых она есть (lantern/vampire не сливаются)
    if (TOWER_TYPES[t].alpha) buildTowerMesh(t, 3, true);
  }
});

test('runtime: Enemy и Tower конструируются и обновляются', async () => {
  const { buildCave } = await import('../src/world/cave.js');
  const { buildPathVisual } = await import('../src/world/path.js');
  const { buildPerches } = await import('../src/world/perches.js');
  const { Enemy } = await import('../src/entities/enemy.js');
  const { Tower } = await import('../src/entities/tower.js');
  const cave = buildCave();
  const pathVis = buildPathVisual(cave.scene);
  const perches = buildPerches(cave.scene, cave.materials.rockMat);
  const ctx = {
    scene: cave.scene, towers: [], enemies: [], projectiles: [], pulses: [],
    particles: { spawn() {}, burst() {}, ring() {}, directed() {} },
    sfx: { shoot() {}, hit() {}, echo() {}, lantern() {}, explosion() {}, coin() {}, death() {}, click() {}, wave() {}, boss() {} },
    moonSpeedMul: 1, moonRewardMul: 1, moonTowerMul: 1, cloakAll: false,
    damageNumber() {},
  };
  const e = new Enemy('moth', 1, pathVis.path, cave.scene, ctx);
  assert.ok(e.alive, 'враг создан');
  e.update(0.016);
  assert.ok(e.progress >= 0, 'враг движется');
  const tower = new Tower('screamer', perches[0], cave.scene);
  assert.ok(tower.alive, 'башня создана');
  tower.update(0.016, ctx);
  tower.upgrade();
  assert.equal(tower.level, 2, 'апгрейд работает');
  tower.showRange(true);
  tower.dispose();
  e.dispose();
});

test('runtime: декор всех уровней не пересекает путь врагов', async () => {
  const { buildCave } = await import('../src/world/cave.js');
  const { LEVELS, buildLevelPath } = await import('../src/core/layout.js');
  const minClearance = {
    boulder: 5.8, stalagmite: 4.2, shroom: 3.0, druze: 2.8, water: 6.4, lava: 6.4, crack: 3.5, spire: 8.0,
    stalactite: 4.2, crystal_cluster: 4.8, ore: 3.0, roots: 5.8, bone_pile: 4.0, stone_arch: 7.2, spore_cloud: 3.0,
  };
  const minPerchClearance = {
    crystal_cluster: 2.2, roots: 2.5, bone_pile: 2.0, stone_arch: 3.0,
  };
  for (const cfg of LEVELS) {
    const path = buildLevelPath(cfg.id);
    const cave = buildCave(cfg, path);
    assert.ok(cave.decor.length >= 10, `${cfg.name}: декор есть`);
    for (const item of cave.decor) {
      let best = Infinity;
      for (let d = 0; d <= path.length; d += 1.0) {
        const q = path.pointAt(d);
        best = Math.min(best, Math.hypot(q.x - item.x, q.z - item.z));
      }
      const need = minClearance[item.kind] ?? 2.5;
      assert.ok(best >= need - 0.2, `${cfg.name}: ${item.kind} на ${best.toFixed(2)} от пути (нужно ≥${need})`);
      if (minPerchClearance[item.kind] && cfg.perches) {
        let bestPerch = Infinity;
        for (const p of cfg.perches) {
          bestPerch = Math.min(bestPerch, Math.hypot(p.pos.x - item.x, p.pos.z - item.z));
        }
        const perchNeed = minPerchClearance[item.kind];
        assert.ok(bestPerch >= perchNeed - 0.01, `${cfg.name}: ${item.kind} на ${bestPerch.toFixed(2)} от насеста (нужно ≥${perchNeed})`);
      }
    }
  }
});

test('runtime: стены-скалы не пересекают путь ни на одном уровне', async () => {
  const { buildCave } = await import('../src/world/cave.js');
  const { LEVELS, buildLevelPath } = await import('../src/core/layout.js');
  for (const cfg of LEVELS) {
    const path = buildLevelPath(cfg.id);
    const cave = buildCave(cfg, path);
    assert.ok(cave.walls && cave.walls.length >= 10, `${cfg.name}: стены есть`);
    for (const [wx, wy, wz, ws] of cave.walls) {
      const r = ws * 0.85;
      let best = Infinity;
      for (let d = 0; d <= path.length; d += 0.25) {
        const q = path.pointAt(d);
        best = Math.min(best, Math.hypot(q.x - wx, q.z - wz) - r);
      }
      assert.ok(best >= 2.5, `${cfg.name}: стена (${wx},${wz}) ближе ${best.toFixed(2)} к пути`);
    }
  }
});

test('runtime: снаряд — glow строго локальный (нет «дубля в стороне») и летит к цели', async () => {
  const { buildCave } = await import('../src/world/cave.js');
  const { Projectile } = await import('../src/entities/projectile.js');
  const { Vec3 } = await import('../src/core/math.js');
  const cave = buildCave();
  const target = { pos: new Vec3(1, 0, 0), alive: true };
  const p = new Projectile(cave.scene, {
    kind: 'bolt', damage: 10, speed: 14, target,
    pos: new Vec3(0, 0, 0), color: '#ff5a4e',
  });
  // glow — дочерний mesh и в локальном нуле (иначе свечение улетает «в сторону»)
  assert.equal(p.glow.parent, p.mesh, 'glow должен быть дочерним у mesh');
  assert.equal(p.glow.position.x, 0);
  assert.equal(p.glow.position.y, 0);
  assert.equal(p.glow.position.z, 0);
  p.update(0.016);
  assert.ok(!p.dead, 'снаряд жив в полёте');
  p.dispose();
});

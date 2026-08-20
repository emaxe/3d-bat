// Процедурная пещера: пол, стены, сталагмиты, кристалл, свет, декор.
// Принимает конфиг уровня (LEVELS[i]) и путь — весь декор размещается
// с гарантированным отступом от трассы, чтобы ничего не стояло на пути врагов.
import * as THREE from 'three';

import { LEVELS, CRYSTAL, ENTRANCE } from '../core/layout.js';
import { Path } from '../core/math.js';

import { rockTexture, rockBumpTexture, crystalTexture, glowTexture, makeFbm } from './textures.js';

// Вершинный шум для «камней».
function _displace(geo, amp, seed = 1) {
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const rnd = mulberry(seed);
  const dirs = [];
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const n = 1 + (rnd() - 0.5) * 2 * amp;
    dirs.push(v.clone().multiplyScalar(n));
  }
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, dirs[i].x, dirs[i].y, dirs[i].z);
  }
  geo.computeVertexNormals();
  geo.attributes.position.needsUpdate = true;
}

function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Минимальное XZ-расстояние от точки до пути (выборка с шагом).
function minDistToPath(path, x, z, step = 1.2) {
  let best = Infinity;
  for (let d = 0; d <= path.length; d += step) {
    const p = path.pointAt(d);
    const dist = Math.hypot(p.x - x, p.z - z);
    if (dist < best) {best = dist;}
  }
  return best;
}

// Подбор точки для декора: в кольце [minR, maxR] от центра, с отступом от пути.
function findSpot(rnd, path, minR, maxR, clearance, tries = 40) {
  for (let i = 0; i < tries; i++) {
    const ang = rnd() * Math.PI * 2;
    const rad = minR + rnd() * (maxR - minR);
    const x = Math.cos(ang) * rad;
    const z = Math.sin(ang) * rad;
    if (minDistToPath(path, x, z) >= clearance) {return { x, z };}
  }
  return null; // не нашли — пропускаем (визуальный декор, не критично)
}

// Точный подбор для ВАЛУНОВ: мелкий шаг (ловим изгибы) + запрет зоны кристалла.
function findBoulder(rnd, path, minR, maxR, clearance, tailNo) {
  for (let i = 0; i < 60; i++) {
    const ang = rnd() * Math.PI * 2;
    const rad = minR + rnd() * (maxR - minR);
    const x = Math.cos(ang) * rad;
    const z = Math.sin(ang) * rad;
    let best = Infinity, bd = -1;
    for (let d = 0; d <= path.length; d += 0.4) {
      const p = path.pointAt(d);
      const dist = Math.hypot(p.x - x, p.z - z);
      if (dist < best) { best = dist; bd = d; }
    }
    // не ставим валуны в финальной зоне (у кристалла) — там игрок строит и смотрит
    if (best >= clearance && bd < path.length - tailNo) {return { x, z };}
  }
  return null;
}

// Минимальное XZ-расстояние от точки до всех насестов уровня.
function minDistToPerches(perches, x, z) {
  if (!perches || perches.length === 0) {return Infinity;}
  let best = Infinity;
  for (let i = 0; i < perches.length; i++) {
    const p = perches[i].pos;
    const dist = Math.hypot(p.x - x, p.z - z);
    if (dist < best) {best = dist;}
  }
  return best;
}

// Универсальное размещение процедурного декора с проверкой отступа от пути и насестов.
function placeDecor(rnd, path, perches, kind, geo, mat, count, opts) {
  const items = [];
  const scene = opts.scene;
  const decor = opts.decor;
  const tries = opts.tries ?? 40;
  for (let i = 0; i < count; i++) {
    let spot = null;
    for (let t = 0; t < tries; t++) {
      const candidate = findSpot(rnd, path, opts.minR, opts.maxR, opts.clearance, 1);
      if (!candidate) {continue;}
      if (opts.perchClearance != null && minDistToPerches(perches, candidate.x, candidate.z) < opts.perchClearance) {
        continue;
      }
      spot = candidate;
      break;
    }
    if (!spot) {continue;}

    let obj;
    if (opts.create) {
      obj = opts.create(spot, i, rnd);
    } else {
      obj = new THREE.Mesh(geo, mat);
      const y = typeof opts.y === 'function' ? opts.y(spot, i, rnd) : (opts.y ?? opts.floorY ?? -1.35);
      obj.position.set(spot.x, y, spot.z);
      if (opts.rotation) {
        if (typeof opts.rotation === 'function') {opts.rotation(obj, spot, i, rnd);}
        else if (Array.isArray(opts.rotation)) {obj.rotation.set(...opts.rotation);}
      }
      if (opts.scale) {
        if (typeof opts.scale === 'function') {opts.scale(obj, spot, i, rnd);}
        else if (typeof opts.scale === 'number') {obj.scale.setScalar(opts.scale);}
        else if (Array.isArray(opts.scale)) {obj.scale.set(...opts.scale);}
      }
    }
    if (obj) {
      if (scene) {scene.add(obj);}
      const entry = { mesh: obj, x: spot.x, z: spot.z, kind };
      if (decor) {decor.push({ kind, x: spot.x, z: spot.z });}
      items.push(entry);
    }
  }
  return items;
}

export function buildCave(cfg = null, path = null) {
  const L = cfg ?? LEVELS[0];
  const theme = L.theme ?? LEVELS[0].theme;
  const usePath = path ?? new Path(L.pathPoints);
  const perches = L.perches ?? [];
  const FLOOR_Y = -1.35;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(theme.fog);
  scene.fog = new THREE.FogExp2(theme.fog, 0.024);

  // --- свет (тема уровня) ---
  scene.add(new THREE.AmbientLight(theme.ambient ?? 0x3a3a5a, 1.5));
  scene.add(new THREE.HemisphereLight(theme.hemiA ?? 0x6688cc, theme.hemiB ?? 0x181430, 1.1));
  const moonLight = new THREE.DirectionalLight(theme.moon ?? 0x8899ff, 1.35);
  moonLight.position.set(-8, 14, 2);
  scene.add(moonLight);
  const fill = new THREE.DirectionalLight(theme.fill ?? 0x4466cc, 0.8);
  fill.position.set(9, 3, 11);
  scene.add(fill);
  const warm = new THREE.PointLight(theme.warm1 ?? 0xff9955, 550, 18, 2);
  warm.position.set(0, 2.6, -16.5);
  scene.add(warm);
  const warm2 = new THREE.PointLight(theme.warm2 ?? 0xff7744, 450, 16, 2);
  warm2.position.set(5, 1.6, -6);
  scene.add(warm2);
  const portalLight = new THREE.PointLight(theme.portal ?? 0x8844ff, 220, 10, 2);
  portalLight.position.copy(ENTRANCE);
  scene.add(portalLight);

  // факелы вдоль трассы: 2 настоящих источника света + 3 светящихся шара.
  // Позиции подбираются с отступом от пути (уровнезависимо).
  const torchTex = glowTexture(theme.torch ?? '#ffb066', 'rgba(255,180,110,0.9)');
  const torches = [];
  const torchSprites = [];
  for (let i = 0; i < 5; i++) {
    const spot = findSpot(mulberry(500 + i * 77), usePath, 5.5, 9.5, 4.2);
    if (!spot) {continue;}
    const y = 1.5 + (i % 3) * 0.25;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: torchTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9,
    }));
    spr.position.set(spot.x, y, spot.z);
    spr.scale.setScalar(1.1);
    scene.add(spr);
    torchSprites.push(spr);
    // настоящий свет — только у первых двух (остальные визуальные, дёшево)
    if (i < 2) {
      const l = new THREE.PointLight(theme.torch ?? 0xffb066, 230, 9, 2);
      l.position.set(spot.x, y, spot.z);
      scene.add(l);
      torches.push(l);
    }
  }

  // --- материалы ---
  const rockTex = rockTexture(7);
  const bumpTex = rockBumpTexture(11);
  const rockMat = new THREE.MeshStandardMaterial({
    map: rockTex, bumpMap: bumpTex, bumpScale: 0.6, roughness: 0.95, metalness: 0.05, color: 0xffffff,
  });

  // --- пол ---
  const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), rockMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  // холмы: смещаем вершины по локальному Z (= мировая высота после rotation.x=-90°)
  const floorFbm = makeFbm(13, 4);
  const floorHeightAt = (x, z) => (floorFbm(x / 11, z / 11) - 0.5) * 0.35;
  {
    const pos = floor.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      // локальная y = −мировой z (после rotation.x=-PI/2) — считаем по мировым осям
      const h = floorHeightAt(x, -y);
      pos.setZ(i, h);
    }
    floor.geometry.computeVertexNormals();
    pos.needsUpdate = true;
  }
  scene.add(floor);

  // тёмная «лужа» вокруг кристалла (цвет от темы)
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(5.2, 40),
    new THREE.MeshStandardMaterial({ color: theme.pool ?? 0x0a1a2e, roughness: 0.3, metalness: 0.4, transparent: true, opacity: 0.85 })
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(CRYSTAL.pos.x, FLOOR_Y + floorHeightAt(CRYSTAL.pos.x, CRYSTAL.pos.z) + 0.03, CRYSTAL.pos.z);
  scene.add(pool);

  // --- стены (кольцо камней) ---
  // Стены-скалы вокруг уровня. ВАЖНО: не ближе ~3.0 к любому пути (см. тест
  // «стены не пересекают путь»); пути трёх уровней проходят в центральном коридоре.
  const wallGeo = new THREE.IcosahedronGeometry(1, 1);
  const wallMat = rockMat;
  const blobs = [
    [17.5, 1.5, 0, 6], [12, 2, 8, 4.5], [15, 1, 13, 5.5], [14.5, 1.5, -13.5, 4.5],
    [17, 2, -13, 5.5], [-15.5, 1.5, -12, 4.5], [-19, 1, -3.5, 6], [-14, 2, 8, 5.5],
    [-9, 1.5, 13, 4], [8, 1.5, 14, 4.5], [18, 3, 6, 7], [-18, 3, -8, 7],
  ];
  for (const [x, y, z, s] of blobs) {
    const m = new THREE.Mesh(wallGeo, wallMat);
    m.position.set(x, y + 1, z);
    m.scale.set(s, s * 0.9, s);
    m.rotation.y = x * 0.7;
    scene.add(m);
  }

  const rnd = mulberry(99);
  const decor = []; // {kind, x, z} — для тестов гарантии отступа от пути

  // --- сталагмиты (только у стен, с отступом от трассы) ---
  const stal2Geo = new THREE.ConeGeometry(0.35, 1, 5);
  for (let i = 0; i < 12; i++) {
    const spot = findSpot(rnd, usePath, 10, 18, 4.5);
    if (!spot) {continue;}
    const m = new THREE.Mesh(stal2Geo, rockMat);
    m.position.set(spot.x, FLOOR_Y, spot.z);
    m.scale.set(0.6 + rnd() * 0.6, 0.7 + rnd() * 1.1, 0.6 + rnd() * 0.6);
    scene.add(m);
    decor.push({ kind: 'stalagmite', x: spot.x, z: spot.z });
  }

  // --- кристальные друзы вокруг кристалла (акцент темы) ---
  const druzeMat = new THREE.MeshStandardMaterial({
    color: theme.accent ?? 0x66e0ff, roughness: 0.2, metalness: 0.3,
    emissive: new THREE.Color(theme.accent ?? 0x66e0ff).multiplyScalar(0.4), emissiveIntensity: 0.7,
  });
  for (let i = 0; i < 5; i++) {
    const spot = findSpot(mulberry(700 + i * 31), usePath, 2.8, 4.4, 3.0, 30);
    if (!spot) {continue;}
    const druze = new THREE.Mesh(new THREE.OctahedronGeometry(0.35 + rnd() * 0.25, 0), druzeMat);
    druze.position.set(spot.x, FLOOR_Y + 0.45, spot.z);
    druze.rotation.y = rnd() * Math.PI;
    druze.scale.y = 1.4;
    scene.add(druze);
    decor.push({ kind: 'druze', x: spot.x, z: spot.z });
  }

  // --- светящиеся грибы у трассы (с отступом поменьше — они крошечные) ---
  const shroomCapMat = new THREE.MeshStandardMaterial({
    color: 0x4fae2a, roughness: 0.5, emissive: 0x1a5a10, emissiveIntensity: 0.8,
  });
  const shroomStemMat = new THREE.MeshStandardMaterial({ color: 0xc8c0a8, roughness: 0.9 });
  const shroomCapGeo = new THREE.SphereGeometry(0.16, 7, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  const shroomStemGeo = new THREE.CylinderGeometry(0.05, 0.07, 0.22, 5);
  for (let i = 0; i < 6; i++) {
    const spot = findSpot(rnd, usePath, 2.0, 7.5, 3.2);
    if (!spot) {continue;}
    const g = new THREE.Group();
    const cap = new THREE.Mesh(shroomCapGeo, shroomCapMat);
    cap.position.y = 0.22;
    const stem = new THREE.Mesh(shroomStemGeo, shroomStemMat);
    stem.position.y = 0.11;
    g.add(stem, cap);
    g.position.set(spot.x, FLOOR_Y, spot.z);
    g.scale.setScalar(0.8 + rnd() * 0.7);
    scene.add(g);
    decor.push({ kind: 'shroom', x: spot.x, z: spot.z });
  }

  // --- валуны (только с большим отступом — чтобы путь не проходил внутри!) ---
  const boulderGeo = new THREE.DodecahedronGeometry(0.5, 0);
  for (let i = 0; i < 4; i++) {
    const spot = findBoulder(rnd, usePath, 9.0, 14.5, 6.2, 7);
    if (!spot) {continue;}
    const b = new THREE.Mesh(boulderGeo, rockMat);
    b.position.set(spot.x, FLOOR_Y + 0.25, spot.z);
    b.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    b.scale.setScalar(0.7 + rnd() * 0.9);
    scene.add(b);
    decor.push({ kind: 'boulder', x: spot.x, z: spot.z });
  }

  // --- вода / лава (тема уровня: theme.water или theme.lava) ---
  const waterPools = [];
  const cracks = [];
  if (theme.water || theme.lava) {
    const isLava = !!theme.lava;
    const waterColor = isLava ? theme.lava : theme.water;
    const waterMat = new THREE.MeshStandardMaterial({
      color: waterColor, transparent: true, opacity: 0.85, roughness: 0.15, metalness: 0.5,
      emissive: waterColor, emissiveIntensity: 0.3,
    });
    for (let i = 0; i < (isLava ? 1 : 2); i++) {
      const spot = findSpot(mulberry(810 + i * 47), usePath, 8, 14, 6.8);
      if (!spot) {continue;}
      const pool = new THREE.Mesh(new THREE.CircleGeometry(2.6 + rnd() * 1.8, 28), waterMat);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(spot.x, FLOOR_Y + floorHeightAt(spot.x, spot.z) + 0.06, spot.z);
      scene.add(pool);
      waterPools.push(pool);
      decor.push({ kind: isLava ? 'lava' : 'water', x: spot.x, z: spot.z });
    }
  }

  // --- светящиеся трещины в полу (только лавовый уровень) ---
  if (theme.lava) {
    const crackMat = new THREE.MeshStandardMaterial({
      color: 0x220400, emissive: theme.lava, emissiveIntensity: 0.9, roughness: 0.4,
    });
    for (let i = 0; i < 5; i++) {
      const spot = findSpot(mulberry(900 + i * 61), usePath, 4.5, 12, 3.8);
      if (!spot) {continue;}
      const len = 2.5 + rnd() * 2.5;
      const crack = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.14), crackMat);
      crack.rotation.x = -Math.PI / 2;
      crack.rotation.z = rnd() * Math.PI;
      crack.position.set(spot.x, FLOOR_Y + floorHeightAt(spot.x, spot.z) + 0.04, spot.z);
      scene.add(crack);
      cracks.push(crack);
      decor.push({ kind: 'crack', x: spot.x, z: spot.z });
    }
  }

  // --- каменные шпили с светящейся вершиной ---
  const spires = [];
  for (let i = 0; i < 3; i++) {
    const spot = findSpot(mulberry(1000 + i * 83), usePath, 9, 15, 8.5);
    if (!spot) {continue;}
    const h = 4 + rnd() * 4;
    const spire = new THREE.Mesh(new THREE.ConeGeometry(1.1, h, 7), rockMat);
    spire.position.set(spot.x, FLOOR_Y + h / 2 - 0.3, spot.z);
    spire.rotation.y = rnd() * Math.PI;
    scene.add(spire);
    const tip = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(theme.accent ?? 0x66e0ff, 'rgba(255,255,255,0.5)'),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8,
    }));
    tip.scale.setScalar(0.9);
    tip.position.set(spot.x, FLOOR_Y + h - 0.2, spot.z);
    scene.add(tip);
    spires.push(spire);
    decor.push({ kind: 'spire', x: spot.x, z: spot.z });
  }

  // --- а) stalactite (сталактиты с потолка, статика) ---
  const stalactiteGeo = new THREE.ConeGeometry(0.3, 1.8, 5);
  const stalactiteItems = placeDecor(rnd, usePath, perches, 'stalactite', stalactiteGeo, rockMat, 12, {
    scene, decor, minR: 9, maxR: 19, clearance: 4.5,
    y: () => 6.5 + rnd() * 2,
    rotation: (m) => {
      m.rotation.x = Math.PI;
      m.rotation.y = rnd() * Math.PI * 2;
    },
    scale: (m) => {
      const sXZ = 0.8 + rnd() * 0.5;
      m.scale.set(sXZ, 0.7 + rnd() * 0.9, sXZ);
    },
  });
  const stalactites = stalactiteItems.map(it => it.mesh);

  // --- б) crystal_cluster (кристальные гроздья, акцент темы) ---
  const crystalGeo = new THREE.OctahedronGeometry(0.3, 0);
  const crystalClusterItems = placeDecor(rnd, usePath, perches, 'crystal_cluster', null, null, 6, {
    scene, decor, minR: 9, maxR: 18, clearance: 5.0, perchClearance: 2.2,
    create: (spot) => {
      const g = new THREE.Group();
      const numCrystals = 3 + Math.floor(rnd() * 3);
      for (let c = 0; c < numCrystals; c++) {
        const m = new THREE.Mesh(crystalGeo, druzeMat);
        const ang = (c / numCrystals) * Math.PI * 2 + rnd() * 0.5;
        const rad = 0.15 + rnd() * 0.2;
        m.position.set(Math.cos(ang) * rad, (rnd() - 0.2) * 0.15, Math.sin(ang) * rad);
        const s = (0.2 + rnd() * 0.2) / 0.3;
        m.scale.set(s * (0.8 + rnd() * 0.4), s * (1.1 + rnd() * 0.7), s * (0.8 + rnd() * 0.4));
        m.rotation.set((rnd() - 0.5) * 0.5, rnd() * Math.PI, (rnd() - 0.5) * 0.5);
        g.add(m);
      }
      g.position.set(spot.x, FLOOR_Y + 0.4, spot.z);
      g.rotation.y = rnd() * Math.PI * 2;
      return g;
    },
  });
  const crystalClusters = crystalClusterItems.map(it => it.mesh);

  // --- в) ore (светящаяся руда в полу) ---
  const oreGeo = new THREE.OctahedronGeometry(0.12, 0);
  const oreAccent = theme.accent ?? 0x66e0ff;
  const oreMat = new THREE.MeshStandardMaterial({
    color: oreAccent, roughness: 0.4, metalness: 0.5,
    emissive: new THREE.Color(oreAccent), emissiveIntensity: 0.8,
  });
  const oreItems = placeDecor(rnd, usePath, perches, 'ore', null, null, 6, {
    scene, decor, minR: 4, maxR: 12, clearance: 3.2,
    create: (spot) => {
      const g = new THREE.Group();
      const numOres = 3 + Math.floor(rnd() * 3);
      for (let o = 0; o < numOres; o++) {
        const m = new THREE.Mesh(oreGeo, oreMat);
        const ang = (o / numOres) * Math.PI * 2 + rnd() * 0.4;
        const rad = 0.1 + rnd() * 0.15;
        m.position.set(Math.cos(ang) * rad, rnd() * 0.08, Math.sin(ang) * rad);
        m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
        m.scale.setScalar(0.7 + rnd() * 0.6);
        g.add(m);
      }
      g.position.set(spot.x, FLOOR_Y + 0.15, spot.z);
      g.rotation.y = rnd() * Math.PI * 2;
      return g;
    },
  });
  const ores = oreItems.map(it => it.mesh);

  // --- г) roots (корни по стенам, статика) ---
  const rootGeo = new THREE.CylinderGeometry(0.1, 0.06, 2.4, 5);
  const rootMat = new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.95 });
  const rootItems = placeDecor(rnd, usePath, perches, 'roots', null, null, 6, {
    scene, decor, minR: 13, maxR: 22, clearance: 6.0, perchClearance: 2.5,
    create: (spot) => {
      const g = new THREE.Group();
      const numRoots = 2 + Math.floor(rnd() * 2);
      for (let r = 0; r < numRoots; r++) {
        const m = new THREE.Mesh(rootGeo, rootMat);
        m.position.set((rnd() - 0.5) * 0.4, 0, (rnd() - 0.5) * 0.4);
        m.rotation.set((rnd() - 0.5) * 0.5 + 0.35, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.5);
        m.scale.set(0.8 + rnd() * 0.4, 0.8 + rnd() * 0.5, 0.8 + rnd() * 0.4);
        g.add(m);
      }
      g.position.set(spot.x, 1.5 + rnd() * 2, spot.z);
      g.rotation.set((rnd() - 0.5) * 0.4, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.4);
      return g;
    },
  });
  const rootsList = rootItems.map(it => it.mesh);

  // --- д) bone_pile (останки тварей, статика) ---
  const boneRibGeo = new THREE.TorusGeometry(0.35, 0.06, 4, 7, Math.PI * 0.7);
  const boneSkullGeo = new THREE.DodecahedronGeometry(0.16, 0);
  const boneMat = new THREE.MeshStandardMaterial({ color: 0xc2b896, roughness: 0.85 });
  const bonePileItems = placeDecor(rnd, usePath, perches, 'bone_pile', null, null, 4, {
    scene, decor, minR: 7.5, maxR: 17, clearance: 4.5, perchClearance: 2.0,
    create: (spot) => {
      const g = new THREE.Group();
      const numRibs = 3 + Math.floor(rnd() * 2);
      for (let k = 0; k < numRibs; k++) {
        const rib = new THREE.Mesh(boneRibGeo, boneMat);
        rib.position.set((k - (numRibs - 1) / 2) * 0.16, 0.1, (rnd() - 0.5) * 0.08);
        rib.rotation.set(Math.PI / 2 + (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.3);
        rib.scale.setScalar(0.85 + rnd() * 0.3);
        g.add(rib);
      }
      const skull = new THREE.Mesh(boneSkullGeo, boneMat);
      skull.position.set(0.32, 0.1, (rnd() - 0.5) * 0.1);
      skull.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      g.add(skull);
      g.position.set(spot.x, FLOOR_Y + 0.15, spot.z);
      g.rotation.y = rnd() * Math.PI * 2;
      return g;
    },
  });
  const bonePiles = bonePileItems.map(it => it.mesh);

  // --- е) stone_arch (каменная арка на дальнем плане, статика) ---
  const archTopGeo = new THREE.TorusGeometry(2.2, 0.5, 5, 9, Math.PI);
  const archPillarGeo = new THREE.CylinderGeometry(0.3, 0.4, 2.2, 6);
  const stoneArchItems = placeDecor(rnd, usePath, perches, 'stone_arch', null, null, 2, {
    scene, decor, minR: 15, maxR: 23, clearance: 7.5, perchClearance: 3.0,
    create: (spot) => {
      const g = new THREE.Group();
      const top = new THREE.Mesh(archTopGeo, rockMat);
      top.position.set(0, 1.1, 0);
      const left = new THREE.Mesh(archPillarGeo, rockMat);
      left.position.set(-2.2, 0, 0);
      const right = new THREE.Mesh(archPillarGeo, rockMat);
      right.position.set(2.2, 0, 0);
      g.add(top, left, right);
      g.position.set(spot.x, FLOOR_Y + 1.1, spot.z);
      g.rotation.y = rnd() * Math.PI * 2;
      g.scale.setScalar(0.85 + rnd() * 0.3);
      return g;
    },
  });
  const stoneArches = stoneArchItems.map(it => it.mesh);

  // --- ж) spore_cloud (дрейфующее споровое облако) ---
  const sporeAccent = typeof theme.accent === 'string'
    ? theme.accent
    : (theme.accent ? `#${theme.accent.toString(16).padStart(6, '0')}` : '#66e0ff');
  const sporeTex = glowTexture(sporeAccent, 'rgba(200,255,240,0.35)');
  const sporeMat = new THREE.SpriteMaterial({
    map: sporeTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.3,
  });
  const sporeCloudItems = placeDecor(rnd, usePath, perches, 'spore_cloud', null, null, 5, {
    scene, decor, minR: 5, maxR: 15, clearance: 3.5,
    create: (spot, idx) => {
      const spr = new THREE.Sprite(sporeMat);
      const y = 1.4 + rnd() * 1.6;
      spr.position.set(spot.x, y, spot.z);
      spr.scale.setScalar(1.6 + rnd() * 0.8);
      spr.userData = { bx: spot.x, bz: spot.z, by: y, phase: idx };
      return spr;
    },
  });
  const sporeClouds = sporeCloudItems.map(it => it.mesh);

  // --- кристалл ---
  const crystalGroup = new THREE.Group();
  crystalGroup.position.copy(CRYSTAL.pos);
  const crystalTex = crystalTexture(3);
  const crystalColor = theme.accent ?? 0x66e0ff;
  const outer = new THREE.Mesh(new THREE.OctahedronGeometry(CRYSTAL.radius, 0), new THREE.MeshStandardMaterial({
    map: crystalTex, roughness: 0.25, metalness: 0.35, emissive: 0x0a3a5a, emissiveIntensity: 0.6,
  }));
  const inner = new THREE.Mesh(new THREE.OctahedronGeometry(CRYSTAL.radius * 0.55, 0), new THREE.MeshBasicMaterial({
    color: 0x7ae8ff, transparent: true, opacity: 0.85,
  }));
  crystalGroup.add(outer, inner);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('#2a9acc', 'rgba(160,240,255,0.9)'),
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  glow.scale.setScalar(9);
  crystalGroup.add(glow);
  const pointLight = new THREE.PointLight(crystalColor, 800, 24, 2);
  crystalGroup.add(pointLight);
  scene.add(crystalGroup);

  // --- вход пещеры ---
  const entranceGroup = new THREE.Group();
  entranceGroup.position.copy(ENTRANCE);
  const portal = new THREE.Mesh(
    new THREE.TorusGeometry(1.1, 0.14, 10, 24),
    new THREE.MeshBasicMaterial({ color: theme.portal ?? 0x8a5aff, transparent: true, opacity: 0.7 })
  );
  portal.rotation.x = Math.PI / 2;
  const dark = new THREE.Mesh(
    new THREE.CircleGeometry(1.1, 24),
    new THREE.MeshBasicMaterial({ color: 0x02030a })
  );
  dark.rotation.x = -Math.PI / 2;
  dark.position.z = 0.2;
  const portalGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('#5a2a9a', 'rgba(150,100,255,0.7)'),
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  portalGlow.scale.setScalar(5);
  entranceGroup.add(portal, dark, portalGlow);
  scene.add(entranceGroup);

  // --- огоньки-искры в воздухе (статика, для атмосферы) ---
  const sparkCount = 120;
  const sparkPos = new Float32Array(sparkCount * 3);
  for (let i = 0; i < sparkCount; i++) {
    const ang = rnd() * Math.PI * 2;
    const rad = 3 + rnd() * 14;
    sparkPos[i * 3] = Math.cos(ang) * rad;
    sparkPos[i * 3 + 1] = 0.5 + rnd() * 6;
    sparkPos[i * 3 + 2] = Math.sin(ang) * rad;
  }
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
    color: theme.accent ?? 0xaac8ff, size: 0.07, transparent: true, opacity: 0.55, depthWrite: false,
  }));
  scene.add(sparks);

  return {
    scene,
    crystalGroup, crystalLight: pointLight, outer, inner,
    pool, sparks, torches, torchSprites,
    waterPools, cracks, spires,
    stalactites, crystalClusters, ores, roots: rootsList, bonePiles, stoneArches, sporeClouds,
    decor,
    walls: blobs,
    materials: {
      rockMat, wallGeo, druzeMat, oreMat, rootMat, boneMat, sporeMat,
      stalactiteGeo, crystalGeo, oreGeo, rootGeo, boneRibGeo, boneSkullGeo, archTopGeo, archPillarGeo,
    },
  };
}

// Обновление пульсаций кристалла, света и мерцания факелов (вызывается в цикле).
export function updateCave(cave, time) {
  const s = 1 + Math.sin(time * 2.2) * 0.04;
  cave.crystalGroup.scale.setScalar(s);
  cave.crystalLight.intensity = 950 + Math.sin(time * 2.2) * 300;
  cave.inner.rotation.y = time * 0.3;
  cave.inner.rotation.x = Math.sin(time * 0.4) * 0.3;
  if (cave.torches) {
    cave.torches.forEach((l, i) => {
      l.intensity = 230 + Math.sin(time * 7 + i * 1.7) * 45 + Math.sin(time * 13.1 + i * 2.9) * 25;
    });
  }
  if (cave.torchSprites) {
    cave.torchSprites.forEach((spr, i) => {
      const k = 1 + Math.sin(time * 7 + i * 1.7) * 0.06;
      spr.scale.setScalar(1.1 * k);
    });
  }
  // вода/лава: лёгкая рябь прозрачности и свечения
  if (cave.waterPools) {
    cave.waterPools.forEach((m, i) => {
      m.material.opacity = 0.8 + Math.sin(time * 1.3 + i * 2.1) * 0.08;
      m.material.emissiveIntensity = 0.25 + Math.sin(time * 1.7 + i) * 0.12;
    });
  }
  // лавовые трещины: пульс раскалённости
  if (cave.cracks) {
    cave.cracks.forEach((m, i) => {
      m.material.emissiveIntensity = 0.75 + Math.sin(time * 3 + i * 1.3) * 0.3;
    });
  }
  // кристальные гроздья: плавная пульсация свечения
  if (cave.crystalClusters) {
    const dMat = cave.materials?.druzeMat ?? cave.crystalClusters[0]?.children?.[0]?.material;
    if (dMat) {
      dMat.emissiveIntensity = 0.6 + Math.sin(time * 1.8) * 0.25;
    }
  }
  // светящаяся руда: пульсация интенсивности
  if (cave.ores) {
    const oMat = cave.materials?.oreMat ?? cave.ores[0]?.children?.[0]?.material;
    if (oMat) {
      oMat.emissiveIntensity = 0.7 + Math.sin(time * 2.0) * 0.35;
    }
  }
  // споровые облака: дрейф по XZ и пульсация прозрачности
  if (cave.sporeClouds) {
    cave.sporeClouds.forEach((spr, i) => {
      const u = spr.userData;
      if (u) {
        spr.position.x = u.bx + Math.sin(time * 0.5 + i) * 0.4;
        spr.position.z = u.bz + Math.cos(time * 0.4 + i * 1.1) * 0.3;
      }
    });
    const sMat = cave.materials?.sporeMat ?? cave.sporeClouds[0]?.material;
    if (sMat) {
      sMat.opacity = 0.2 + Math.sin(time * 0.7) * 0.1;
    }
  }
}

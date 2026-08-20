// Башни-стражи: летучие мыши. Стрельба, эффект стаи, апгрейды, альфа-формы.
import * as THREE from 'three';

import { TOWER_TYPES, towerStats, upgradeCost, pickTarget, flockBonus, MAX_LEVEL } from '../core/towers.js';
import { EFFECT_DEFS } from '../core/enemies.js';
import { wingTexture, glowTexture, shadowTexture } from '../world/textures.js';

import { Projectile, PulseRing } from './projectile.js';

const wingCache = new Map();
function wings(color, scale) {
  if (!wingCache.has(color)) {wingCache.set(color, wingTexture(color));}
  const tex = wingCache.get(color);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
  const g = new THREE.Group();
  for (const side of [-1, 1]) {
    const geo = new THREE.PlaneGeometry(1.1, 0.55, 1, 1);
    geo.translate(-0.55 * side, 0, 0);
    const w = new THREE.Mesh(geo, mat);
    w.position.x = side * 0.34;
    w.rotation.y = side * 1.0;
    g.add(w);
  }
  g.scale.setScalar(scale);
  return g;
}

const geoCache = new Map();
function getSharedGeo(key, factory) {
  if (!geoCache.has(key)) {
    const geo = factory();
    geo.dispose = () => {}; // Защита от случайного dispose() при traverse()
    geoCache.set(key, geo);
  }
  return geoCache.get(key);
}

const baseMat = new THREE.MeshStandardMaterial({ color: 0x4a4a5e, roughness: 0.9 });
baseMat.dispose = () => {};

let shadowTex = null;

export function buildTowerMesh(typeId, level, isAlpha = false) {
  const def = TOWER_TYPES[typeId];
  const color = isAlpha ? def.alpha.color : def.color;
  const glow = isAlpha ? def.alpha.glow : def.glow;
  const s = isAlpha ? 1.28 : 1;

  const g = new THREE.Group();

  // 1. Тело мыши-стража
  const bodyGeo = getSharedGeo('body', () => new THREE.SphereGeometry(0.24, 8, 6));
  const bodyMat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.5,
    metalness: 0.15,
    emissive: new THREE.Color(color).multiplyScalar(0.25),
    emissiveIntensity: 0.5,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.scale.set(0.9, 0.85, 1.3);
  g.add(body);

  // 2. Каменная подставка-постамент
  const baseGeo = getSharedGeo('base', () => new THREE.CylinderGeometry(0.2, 0.3, 0.12, 8));
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.y = -0.24;
  g.add(base);

  // 3. Крылья
  const wingG = wings(color, s);
  g.add(wingG);

  // 4. Уши спереди
  const earGeo = getSharedGeo('ear', () => new THREE.ConeGeometry(0.05, 0.14, 5));
  const earMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color).multiplyScalar(0.6),
    roughness: 0.6,
  });
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(earGeo, earMat);
    ear.position.set(side * 0.09, 0.2, 0.16);
    ear.rotation.x = 0.2;
    ear.rotation.z = side * 0.35;
    g.add(ear);
  }

  // 5. Глаза спереди (+Z)
  const eyeGeo = getSharedGeo('eye', () => new THREE.SphereGeometry(0.045, 6, 6));
  const eyeMat = new THREE.MeshBasicMaterial({ color: glow });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(side * 0.1, 0.03, 0.22);
    g.add(eye);
  }
  // 5b. Свечение вокруг глаз (точечный свет-спрайт)
  const eyeGlowTex = glowTexture(glow, '#ffffff');
  const eyeGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: eyeGlowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5,
  }));
  eyeGlow.position.set(0, 0.03, 0.25);
  eyeGlow.scale.setScalar(0.35);
  eyeGlow.userData.pickable = false;
  g.add(eyeGlow);

  // Печать Ордена над постаментом (символ Стражей Кристалла) — общее для всех башен
  const sealGeo = getSharedGeo('sealOcta', () => new THREE.OctahedronGeometry(0.05, 0));
  const sealMat = new THREE.MeshBasicMaterial({ color: '#8ff0ff' });
  const sealMesh = new THREE.Mesh(sealGeo, sealMat);
  sealMesh.position.set(0, -0.15, 0.20);
  sealMesh.userData.pickable = false;

  const sealGlowTex = glowTexture('#8ff0ff', '#ffffff');
  const sealGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sealGlowTex,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 0.3,
  }));
  sealGlow.position.set(0, -0.15, 0.21);
  sealGlow.scale.setScalar(0.22);
  sealGlow.userData.pickable = false;
  sealMesh.userData.glow = sealGlow;

  g.add(sealMesh);
  g.add(sealGlow);
  const seal = sealMesh;

  // Массивы и хуки для userData
  const spinRings = [];
  const orbitOrbs = [];
  let horn = null;
  let crystals = [];
  let cap = null;
  let gem = null;
  let flames = [];
  let lantern = null;
  let collar = null;
  let fangs = [];
  let eyeGlowSprite = eyeGlow;

  // Дополнительные лорные хуки
  const membranes = [];
  let hornGlow = null;
  let frostBreath = null;
  const sporeMotes = [];
  const echoRunes = [];
  let gemGlow = null;
  const embers = [];
  let coalGlow = null;
  let beam = null;
  let ruby = null;

  // ---- ТИПОВЫЕ МОДЕЛИ И СИГНАТУРНЫЕ СИЛУЭТЫ ----
  if (typeId === 'screamer') {
    // Визгун (красный): 2 сонарных уха-воронки по бокам, сонарный рупор на +Z, резонаторные дуги сзади (-Z)
    const funnelMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.75), roughness: 0.4 });
    const funnelGeo = getSharedGeo('screamerFunnel', () => new THREE.ConeGeometry(0.08, 0.18, 6, 1, true));
    const membraneGeo = getSharedGeo('screamerMembrane', () => new THREE.CircleGeometry(0.065, 8));
    const membraneMat = new THREE.MeshBasicMaterial({
      color: glow,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    for (const side of [-1, 1]) {
      const fn = new THREE.Mesh(funnelGeo, funnelMat);
      fn.position.set(side * 0.16, 0.22, 0.08);
      fn.rotation.z = side * 0.5;
      fn.rotation.x = -0.3;
      g.add(fn);

      // Мембраны внутри воронок-ушей
      const memb = new THREE.Mesh(membraneGeo, membraneMat);
      memb.position.set(side * 0.16, 0.26, 0.07);
      memb.rotation.z = side * 0.5;
      memb.rotation.x = -0.3 + Math.PI / 2;
      memb.userData.pickable = false;
      g.add(memb);
      membranes.push(memb);
    }
    // Сонарный рупор на +Z (перед мордой)
    const hornGroup = new THREE.Group();
    hornGroup.position.set(0, 0.02, 0.28);
    const torusHornGeo = getSharedGeo('torusHorn', () => new THREE.TorusGeometry(0.07, 0.016, 6, 14));
    const hornMesh = new THREE.Mesh(torusHornGeo, new THREE.MeshBasicMaterial({ color: glow }));
    hornGroup.add(hornMesh);
    const coneCoreGeo = getSharedGeo('coneCore', () => new THREE.ConeGeometry(0.04, 0.1, 6));
    const coneCore = new THREE.Mesh(coneCoreGeo, new THREE.MeshBasicMaterial({ color }));
    coneCore.rotation.x = Math.PI / 2;
    hornGroup.add(coneCore);

    // Glow-спрайт на срезе рупора
    const hornGlowTex = glowTexture(glow, '#ffffff');
    const hornSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: hornGlowTex,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.55,
    }));
    hornSprite.position.set(0, 0, 0.06);
    hornSprite.scale.setScalar(0.28);
    hornSprite.userData.pickable = false;
    hornGroup.add(hornSprite);
    hornGlow = hornSprite;

    g.add(hornGroup);
    horn = hornGroup;

    // Резонаторные дуги за спиной (-Z)
    const arcCount = level + (isAlpha ? 1 : 0);
    const arcMat = new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.7 });
    for (let i = 0; i < arcCount; i++) {
      const arcGeo = getSharedGeo(`arc_${i}`, () => new THREE.TorusGeometry(0.12 + i * 0.06, 0.012, 6, 16));
      const ring = new THREE.Mesh(arcGeo, arcMat);
      ring.position.set(0, 0.05 + i * 0.04, -0.1 - i * 0.05);
      ring.rotation.x = Math.PI / 3;
      ring.userData.pickable = false;
      g.add(ring);
      spinRings.push(ring);
    }
  } else if (typeId === 'frost') {
    // Иней (ледяной голубой): гряда полупрозрачных кристаллов на спине (-Z)
    const octGeo = getSharedGeo('octa', () => new THREE.OctahedronGeometry(0.1, 0));
    const iceMat = new THREE.MeshStandardMaterial({
      color: glow,
      roughness: 0.1,
      metalness: 0.1,
      transparent: true,
      opacity: 0.85,
      emissive: new THREE.Color(glow).multiplyScalar(0.4),
    });
    const count = level + 1 + (isAlpha ? 1 : 0); // L1: 2, L2: 3, L3: 4
    for (let i = 0; i < count; i++) {
      const oct = new THREE.Mesh(octGeo, iceMat);
      const scaleY = 1.2 + (i % 2) * 0.4;
      oct.scale.set(0.7, scaleY, 0.7);
      const offsetX = (i - (count - 1) / 2) * 0.08;
      oct.position.set(offsetX, 0.28 + (i % 2) * 0.04, -0.08 - Math.abs(offsetX) * 0.3);
      oct.rotation.x = -0.3;
      oct.rotation.z = offsetX * -0.8;
      g.add(oct);
      crystals.push(oct);
    }
    // Бахрома сосулек под брюхом (4 конуса вниз)
    const icicleGeo = getSharedGeo('frostIcicle', () => new THREE.ConeGeometry(0.025, 0.12, 4));
    const icicleMat = iceMat.clone();
    for (let i = 0; i < 4; i++) {
      const icicle = new THREE.Mesh(icicleGeo, icicleMat);
      const offsetX = (i - 1.5) * 0.07;
      icicle.position.set(offsetX, -0.18, 0.02 - Math.abs(offsetX) * 0.2);
      icicle.rotation.x = Math.PI;
      icicle.scale.set(0.8, 0.8 + (i % 2) * 0.4, 0.8);
      icicle.userData.pickable = false;
      g.add(icicle);
    }
    // Ледяные края крыльев
    const wingIceMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8 });
    const spikeGeo = getSharedGeo('coneSpike', () => new THREE.ConeGeometry(0.04, 0.2, 5));
    for (const side of [-1, 1]) {
      const spk = new THREE.Mesh(spikeGeo, wingIceMat);
      spk.position.set(side * 0.26, 0.12, 0.02);
      spk.scale.set(0.6, 0.7, 0.6);
      spk.rotation.z = side * -0.6;
      spk.userData.pickable = false;
      g.add(spk);
    }
    // Морозное дыхание впереди (+Z)
    const breathTex = glowTexture(glow, '#ffffff');
    const breathSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: breathTex,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.15,
    }));
    breathSprite.position.set(0, -0.02, 0.36);
    breathSprite.scale.setScalar(0.38);
    breathSprite.userData.pickable = false;
    g.add(breathSprite);
    frostBreath = breathSprite;
  } else if (typeId === 'spore') {
    // Спора (ядовито-зелёный): грибная шляпка на голове, мицелий, мини-грибки на плечах
    const capGroup = new THREE.Group();
    capGroup.position.set(0, 0.28, 0.02);
    const capMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
    const mainCapGeo = getSharedGeo('sporeCap', () => new THREE.SphereGeometry(0.14, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2));
    const capMesh = new THREE.Mesh(mainCapGeo, capMat);
    capGroup.add(capMesh);
    // Споры на шляпке
    const spotMat = new THREE.MeshBasicMaterial({ color: glow });
    for (let i = 0; i < 5; i++) {
      const spot = new THREE.Mesh(eyeGeo, spotMat);
      spot.scale.setScalar(0.6);
      const angle = (i / 5) * Math.PI * 2;
      spot.position.set(Math.cos(angle) * 0.08, 0.06, Math.sin(angle) * 0.08);
      capGroup.add(spot);
    }
    // Гименофор под шляпкой (кольцо из 6 мини-конусов, тёмно-зелёный)
    const hymenMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).multiplyScalar(0.35),
      roughness: 0.8,
    });
    const hymenGeo = getSharedGeo('sporeHymen', () => new THREE.ConeGeometry(0.02, 0.05, 4));
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const hc = new THREE.Mesh(hymenGeo, hymenMat);
      hc.position.set(Math.cos(angle) * 0.09, -0.01, Math.sin(angle) * 0.09);
      hc.rotation.x = Math.PI;
      hc.userData.pickable = false;
      capGroup.add(hc);
    }

    g.add(capGroup);
    cap = capGroup;

    // 3 парящие споринки вокруг шляпки
    const moteGeo = getSharedGeo('sporeMote', () => new THREE.SphereGeometry(0.025, 5, 5));
    const moteMat = new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 3; i++) {
      const mote = new THREE.Mesh(moteGeo, moteMat);
      mote.position.set(0, 0.28, 0.02);
      mote.userData.pickable = false;
      g.add(mote);
      sporeMotes.push(mote);
    }

    // Мини-грибки по бокам (L2: +1, L3: +2)
    const miniMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.85), roughness: 0.6 });
    const miniGeo = getSharedGeo('miniCap', () => new THREE.SphereGeometry(0.06, 6, 5, 0, Math.PI * 2, 0, Math.PI / 2));
    const miniCount = level - 1 + (isAlpha ? 1 : 0);
    for (let i = 0; i < miniCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const m = new THREE.Mesh(miniGeo, miniMat);
      m.position.set(side * 0.16, 0.16 + i * 0.06, -0.05);
      m.rotation.z = side * 0.4;
      g.add(m);
    }
  } else if (typeId === 'echo') {
    // Эхо (аметистовый): аметистовый кристалл на груди (+Z), парящие сонарные кольца
    const gemMat = new THREE.MeshStandardMaterial({
      color: glow,
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.6,
      roughness: 0.2,
      metalness: 0.3,
    });
    const octGeo = getSharedGeo('octa', () => new THREE.OctahedronGeometry(0.1, 0));
    gem = new THREE.Mesh(octGeo, gemMat);
    gem.scale.set(0.8, 1.3, 0.8);
    gem.position.set(0, 0.05, 0.22);
    g.add(gem);

    // Glow-спрайт у кристалла
    const gemGlowTex = glowTexture(glow, '#ffffff');
    const gemGlowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: gemGlowTex,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.5,
    }));
    gemGlowSprite.position.set(0, 0.05, 0.24);
    gemGlowSprite.scale.setScalar(0.35);
    gemGlowSprite.userData.pickable = false;
    g.add(gemGlowSprite);
    gemGlow = gemGlowSprite;

    // 4 парящие руны-тетраэдра вокруг кристалла
    const runeGeo = getSharedGeo('echoRune', () => new THREE.TetrahedronGeometry(0.032, 0));
    const runeMat = new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 4; i++) {
      const rune = new THREE.Mesh(runeGeo, runeMat);
      rune.userData.pickable = false;
      g.add(rune);
      echoRunes.push(rune);
    }

    // Парящие сонарные кольца (L1: 1, L2: 2, L3: 3)
    const ringCount = level + (isAlpha ? 1 : 0);
    for (let i = 0; i < ringCount; i++) {
      const ringMat = new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.85 - i * 0.15 });
      const ringGeo = getSharedGeo(`echoRing_${i}`, () => new THREE.TorusGeometry(0.32 + i * 0.08, 0.012, 5, 20));
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2 + i * 0.4;
      ring.rotation.y = i * 0.5;
      ring.position.y = 0.05;
      ring.userData.pickable = false;
      g.add(ring);
      spinRings.push(ring);
    }
  } else if (typeId === 'fire') {
    // Жар (огненный оранжевый): зубчатая корона пламени на спине (-Z), пылающий уголь на груди
    const spikeGeo = getSharedGeo('coneSpike', () => new THREE.ConeGeometry(0.04, 0.2, 5));
    const flameMat = new THREE.MeshBasicMaterial({ color: glow });
    const count = level + 1 + (isAlpha ? 2 : 0); // L1: 2, L2: 3, L3: 4
    for (let i = 0; i < count; i++) {
      const flame = new THREE.Mesh(spikeGeo, flameMat);
      const offsetX = (i - (count - 1) / 2) * 0.09;
      flame.position.set(offsetX, 0.26 + (1 - Math.abs(offsetX)) * 0.06, -0.08 - Math.abs(offsetX) * 0.04);
      flame.scale.set(0.9, 1.2 + (i % 2) * 0.3, 0.9);
      flame.rotation.x = -0.4;
      flame.rotation.z = offsetX * -0.5;
      flame.userData.pickable = false;
      g.add(flame);
      flames.push(flame);
    }
    // Пылающий уголь на груди (+Z)
    const coalMat = new THREE.MeshStandardMaterial({
      color: '#ff3300',
      emissive: '#ff7700',
      emissiveIntensity: 0.8,
      roughness: 0.3,
    });
    const octSmallGeo = getSharedGeo('octaSmall', () => new THREE.OctahedronGeometry(0.07, 0));
    const ember = new THREE.Mesh(octSmallGeo, coalMat);
    ember.position.set(0, 0.04, 0.22);
    g.add(ember);

    // Пульсирующий glow-спрайт угля на груди
    const coalGlowTex = glowTexture('#ff5500', '#ffffff');
    const coalGlowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: coalGlowTex,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.55,
    }));
    coalGlowSprite.position.set(0, 0.04, 0.24);
    coalGlowSprite.scale.setScalar(0.32);
    coalGlowSprite.userData.pickable = false;
    g.add(coalGlowSprite);
    coalGlow = coalGlowSprite;

    // 3 искры-спрайта над пламенем
    const sparkTex = glowTexture('#ffaa22', '#ffffff');
    for (let i = 0; i < 3; i++) {
      const spark = new THREE.Sprite(new THREE.SpriteMaterial({
        map: sparkTex,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.8,
      }));
      spark.scale.setScalar(0.09);
      spark.userData.pickable = false;
      spark.userData.baseX = (i - 1) * 0.07;
      g.add(spark);
      embers.push(spark);
    }
  } else if (typeId === 'lantern') {
    // Фонарь (золотисто-янтарный): фонарь-кристалл на переднем роге (+Z), орбитальные огоньки
    const rodGeo = getSharedGeo('lanternRod', () => new THREE.CylinderGeometry(0.02, 0.03, 0.22, 6));
    const hornRod = new THREE.Mesh(rodGeo, new THREE.MeshStandardMaterial({ color: 0x554433, roughness: 0.6 }));
    hornRod.position.set(0, 0.22, 0.18);
    hornRod.rotation.x = 0.6;
    g.add(hornRod);

    const lanternGroup = new THREE.Group();
    lanternGroup.position.set(0, 0.3, 0.28);
    const octGeo = getSharedGeo('octa', () => new THREE.OctahedronGeometry(0.1, 0));
    const lanternMat = new THREE.MeshBasicMaterial({ color: '#fff6c8' });
    const lanternMesh = new THREE.Mesh(octGeo, lanternMat);
    lanternMesh.scale.setScalar(0.9);
    lanternGroup.add(lanternMesh);

    const cageGeo = getSharedGeo('torusHorn', () => new THREE.TorusGeometry(0.07, 0.016, 6, 14));
    const cageMat = new THREE.MeshStandardMaterial({ color: 0x886622, roughness: 0.4, metalness: 0.6 });
    const cage = new THREE.Mesh(cageGeo, cageMat);
    cage.rotation.x = Math.PI / 2;
    lanternGroup.add(cage);
    g.add(lanternGroup);
    lantern = lanternGroup;

    // Луч света из фонаря вниз-вперёд (+Z, открытый конус с аддитивным сиянием)
    const beamGeo = getSharedGeo('lanternBeam', () => {
      const cone = new THREE.ConeGeometry(0.16, 0.5, 10, 1, true);
      cone.translate(0, -0.25, 0);
      return cone;
    });
    const beamMat = new THREE.MeshBasicMaterial({
      color: '#fff0a0',
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const beamMesh = new THREE.Mesh(beamGeo, beamMat);
    beamMesh.position.set(0, 0.28, 0.28);
    beamMesh.rotation.x = -1.1; // наклон вниз-вперёд на +Z
    beamMesh.userData.pickable = false;

    // 2 пылинки внутри луча света
    const dustTex = glowTexture('#fff6c8', '#ffffff');
    const motes = [];
    for (let i = 0; i < 2; i++) {
      const dust = new THREE.Sprite(new THREE.SpriteMaterial({
        map: dustTex,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.35,
      }));
      dust.scale.setScalar(0.08);
      dust.userData.pickable = false;
      g.add(dust);
      motes.push(dust);
    }
    beamMesh.userData.motes = motes;
    g.add(beamMesh);
    beam = beamMesh;

    // Орбитальные огоньки (L1: 1, L2: 2, L3: 3)
    const orbCount = level + (isAlpha ? 1 : 0);
    const orbMat = new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.9 });
    for (let i = 0; i < orbCount; i++) {
      const orb = new THREE.Mesh(eyeGeo, orbMat);
      orb.position.set(0.18, 0.32, 0);
      orb.userData.pickable = false;
      g.add(orb);
      orbitOrbs.push(orb);
    }
  } else if (typeId === 'vampire') {
    // Вампир (багровый): высокий воротник-плащ сзади (-Z), кинжальные клыки (+Z)
    const collarMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).multiplyScalar(0.4),
      roughness: 0.7,
      side: THREE.DoubleSide,
    });
    const collarHeight = 0.22 + level * 0.05;
    const collarGeo = getSharedGeo(`vampCollar_${level}`, () => new THREE.CylinderGeometry(0.2, 0.12, collarHeight, 8, 1, true, -Math.PI * 0.65, Math.PI * 1.3));
    collar = new THREE.Mesh(collarGeo, collarMat);
    collar.position.set(0, 0.16 + collarHeight * 0.4, -0.08);
    collar.rotation.x = -0.2;
    g.add(collar);

    // Изморозь-иней на воротнике (3 белых полупрозрачных конуса по кромке)
    const rimeGeo = getSharedGeo('vampCollarRime', () => new THREE.ConeGeometry(0.02, 0.08, 4));
    const rimeMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.65 });
    for (let i = 0; i < 3; i++) {
      const rime = new THREE.Mesh(rimeGeo, rimeMat);
      const side = (i - 1) * 0.11;
      rime.position.set(side, 0.16 + collarHeight * 0.85, -0.1 - (1 - Math.abs(i - 1)) * 0.04);
      rime.rotation.x = -0.3;
      rime.userData.pickable = false;
      g.add(rime);
    }

    // Костяные шипы на воротнике (L2: +2, L3: +4)
    const fangGeo = getSharedGeo('fang', () => new THREE.ConeGeometry(0.025, 0.13, 4));
    if (level >= 2 || isAlpha) {
      const boneMat = new THREE.MeshStandardMaterial({ color: 0xe0d6c8, roughness: 0.3 });
      const boneCount = (level - 1) * 2 + (isAlpha ? 2 : 0);
      for (let i = 0; i < boneCount; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const idx = Math.floor(i / 2);
        const spk = new THREE.Mesh(fangGeo, boneMat);
        spk.position.set(side * (0.12 + idx * 0.05), 0.28 + idx * 0.08, -0.14);
        spk.rotation.z = side * -0.4;
        spk.rotation.x = -0.5;
        spk.userData.pickable = false;
        g.add(spk);
      }
    }

    // Кинжальные клыки спереди (+Z)
    const fangMat = new THREE.MeshStandardMaterial({ color: 0xf5efe6, roughness: 0.2 });
    for (const side of [-1, 1]) {
      const fang = new THREE.Mesh(fangGeo, fangMat);
      fang.position.set(side * 0.06, -0.02, 0.24);
      fang.rotation.x = -0.5;
      g.add(fang);
      fangs.push(fang);
    }

    // Рубин на лбу (+Z, октаэдр 0.03, #ff2244) + glow
    const rubyGeo = getSharedGeo('vampRuby', () => new THREE.OctahedronGeometry(0.03, 0));
    const rubyMat = new THREE.MeshBasicMaterial({ color: '#ff2244' });
    const rubyMesh = new THREE.Mesh(rubyGeo, rubyMat);
    rubyMesh.position.set(0, 0.12, 0.24);
    rubyMesh.userData.pickable = false;

    const rubyGlowTex = glowTexture('#ff2244', '#ffffff');
    const rubyGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: rubyGlowTex,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.6,
    }));
    rubyGlow.position.set(0, 0.12, 0.25);
    rubyGlow.scale.setScalar(0.18);
    rubyGlow.userData.pickable = false;
    rubyMesh.userData.glow = rubyGlow;

    g.add(rubyMesh);
    g.add(rubyGlow);
    ruby = rubyMesh;
  }

  // Пипсы уровня (3 шт)
  const pipGeo = getSharedGeo('pip', () => new THREE.SphereGeometry(0.055, 6, 6));
  const pips = [];
  for (let i = 0; i < MAX_LEVEL; i++) {
    const pip = new THREE.Mesh(pipGeo, new THREE.MeshBasicMaterial({ color: 0x334455 }));
    pip.position.set((i - 1) * 0.15, 0.37, 0);
    g.add(pip);
    pips.push(pip);
  }
  setPips(pips, level, glow);

  // Аура альфы
  let aura = null;
  if (isAlpha) {
    const crownGeo = getSharedGeo('crown', () => new THREE.TorusGeometry(0.28, 0.03, 6, 18));
    const crown = new THREE.Mesh(crownGeo, new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.9 }));
    crown.rotation.x = Math.PI / 2;
    crown.position.y = 0.32;
    crown.userData.pickable = false;
    g.add(crown);

    aura = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(glow, '#ffffff'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.35,
    }));
    aura.scale.setScalar(1.9);
    aura.userData.pickable = false; // декор — не перехватывать клики
    g.add(aura);
  }

  g.scale.setScalar(s);
  g.userData = {
    body,
    wings: wingG,
    pips,
    aura,
    glow,
    spinRings,
    orbitOrbs,
    horn,
    crystals,
    cap,
    gem,
    flames,
    lantern,
    collar,
    fangs,
    eyeGlow: eyeGlowSprite,
    seal,
    membranes,
    hornGlow,
    frostBreath,
    sporeMotes,
    echoRunes,
    gemGlow,
    embers,
    coalGlow,
    beam,
    ruby,
  };
  return g;
}

function setPips(pips, level, glowColor) {
  pips.forEach((p, i) => {
    p.material.color.setStyle(i < level ? glowColor : '#334455');
  });
}

export class Tower {
  constructor(typeId, perch, scene) {
    this.typeId = typeId;
    this.perch = perch;
    this.scene = scene;
    this.pos = perch.def.pos.clone();
    this.level = 1;
    this.isAlpha = false;
    this.alive = true;
    this.cooldown = 0;
    this.t = Math.random() * 5;
    const st = TOWER_TYPES[typeId];
    this.spent = st.cost;
    this.stats = towerStats(typeId, 1);
    this.mesh = buildTowerMesh(typeId, 1, false);
    this.mesh.position.copy(this.pos);
    this.mesh.position.y += 0.35;
    scene.add(this.mesh);
    // Экранный бокс для выбора: с ним тап попадает в башню по её ВИДИМОЙ части
    // (включая выступающую над соседями), а не только по проекции центра.
    this.mesh.updateWorldMatrix(true, true); // иначе бокс посчитается в origin
    this.pickBox = new THREE.Box3().setFromObject(this.mesh);
    this.pips = this.mesh.userData.pips;
    this.wingG = this.mesh.userData.wings;
    this.currentTarget = null;

    // тень
    if (!shadowTex) {shadowTex = shadowTexture();}
    this.shadow = new THREE.Sprite(new THREE.SpriteMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    this.shadow.scale.setScalar(0.9);
    this.shadow.position.y = -0.02;
    this.shadow.userData.pickable = false; // декор — не перехватывать клики
    this.mesh.add(this.shadow);
    this.rangeRing = new THREE.Mesh(
      new THREE.CircleGeometry(1, 40),
      new THREE.MeshBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide })
    );
    this.rangeRing.userData.pickable = false; // декор — не перехватывать клики
    this.rangeRing.rotation.x = -Math.PI / 2;
    this.rangeRing.position.y = 0.06;
    this.rangeRing.visible = false;
    this.mesh.add(this.rangeRing);
  }

  get damage() {
    const base = this.stats.damage * (this.isAlpha ? 1 : 1);
    return base;
  }

  effectiveDamage(ctx) {
    let d = this.damage;
    d *= 1 + flockBonus(this.typeId, ctx.towers, this.pos);
    if (ctx.moonTowerMul) {d *= ctx.moonTowerMul;}
    if (ctx.towerDmgMul) {d *= ctx.towerDmgMul;} // прокачка кампании
    return d;
  }

  get range() { return this.stats.range; }
  get rate() { return this.stats.rate; }

  // Скорострельность с учётом прокачки кампании (rateMul > 1 — быстрее).
  getRate(ctx) {
    return this.stats.rate / (ctx.towerRateMul ?? 1);
  }

  showRange(on) {
    this.rangeRing.visible = on;
    this.rangeRing.scale.setScalar(this.range);
  }

  upgrade() {
    if (this.level >= MAX_LEVEL) {return false;}
    const cost = upgradeCost(this.typeId, this.level);
    this.level++;
    this.spent += cost;
    this.stats = towerStats(this.typeId, this.level);
    setPips(this.pips, this.level, TOWER_TYPES[this.typeId].glow);
    return true;
  }

  becomeAlpha() {
    this.isAlpha = true;
    const a = TOWER_TYPES[this.typeId].alpha;
    const old = this.mesh;
    old.removeFromParent();
    old.traverse(o => { if (o.geometry) {o.geometry.dispose();} if (o.material) {o.material.dispose();} });
    this.mesh = buildTowerMesh(this.typeId, this.level, true);
    this.mesh.position.copy(this.pos);
    this.mesh.position.y += 0.35;
    this.scene.add(this.mesh);
    // бокс выбора пересчитываем: модель альфы больше/другая
    this.mesh.updateWorldMatrix(true, true); // иначе бокс посчитается в origin
    this.pickBox = new THREE.Box3().setFromObject(this.mesh);
    this.pips = this.mesh.userData.pips;
    this.wingG = this.mesh.userData.wings;
    this.shadow = new THREE.Sprite(new THREE.SpriteMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    this.shadow.scale.setScalar(0.9);
    this.shadow.position.y = -0.02;
    this.shadow.userData.pickable = false; // декор — не перехватывать клики
    this.mesh.add(this.shadow);
    this.rangeRing = new THREE.Mesh(
      new THREE.CircleGeometry(1, 40),
      new THREE.MeshBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide })
    );
    this.rangeRing.userData.pickable = false; // декор — не перехватывать клики
    this.rangeRing.rotation.x = -Math.PI / 2;
    this.rangeRing.position.y = 0.06;
    this.rangeRing.visible = false;
    this.mesh.add(this.rangeRing);
    return a;
  }

  update(dt, ctx) {
    if (!this.alive) {return;}
    this.t += dt;
    this.cooldown -= dt;

    // взмах крыльев
    const wings2 = this.wingG.children;
    const flapSpeed = this.typeId === 'vampire' ? 3.5 : (this.typeId === 'frost' ? 4.0 : 6.0);
    const flapAmp = this.typeId === 'vampire' ? 0.65 : 0.55;
    for (const w of wings2) {
      w.rotation.x = Math.sin(this.t * flapSpeed) * flapAmp;
    }
    this.mesh.position.y = this.pos.y + 0.35 + Math.sin(this.t * 2.4) * 0.05;

    // Анимация деталей по userData-хукам
    const ud = this.mesh.userData;

    // Печать Ордена над постаментом (вращение кристалла + пульсация сияния)
    if (ud.seal) {
      ud.seal.rotation.y += dt;
      if (ud.seal.userData?.glow) {
        ud.seal.userData.glow.material.opacity = 0.3 + 0.15 * Math.sin(this.t * 2.5);
      }
    }

    if (ud.horn) {
      ud.horn.rotation.x = Math.sin(this.t * 3.5) * 0.08;
    }
    if (ud.membranes && ud.membranes.length > 0) {
      ud.membranes.forEach((m, i) => {
        const trem = 1 + Math.sin(this.t * 18 + i * Math.PI) * 0.12;
        m.scale.set(trem, trem, 1);
      });
    }
    if (ud.hornGlow) {
      const hornBreath = 0.28 * (1 + Math.sin(this.t * 3.5) * 0.2);
      ud.hornGlow.scale.setScalar(hornBreath);
      ud.hornGlow.material.opacity = 0.45 + Math.sin(this.t * 7) * 0.2;
    }
    if (ud.spinRings && ud.spinRings.length > 0) {
      ud.spinRings.forEach((r, i) => {
        r.rotation.z += dt * (i % 2 === 0 ? 1 : -1) * 1.8;
      });
    }
    if (ud.crystals && ud.crystals.length > 0) {
      ud.crystals.forEach((c, i) => {
        c.rotation.y = Math.sin(this.t * 2 + i) * 0.15;
      });
    }
    if (ud.frostBreath) {
      ud.frostBreath.material.opacity = 0.12 + 0.1 * Math.sin(this.t * 1.5);
      ud.frostBreath.position.z = 0.36 + Math.sin(this.t * 1.2) * 0.03;
    }
    if (ud.cap) {
      const breath = 1 + Math.sin(this.t * 3) * 0.06;
      ud.cap.scale.set(breath, 1 + Math.sin(this.t * 3 + 1) * 0.08, breath);
    }
    if (ud.sporeMotes && ud.sporeMotes.length > 0) {
      ud.sporeMotes.forEach((m, i) => {
        const a = this.t * 0.6 + i;
        m.position.set(
          Math.cos(a) * 0.22,
          0.28 + Math.sin(this.t * 1.5 + i * 2) * 0.04,
          0.02 + Math.sin(a) * 0.22
        );
      });
    }
    if (ud.gem) {
      ud.gem.rotation.y += dt * 1.2;
      const pulse = 1 + Math.sin(this.t * 4) * 0.08;
      ud.gem.scale.set(0.8 * pulse, 1.3 * pulse, 0.8 * pulse);
    }
    if (ud.gemGlow) {
      const gemPulse = 1 + Math.sin(this.t * 4) * 0.08;
      ud.gemGlow.scale.setScalar(0.35 * gemPulse);
      ud.gemGlow.material.opacity = 0.4 + Math.sin(this.t * 4) * 0.18;
    }
    if (ud.echoRunes && ud.echoRunes.length > 0) {
      ud.echoRunes.forEach((r, i) => {
        const a = -this.t * 1.4 + (i / 4) * Math.PI * 2;
        r.position.set(
          Math.cos(a) * 0.17,
          0.05 + Math.sin(this.t * 2.5 + i) * 0.03,
          0.22 + Math.sin(a) * 0.17
        );
        r.rotation.x += dt * 1.5;
        r.rotation.y += dt * 2.0;
      });
    }
    if (ud.flames && ud.flames.length > 0) {
      ud.flames.forEach((f, i) => {
        f.scale.y = (1.2 + (i % 2) * 0.3) * (1 + Math.sin(this.t * 10 + i * 1.5) * 0.22);
        f.scale.x = 0.9 * (1 + Math.cos(this.t * 8 + i) * 0.12);
      });
    }
    if (ud.coalGlow) {
      const coalPulse = 0.32 + Math.sin(this.t * 5) * 0.05;
      ud.coalGlow.scale.setScalar(coalPulse);
      ud.coalGlow.material.opacity = 0.45 + Math.sin(this.t * 6) * 0.18;
    }
    if (ud.embers && ud.embers.length > 0) {
      ud.embers.forEach((spk, i) => {
        const phase = ((this.t * 0.8 + i / 3) % 1);
        const bx = spk.userData.baseX ?? (i - 1) * 0.07;
        spk.position.set(
          bx + Math.sin(this.t * 3 + i) * 0.02,
          0.26 + phase * 0.3,
          -0.08 + Math.cos(this.t * 2 + i) * 0.02
        );
        spk.material.opacity = (1 - phase) * 0.8;
        spk.scale.setScalar(0.06 + (1 - phase) * 0.04);
      });
    }
    if (ud.lantern) {
      ud.lantern.rotation.z = Math.sin(this.t * 2.2) * 0.12;
      ud.lantern.rotation.x = Math.cos(this.t * 1.8) * 0.08;
    }
    if (ud.beam) {
      ud.beam.material.opacity = 0.10 + 0.05 * Math.sin(this.t * 2);
      if (ud.beam.userData?.motes) {
        ud.beam.userData.motes.forEach((m, i) => {
          const progress = ((this.t * 0.35 + i * 0.5) % 1);
          m.position.set(
            Math.sin(this.t * 1.2 + i * 2) * 0.04,
            0.26 - progress * 0.22,
            0.30 + progress * 0.25
          );
          m.material.opacity = Math.sin(progress * Math.PI) * 0.35;
        });
      }
    }
    if (ud.orbitOrbs && ud.orbitOrbs.length > 0) {
      const len = ud.orbitOrbs.length;
      ud.orbitOrbs.forEach((o, i) => {
        const a = this.t * 2.2 + (i / len) * Math.PI * 2;
        o.position.set(Math.cos(a) * 0.18, 0.32 + Math.sin(this.t * 3 + i) * 0.04, Math.sin(a) * 0.18);
      });
    }
    if (ud.collar) {
      ud.collar.rotation.z = Math.sin(this.t * 1.8) * 0.04;
    }
    if (ud.ruby) {
      const rubyPulse = 1 + Math.sin(this.t * 3.5) * 0.15;
      ud.ruby.scale.setScalar(rubyPulse);
      if (ud.ruby.userData?.glow) {
        ud.ruby.userData.glow.scale.setScalar(0.18 * rubyPulse);
        ud.ruby.userData.glow.material.opacity = 0.45 + Math.sin(this.t * 3.5) * 0.2;
      }
    }
    if (ud.eyeGlow) {
      const pulse = 0.35 + Math.sin(this.t * 4) * 0.08;
      ud.eyeGlow.scale.setScalar(pulse);
      ud.eyeGlow.material.opacity = 0.4 + Math.sin(this.t * 5) * 0.15;
    }

    // пассивки альф
    if (this.isAlpha) {
      const a = TOWER_TYPES[this.typeId].alpha;
      if (this.typeId === 'frost' && a && Math.floor(this.t * 2) !== Math.floor((this.t - dt) * 2)) {
        for (const e of ctx.enemies) {
          if (e.alive && e.pos.distSq(this.pos) <= 6 * 6) {e.applySlow(0.5, 0.8);}
        }
      }
      if (this.typeId === 'echo' && a && Math.floor(this.t * 1.5) !== Math.floor((this.t - dt) * 1.5)) {
        for (const e of ctx.enemies) {
          if (e.alive && e.pos.distSq(this.pos) <= 8 * 8) {
            e.reveal(1);
            e.applyVuln(0.4, 2);
          }
        }
      }
    }

    // таргетинг и стрельба
    if (this.typeId === 'lantern') {
      if (this.cooldown <= 0) {
        this.cooldown = this.getRate(ctx);
        this.fireLantern(ctx);
      }
      this.rotateToward(ctx);
      return;
    }
    if (this.typeId === 'echo' && !this.isAlpha) {
      if (this.cooldown <= 0) {
        this.cooldown = this.getRate(ctx);
        this.fireEcho(ctx);
      }
      this.rotateToward(ctx);
      return;
    }

    const target = pickTarget(ctx.enemies, this.pos, this.range);
    this.currentTarget = target;
    if (target && this.cooldown <= 0) {
      this.cooldown = this.getRate(ctx);
      this.fire(ctx, target);
    }
    this.rotateToward(ctx);
  }

  rotateToward(ctx) {
    if (!this.currentTarget?.alive) {return;}
    const tpos = this.currentTarget.pos;
    this.mesh.lookAt(tpos.x, this.mesh.position.y, tpos.z);
  }

  fire(ctx, target) {
    const dmg = this.effectiveDamage(ctx);
    const def = TOWER_TYPES[this.typeId];
    const p = new Projectile(ctx.scene, {
      kind: 'bolt',
      damage: dmg,
      speed: this.typeId === 'spore' ? 10 : 15,
      target,
      pos: this.mesh.position.clone(),
      color: def.color,
      splash: this.typeId === 'fire' ? this.range * 0.4 : 0,
      slow: this.typeId === 'frost' ? EFFECT_DEFS.slow.strong * (0.8 + this.level * 0.1) : 0,
      slowDur: EFFECT_DEFS.slow.dur,
      poison: this.typeId === 'spore' ? EFFECT_DEFS.poison.dps * (0.7 + this.level * 0.2) : 0,
      vuln: this.typeId === 'echo' ? EFFECT_DEFS.vuln.bonus * (1 + this.level * 0.2) : 0,
      vulnDur: EFFECT_DEFS.vuln.dur,
      chain: this.typeId === 'screamer' && this.isAlpha ? 2 : 0,
      onHit: (proj) => this.onProjectileHit(ctx, proj, target),
    });
    ctx.projectiles.push(p);
    ctx.particles.spawn({ x: this.mesh.position.x, y: this.mesh.position.y, z: this.mesh.position.z, vx: 0, vy: 0.4, vz: 0, life: 0.15, size: 0.5, color: def.glow, gravity: 0 });
    if (ctx.sfx) {ctx.sfx.shoot(this.typeId);}
  }

  onProjectileHit(ctx, proj, target) {
    const dmg = proj.damage;
    if (proj.splash > 0) {
      // AoE по площади
      for (const e of ctx.enemies) {
        if (!e.alive) {continue;}
        if (e.pos.distSq(proj.pos) <= proj.splash * proj.splash) {
          e.takeDamage(dmg * (e === target ? 1 : 0.6));
          if (this.isAlpha && e !== target) {e.applyBurn(12, 3);}
        }
      }
      ctx.particles.burst({ x: proj.pos.x, y: proj.pos.y, z: proj.pos.z, count: 14, speed: 4, life: 0.5, size: 0.4, color: '#ff9a2a', gravity: 1.2 });
      if (ctx.sfx) {ctx.sfx.explosion();}
    } else {
      const real = target.takeDamage(dmg);
      if (real > 0) {ctx.damageNumber(target.pos, Math.round(real), proj.color, target.boss);}
      ctx.particles.burst({ x: target.pos.x, y: target.pos.y, z: target.pos.z, count: 5, speed: 2.5, life: 0.35, size: 0.25, color: proj.color, gravity: 0 });
      if (proj.slow > 0) {target.applySlow(proj.slow, proj.slowDur);}
      if (proj.poison > 0) {target.applyPoison(proj.poison, 4);}
      if (proj.vuln > 0) {target.applyVuln(proj.vuln, proj.vulnDur);}
      if (ctx.sfx) {ctx.sfx.hit(this.typeId);}
      // цепная молния альфа-визгуна
      if (proj.chain > 0 && target.alive) {
        const chained = ctx.enemies
          .filter(e => e.alive && e !== target && e.pos.distSq(target.pos) <= proj.chainRange * proj.chainRange)
          .sort((a, b) => a.pos.distSq(target.pos) - b.pos.distSq(target.pos))
          .slice(0, proj.chain);
        for (const e of chained) {
          e.takeDamage(dmg * 0.7);
          ctx.particles.burst({ x: e.pos.x, y: e.pos.y, z: e.pos.z, count: 4, speed: 2, life: 0.3, size: 0.22, color: '#ffb0a0', gravity: 0 });
        }
      }
    }
  }

  fireEcho(ctx) {
    const def = TOWER_TYPES.echo;
    const dmg = this.effectiveDamage(ctx);
    const pulse = new PulseRing(ctx.scene, {
      pos: this.mesh.position.clone(),
      radius: this.range * 1.15,
      color: def.color,
      onExpand: (r) => {
        for (const e of ctx.enemies) {
          if (!e.alive) {continue;}
          if (e.pos.distSq(this.pos) <= r * r) {
            e.reveal(4);
            e.applyVuln(EFFECT_DEFS.vuln.bonus * (1 + this.level * 0.2), EFFECT_DEFS.vuln.dur);
            const real = e.takeDamage(dmg * 0.5);
            if (real > 0) {ctx.damageNumber(e.pos, Math.round(real), def.color);}
          }
        }
      },
    });
    ctx.pulses.push(pulse);
    ctx.particles.burst({ x: this.mesh.position.x, y: this.mesh.position.y, z: this.mesh.position.z, count: 10, speed: 2, life: 0.6, size: 0.3, color: def.glow, gravity: 0 });
    if (ctx.sfx) {ctx.sfx.echo();}
  }

  fireLantern(ctx) {
    const def = TOWER_TYPES.lantern;
    const radius = this.range;
    const dur = 1.6 + this.level * 0.4;
    const pulse = new PulseRing(ctx.scene, {
      pos: this.mesh.position.clone(),
      radius,
      color: def.color,
      onExpand: (r) => {
        for (const e of ctx.enemies) {
          if (!e.alive || e.boss) {continue;}
          if (e.pos.distSq(this.pos) <= r * r && !e.effects.lure) {
            e.effects.lure = { t: dur, pos: this.pos.clone() };
            // альфа-сирена замедляет приманенных
            if (this.isAlpha) {e.applySlow(0.35, 1.5);}
            ctx.particles.burst({ x: e.pos.x, y: e.pos.y, z: e.pos.z, count: 4, speed: 1.5, life: 0.5, size: 0.3, color: def.glow, gravity: 0 });
          }
        }
      },
    });
    ctx.pulses.push(pulse);
    if (ctx.sfx) {ctx.sfx.lantern();}
  }

  dispose() {
    this.alive = false;
    this.mesh.removeFromParent();
    this.mesh.traverse(o => {
      if (o.geometry) {o.geometry.dispose();}
      if (o.material) {o.material.dispose();}
    });
  }
}

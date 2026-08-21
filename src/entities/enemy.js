// Враги: процедурные модели, полёт по пути, эффекты, боссы.
import * as THREE from 'three';

import { ENEMY_TYPES, scaledHp, scaledReward, effectiveSpeed, damageTaken } from '../core/enemies.js';
import { CRYSTAL } from '../core/layout.js';
import { Vec3 } from '../core/math.js';
import { wingTexture, glowTexture, shadowTexture } from '../world/textures.js';

const wingTexCache = new Map();
function wingTex(color) {
  if (!wingTexCache.has(color)) {wingTexCache.set(color, wingTexture(color));}
  return wingTexCache.get(color);
}
const glowCache = new Map();
function glowTex(color) {
  if (!glowCache.has(color)) {glowCache.set(color, glowTexture(color, '#ffffff'));}
  return glowCache.get(color);
}
let shadowTex = null;
let hpPixelTex = null;
// Белая точка для HP-бара (спрайт, всегда смотрит на камеру).
function hpPixel() {
  if (!hpPixelTex) {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 4;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 4, 4);
    hpPixelTex = new THREE.CanvasTexture(c);
  }
  return hpPixelTex;
}

// Пара/две пары крыльев (мотыльковые) — взмахи через rotation.x.
function makeWings(type, color, scale, opts = {}) {
  const tex = wingTex(color);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, opacity: opts.opacity ?? 0.85, side: THREE.DoubleSide, depthWrite: false,
  });
  const span = opts.span ?? 1.5, chord = opts.chord ?? 0.8;
  const g = new THREE.Group();
  g.userData.wings = [];
  const flapFreq = opts.flapFreq ?? (type === 'swarm' ? 24 : (type === 'vampmoth' ? 6.5 : 12));

  const pairs = opts.pairs ?? [
    { span, chord, yOffset: 0, zOffset: 0, sweep: opts.sweep ?? 0.9, flapAmp: opts.flapAmp ?? (type === 'swarm' ? 1.4 : 0.85) },
  ];

  for (const p of pairs) {
    const geo = new THREE.PlaneGeometry(p.span, p.chord, 1, 1);
    for (const side of [-1, 1]) {
      const wingGeo = geo.clone();
      wingGeo.translate(-p.span * 0.4 * side, 0, 0);
      const wing = new THREE.Mesh(wingGeo, mat);
      wing.position.set(side * p.span * 0.25, p.yOffset ?? 0, p.zOffset ?? 0);
      wing.rotation.y = side * (p.sweep ?? 0.9);
      wing.userData = { flapAmp: p.flapAmp ?? 0.85, flapFreq };
      g.add(wing);
      g.userData.wings.push(wing);
    }
  }
  g.scale.setScalar(scale);
  return g;
}

// Глаза (светящиеся) спереди (+Z).
function addEyes(g, color, r, opts = {}) {
  const mat = new THREE.MeshBasicMaterial({ color });
  const n = opts.count ?? 2;
  // Свечение вокруг глаз (спрайт-орб)
  const eyeGlowTex = glowTex(color);
  const eyeGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: eyeGlowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.4,
  }));
  eyeGlow.position.set(0, (opts.y ?? 0.12) * r, (opts.z ?? 0.55) * r);
  eyeGlow.scale.setScalar(r * 0.3);
  g.add(eyeGlow);
  for (let i = 0; i < n; i++) {
    const side = n === 1 ? 0 : (i % 2 === 0 ? -1 : 1);
    const k = Math.floor(i / 2);
    const eye = new THREE.Mesh(new THREE.SphereGeometry((opts.size ?? 0.08) * r * (1 - k * 0.25), 6, 6), mat);
    eye.position.set(side * (opts.side ?? 0.18) * r * (1 - k * 0.25), (opts.y ?? 0.12) * r, (opts.z ?? 0.55) * r);
    g.add(eye);
  }
}

// Клыки спереди снизу (+Z).
function addFangs(g, r, scale = 1) {
  const fangMat = new THREE.MeshStandardMaterial({ color: '#f2ece2', roughness: 0.25 });
  for (const side of [-1, 1]) {
    const fang = new THREE.Mesh(new THREE.ConeGeometry(r * 0.06 * scale, r * 0.3 * scale, 5), fangMat);
    fang.position.set(side * r * 0.13 * scale, -r * 0.05 * scale, r * 0.58 * scale);
    fang.rotation.x = -0.55;
    g.add(fang);
  }
}

// Лапы (жук/паук) с сохранёнными userData для анимирования шага.
function makeLegs(color, r, count = 6, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, transparent: true });
  const g = new THREE.Group();
  const legList = [];
  const speed = opts.speed ?? 8;
  const amp = opts.amp ?? 0.18;
  const legGeo = new THREE.CylinderGeometry(r * 0.035, r * 0.02, r * 0.5, 4);

  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const row = Math.floor(i / 2);
    const zPos = (row - (count / 4 - 0.5)) * r * 0.32;
    const leg = new THREE.Mesh(legGeo, mat);
    const baseZ = side * (0.65 + row * 0.12);
    leg.position.set(side * r * 0.42, -r * 0.16, zPos);
    leg.rotation.z = baseZ;
    leg.rotation.x = (row - (count / 4 - 0.5)) * 0.22;

    const phase = (row % 2 === 0 ? side : -side) * Math.PI * 0.5;
    leg.userData = { baseZ, phase, walkSpeed: speed, walkAmp: amp };
    g.add(leg);
    legList.push(leg);
  }
  return { group: g, list: legList };
}

export function buildEnemyMesh(typeId, color, r) {
  const g = new THREE.Group();
  const cObj = new THREE.Color(color);
  const dark = cObj.clone().multiplyScalar(0.35).getStyle();
  const bright = cObj.clone().lerp(new THREE.Color('#ffffff'), 0.4).getStyle();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1, transparent: true });

  const userData = { type: typeId, body: null, wings: null, flapFreq: 12, core: null };

  // 1. beetle — жук-танк (дугообразный панцирь, рога-жвалы, 6 лап, гребень шипов, светящийся шов, БЕЗ крыльев)
  if (typeId === 'beetle') {
    const bMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.45, transparent: true });
    const body = new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 8, 6), bMat);
    body.scale.set(1.5, 0.72, 1.2);
    body.position.y = r * 0.08;

    const shell = new THREE.Mesh(new THREE.SphereGeometry(r * 0.52, 8, 6, 0, Math.PI * 2, 0, Math.PI / 1.7), bMat);
    shell.scale.set(1.52, 0.92, 1.22);
    shell.position.y = r * 0.18;

    // рога-жвалы дугой на +Z
    const hornMat = new THREE.MeshStandardMaterial({ color: dark, roughness: 0.5, metalness: 0.3 });
    const hornGeo = new THREE.TorusGeometry(r * 0.28, r * 0.035, 4, 8, Math.PI * 0.7);
    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(hornGeo, hornMat);
      horn.position.set(side * r * 0.16, r * 0.14, r * 0.55);
      horn.rotation.x = Math.PI / 2;
      horn.rotation.z = side * -0.6;
      g.add(horn);
    }

    // гребень шипов на панцире (3 конуса вдоль хребта)
    const spineMat = new THREE.MeshStandardMaterial({ color: dark, roughness: 0.7, metalness: 0.3, transparent: true });
    const spineZ = [-r * 0.35, -r * 0.05, r * 0.25];
    for (let i = 0; i < 3; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(r * 0.07, r * 0.24, 4), spineMat);
      spike.position.set(0, r * 0.58 - (i === 1 ? 0 : r * 0.06), spineZ[i]);
      spike.rotation.x = -0.25 + (i - 1) * 0.15;
      spike.userData = { pickable: false };
      g.add(spike);
    }

    // шов между body/shell — тонкий торус, оранжевое свечение глубин
    const seamMat = new THREE.MeshBasicMaterial({
      color: '#ff6611', transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const seam = new THREE.Mesh(new THREE.TorusGeometry(r * 0.5, r * 0.025, 4, 16), seamMat);
    seam.scale.set(1.48, 1.18, 1.0);
    seam.position.set(0, r * 0.14, 0);
    seam.rotation.x = Math.PI / 2;
    seam.userData = { pickable: false };
    g.add(seam);
    userData.shellSeam = seam;

    // 6 двухсегментных лап
    const { group: legGrp, list: legList } = makeLegs(dark, r, 6, { speed: 8, amp: 0.18 });
    g.add(legGrp);

    addEyes(g, '#201a26', r, { size: 0.06, side: 0.22, y: 0.14, z: 0.55, count: 2 });
    g.add(body, shell);

    userData.body = body;
    userData.legs = legList;
    userData.wings = null;
    userData.flapFreq = 0;
  } else if (typeId === 'spider' || typeId === 'spiderling') {
    // 2 & 9. spider & spiderling — паук и паучок (головогрудь, брюшко, лапы, клыки, яд)
    const isSpider = typeId === 'spider';
    const bMat2 = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.2, transparent: true });

    const body = new THREE.Mesh(new THREE.SphereGeometry(r * (isSpider ? 0.45 : 0.38), 8, 6), bMat2);
    body.position.set(0, r * 0.08, r * 0.18);

    const abd = new THREE.Mesh(new THREE.SphereGeometry(r * (isSpider ? 0.58 : 0.45), 8, 6), bMat2);
    abd.position.set(0, r * 0.12, -r * 0.6);
    abd.scale.set(0.95, 0.85, 1.25);

    // узор на брюшке
    const pattern = new THREE.Mesh(new THREE.SphereGeometry(r * 0.28, 6, 6), new THREE.MeshBasicMaterial({
      color: isSpider ? '#ff2244' : '#ff7799', transparent: true, opacity: 0.85,
    }));
    pattern.position.set(0, r * 0.2, -r * 0.6);
    pattern.scale.set(0.7, 0.5, 0.8);

    // лапы
    const legCount = isSpider ? 8 : 6;
    const { group: legGrp, list: legList } = makeLegs(dark, r, legCount, { speed: isSpider ? 10 : 16, amp: isSpider ? 0.18 : 0.22 });
    g.add(body, abd, pattern, legGrp);

    // ядовитый пузырёк и шипы на брюшке паучихи
    let venom = null;
    if (isSpider) {
      venom = new THREE.Mesh(new THREE.SphereGeometry(r * 0.18, 6, 6), new THREE.MeshBasicMaterial({ color: '#88ff44', transparent: true, opacity: 0.9 }));
      venom.position.set(0, r * 0.3, -r * 0.6);
      g.add(venom);

      // пара изогнутых шипов на брюшке босса
      const spiderSpikeMat = new THREE.MeshStandardMaterial({ color: dark, roughness: 0.5, metalness: 0.3, transparent: true });
      for (const side of [-1, 1]) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(r * 0.08, r * 0.38, 4), spiderSpikeMat);
        spike.position.set(side * r * 0.32, r * 0.38, -r * 0.65);
        spike.rotation.x = -0.55;
        spike.rotation.z = side * 0.65;
        spike.userData = { pickable: false };
        g.add(spike);
      }

      // ядовитая нить-капельница под venom
      const dripMat = new THREE.MeshBasicMaterial({
        color: '#88ff44', transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const venomDrip = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.02, r * 0.01, r * 0.4, 4), dripMat);
      venomDrip.position.set(0, r * 0.06, -r * 0.6);
      venomDrip.userData = { pickable: false };
      g.add(venomDrip);
      userData.venomDrip = venomDrip;
    } else {
      // светящаяся полоса на спине паучонка
      const stripeMat = new THREE.MeshBasicMaterial({
        color: '#ff66aa', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(r * 0.08, r * 0.04, r * 0.55), stripeMat);
      stripe.position.set(0, r * 0.28, -r * 0.42);
      stripe.rotation.x = -0.12;
      stripe.userData = { pickable: false };
      g.add(stripe);
      userData.stripeGlow = stripe;
    }
    userData.venom = venom;

    addFangs(g, r, isSpider ? 1.0 : 0.6);
    addEyes(g, isSpider ? '#ff2244' : '#ff7799', r, { count: 2, size: 0.09, side: 0.18, y: 0.15, z: 0.52 });
    addEyes(g, isSpider ? '#ff8899' : '#ffaacc', r, { count: 4, size: 0.05, side: 0.3, y: 0.08, z: 0.48 });

    userData.body = body;
    userData.legs = legList;
    userData.wings = null;
    userData.flapFreq = 0;
  } else {
    // --- летающие враги (moth, swarm, cloak, regen, healer, ranger, vampmoth) ---
    const body = new THREE.Mesh(new THREE.SphereGeometry(r * 0.45, 8, 6), bodyMat);
    body.scale.set(0.85, 0.8, 1.25);
    body.position.set(0, r * 0.05, r * 0.1);

    let wings = null;
    let core = null;

    if (typeId === 'moth') {
      // Каплевидное брюшко на -Z
      const abd = new THREE.Mesh(new THREE.ConeGeometry(r * 0.38, r * 0.95, 6), new THREE.MeshStandardMaterial({ color: dark, roughness: 0.7, transparent: true }));
      abd.position.set(0, -r * 0.05, -r * 0.55);
      abd.rotation.x = -Math.PI / 2;
      g.add(abd);

      // 2 гребенчатые антенны ёлочкой на +Z
      const antMat = new THREE.MeshStandardMaterial({ color: bright, roughness: 0.5, transparent: true });
      const antList = [];
      for (const side of [-1, 1]) {
        const antGrp = new THREE.Group();
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.02, r * 0.01, r * 0.45, 4), antMat);
        stem.position.y = r * 0.22;
        antGrp.add(stem);
        for (let k = 1; k <= 3; k++) {
          const branch = new THREE.Mesh(new THREE.ConeGeometry(r * 0.025, r * 0.12, 3), antMat);
          branch.position.set(side * r * 0.04 * k, r * 0.1 * k, 0);
          branch.rotation.z = -side * 0.7;
          antGrp.add(branch);
        }
        const baseZ = side * 0.45;
        antGrp.position.set(side * r * 0.14, r * 0.35, r * 0.45);
        antGrp.rotation.z = baseZ;
        antGrp.userData = { baseZ, phase: side * 1.5 };
        g.add(antGrp);
        antList.push(antGrp);
      }
      userData.antennae = antList;

      // Лунная пыльца — 2 микроспрайта за брюшком на -Z
      const moteTex = glowTex('#b0f0ff');
      const dustMotes = [];
      for (let i = 0; i < 2; i++) {
        const mote = new THREE.Sprite(new THREE.SpriteMaterial({
          map: moteTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.35,
        }));
        mote.position.set((i === 0 ? -0.06 : 0.06) * r, -r * 0.05, -r * (0.8 + i * 0.3));
        mote.scale.setScalar(r * 0.22);
        mote.userData = { pickable: false };
        g.add(mote);
        dustMotes.push(mote);
      }
      userData.dustMotes = dustMotes;

      wings = makeWings('moth', color, r * 1.05, {
        flapFreq: 12,
        pairs: [
          { span: 1.6, chord: 0.7, yOffset: 0.1, zOffset: 0.05, sweep: 0.85, flapAmp: 0.85 },
          { span: 1.0, chord: 0.5, yOffset: -0.05, zOffset: -0.2, sweep: 1.1, flapAmp: 0.7 },
        ],
      });
      addEyes(g, '#a0ffff', r, { count: 2, size: 0.08, side: 0.18, y: 0.12, z: 0.55 });
    } else if (typeId === 'swarm') {
      // Веретенообразное полосатое брюшко + жало на -Z
      body.scale.set(0.55, 0.5, 1.4);
      const abdMat = new THREE.MeshStandardMaterial({ color: '#e6b800', roughness: 0.6, transparent: true });
      const abd = new THREE.Mesh(new THREE.ConeGeometry(r * 0.35, r * 0.8, 5), abdMat);
      abd.position.set(0, -r * 0.05, -r * 0.55);
      abd.rotation.x = -Math.PI / 2;

      const ringMat = new THREE.MeshBasicMaterial({ color: '#1a1400' });
      for (let k = 0; k < 2; k++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.26 - k * 0.05, 0.03, 4, 8), ringMat);
        ring.position.set(0, -r * 0.05, -r * (0.4 + k * 0.2));
        g.add(ring);
      }

      const stinger = new THREE.Mesh(new THREE.ConeGeometry(r * 0.05, r * 0.35, 4), new THREE.MeshBasicMaterial({ color: '#ffe98a' }));
      stinger.position.set(0, -r * 0.05, -r * 0.95);
      stinger.rotation.x = Math.PI / 2;
      g.add(abd, stinger);

      // Мерцающий glow-спрайт жала на -Z
      const stingerTex = glowTex('#ffea55');
      const stingerGlow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: stingerTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.45,
      }));
      stingerGlow.position.set(0, -r * 0.05, -r * 1.15);
      stingerGlow.scale.setScalar(r * 0.32);
      stingerGlow.userData = { pickable: false };
      g.add(stingerGlow);
      userData.stingerGlow = stingerGlow;

      // Слабый жёлтый ореол вокруг роя
      const swarmHalo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex('#ffd840'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.12,
      }));
      swarmHalo.position.set(0, 0, 0);
      swarmHalo.scale.setScalar(r * 1.7);
      swarmHalo.userData = { pickable: false };
      g.add(swarmHalo);

      // 4 осы-тетраэдра спутники
      const satellites = new THREE.Group();
      const satMat = new THREE.MeshBasicMaterial({ color: bright });
      for (let i = 0; i < 4; i++) {
        const sat = new THREE.Mesh(new THREE.TetrahedronGeometry(r * 0.12), satMat);
        const a = (i / 4) * Math.PI * 2;
        sat.position.set(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72, 0);
        satellites.add(sat);
      }
      g.add(satellites);
      userData.satellites = satellites;

      wings = makeWings('swarm', color, r * 1.05, { flapFreq: 24, flapAmp: 1.4, span: 1.1, chord: 0.35 });
      addEyes(g, '#ffe98a', r, { count: 2, size: 0.07, side: 0.15, y: 0.1, z: 0.5 });
    } else if (typeId === 'cloak') {
      // Плащевидная форма (размах 2.2), шлейф на -Z, светящийся глаз
      body.scale.set(1.5, 0.22, 1.3);

      const trail = new THREE.Mesh(new THREE.ConeGeometry(r * 0.2, r * 1.0, 6), new THREE.MeshBasicMaterial({
        color: '#9ac8ff', transparent: true, opacity: 0.25, depthWrite: false,
      }));
      trail.position.set(0, 0, -r * 0.8);
      trail.rotation.x = Math.PI / 2;
      g.add(trail);
      userData.trail = trail;

      // 3 вихревые пряди-хвоста на -Z
      const wisps = [];
      for (let i = 0; i < 3; i++) {
        const wispMat = new THREE.MeshBasicMaterial({
          color: '#88d0ff', transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending,
        });
        const wisp = new THREE.Mesh(new THREE.ConeGeometry(r * 0.08, r * 0.9, 4), wispMat);
        const ang = (i - 1) * 0.32;
        wisp.position.set(Math.sin(ang) * r * 0.28, 0, -r * (0.85 + Math.abs(i - 1) * 0.15));
        wisp.rotation.x = Math.PI / 2;
        wisp.rotation.y = ang * 0.6;
        wisp.userData = { pickable: false, baseRotX: Math.PI / 2, index: i };
        g.add(wisp);
        wisps.push(wisp);
      }
      userData.wisps = wisps;

      wings = makeWings('cloak', color, r * 1.05, { flapFreq: 16, span: 2.2, chord: 0.4, opacity: 0.4, sweep: 0.7 });
      addEyes(g, '#80f0ff', r, { count: 1, size: 0.16, side: 0, y: 0.08, z: 0.5 });
    } else if (typeId === 'regen') {
      // Био-кокон: 4 лепестка, ядро (Icosahedron), 2 кольца Torus
      core = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.32, 0), new THREE.MeshBasicMaterial({ color: '#ff4fa0' }));
      core.position.set(0, r * 0.1, r * 0.2);
      g.add(core);

      const ringMat = new THREE.MeshBasicMaterial({ color: '#ff4fa0', transparent: true, opacity: 0.7 });
      const r1 = new THREE.Mesh(new THREE.TorusGeometry(r * 0.45, 0.02, 5, 16), ringMat);
      const r2 = new THREE.Mesh(new THREE.TorusGeometry(r * 0.58, 0.015, 5, 16), ringMat);
      r1.position.copy(core.position);
      r2.position.copy(core.position);
      g.add(r1, r2);
      userData.coreRings = [r1, r2];

      const sats = new THREE.Group();
      // 4 розовые сферы-клетки в satellites
      const cellMat = new THREE.MeshBasicMaterial({ color: '#ff69b4', transparent: true, opacity: 0.85 });
      for (let i = 0; i < 4; i++) {
        const cell = new THREE.Mesh(new THREE.SphereGeometry(r * 0.08, 6, 6), cellMat);
        const a = (i / 4) * Math.PI * 2;
        cell.position.set(Math.cos(a) * r * 0.65, Math.sin(a) * r * 0.65, 0);
        cell.userData = { pickable: false };
        sats.add(cell);
      }
      g.add(sats);
      userData.satellites = sats;

      // Миазмы-спрайт вокруг ядра
      const miasmaTex = glowTex('#ff2288');
      const miasma = new THREE.Sprite(new THREE.SpriteMaterial({
        map: miasmaTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.25,
      }));
      miasma.position.copy(core.position);
      miasma.scale.setScalar(r * 1.4);
      miasma.userData = { pickable: false };
      g.add(miasma);
      userData.miasma = miasma;

      // 4 лепестка вокруг ядра
      const petalMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, transparent: true });
      for (let i = 0; i < 4; i++) {
        const petal = new THREE.Mesh(new THREE.ConeGeometry(r * 0.18, r * 0.6, 4), petalMat);
        const ang = (i / 4) * Math.PI * 2;
        petal.position.set(Math.cos(ang) * r * 0.38, r * 0.1 + Math.sin(ang) * r * 0.38, r * 0.2);
        petal.rotation.z = ang + Math.PI / 2;
        g.add(petal);
      }

      wings = makeWings('regen', color, r * 1.05, { flapFreq: 10 });
      addEyes(g, '#ff99dd', r, { count: 2, size: 0.07, side: 0.16, y: 0.12, z: 0.5 });
    } else if (typeId === 'healer') {
      // Жрец: капюшон (Cone срезанный), посох + кристалл, золотой нимб
      const hood = new THREE.Mesh(new THREE.ConeGeometry(r * 0.38, r * 0.55, 6), bodyMat);
      hood.position.set(0, r * 0.28, r * 0.1);
      hood.rotation.x = 0.2;
      g.add(hood);

      const halo = new THREE.Mesh(new THREE.TorusGeometry(r * 0.38, 0.025, 6, 18), new THREE.MeshBasicMaterial({ color: '#ffd94a' }));
      halo.position.set(0, r * 0.78, 0);
      halo.rotation.x = Math.PI / 2.4;
      g.add(halo);
      userData.halo = halo;

      // Столб молитвенного света над нимбом
      const beamGeo = new THREE.ConeGeometry(r * 0.26, r * 1.5, 6, 1, true);
      const beamMat = new THREE.MeshBasicMaterial({
        color: '#ffea78', transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const prayerBeam = new THREE.Mesh(beamGeo, beamMat);
      prayerBeam.position.set(0, r * 1.45, 0);
      prayerBeam.rotation.x = Math.PI;
      prayerBeam.userData = { pickable: false };
      g.add(prayerBeam);
      userData.prayerBeam = prayerBeam;

      const staffMat = new THREE.MeshStandardMaterial({ color: '#8a6a3a', roughness: 0.8, transparent: true });
      const staff = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.03, r * 0.04, r * 1.2, 5), staffMat);
      staff.position.set(r * 0.48, -r * 0.05, r * 0.35);
      staff.rotation.z = 0.4;
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(r * 0.14), new THREE.MeshBasicMaterial({ color: '#ffe98a' }));
      crystal.position.set(r * 0.68, r * 0.48, r * 0.35);
      g.add(staff, crystal);
      userData.staff = staff;

      // Glow-спрайт на кристалле посоха
      const staffGlow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex('#ffe98a'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5,
      }));
      staffGlow.position.set(r * 0.68, r * 0.48, r * 0.35);
      staffGlow.scale.setScalar(r * 0.38);
      staffGlow.userData = { pickable: false };
      g.add(staffGlow);

      wings = makeWings('healer', color, r * 1.05, { flapFreq: 9, opacity: 0.9 });
      addEyes(g, '#fff0aa', r, { count: 2, size: 0.07, side: 0.16, y: 0.12, z: 0.5 });
    } else if (typeId === 'ranger') {
      // Арбалетчик: роговой лук (Torus arc на +Z), светящийся болт, отдача bowKick
      const bowMat = new THREE.MeshStandardMaterial({ color: '#d8b06a', roughness: 0.4, transparent: true });
      const bow = new THREE.Mesh(new THREE.TorusGeometry(r * 0.42, 0.035, 4, 10, Math.PI * 0.8), bowMat);
      bow.position.set(0, r * 0.1, r * 0.55);
      bow.rotation.x = Math.PI / 2;
      bow.rotation.z = Math.PI / 2;
      g.add(bow);
      userData.bow = bow;
      userData.bowKick = 0;
      userData.bowBaseZ = r * 0.55;

      // Тетива — ребёнок bow (двигается с отдачей лука)
      const bowStringMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 });
      const bowString = new THREE.Mesh(new THREE.BoxGeometry(r * 0.65, r * 0.015, r * 0.015), bowStringMat);
      bowString.position.set(r * 0.08, r * 0.24, 0);
      bowString.rotation.z = -0.35;
      bowString.userData = { pickable: false };
      bow.add(bowString);

      const bolt = new THREE.Mesh(new THREE.ConeGeometry(r * 0.04, r * 0.45, 4), new THREE.MeshBasicMaterial({ color: '#fff0c8' }));
      bolt.position.set(0, r * 0.1, r * 0.72);
      bolt.rotation.x = Math.PI / 2;
      g.add(bolt);

      // Колчан на спине на -Z с 3 болтами веером
      const quiver = new THREE.Group();
      const quiverMat = new THREE.MeshStandardMaterial({ color: '#523820', roughness: 0.8, transparent: true });
      const qCase = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.09, r * 0.07, r * 0.48, 5), quiverMat);
      quiver.add(qCase);
      const qBoltMat = new THREE.MeshBasicMaterial({ color: '#fff0c8' });
      for (let i = 0; i < 3; i++) {
        const qBolt = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.015, r * 0.015, r * 0.42, 3), qBoltMat);
        const ang = (i - 1) * 0.22;
        qBolt.position.set(Math.sin(ang) * r * 0.05, r * 0.12, Math.cos(ang) * r * 0.02);
        qBolt.rotation.z = ang;
        quiver.add(qBolt);
      }
      quiver.position.set(0, r * 0.15, -r * 0.45);
      quiver.rotation.x = 0.35;
      quiver.userData = { pickable: false };
      g.add(quiver);
      userData.quiver = quiver;

      wings = makeWings('ranger', color, r * 1.05, { flapFreq: 13 });
      addEyes(g, '#ffdd88', r, { count: 2, size: 0.07, side: 0.16, y: 0.12, z: 0.5 });
    } else if (typeId === 'vampmoth') {
      // Главный босс: ворсистая грудь, воротник из костяных шипов на -Z, корона, клыки
      body.scale.set(1.0, 0.9, 1.4);

      const abd = new THREE.Mesh(new THREE.SphereGeometry(r * 0.45, 8, 6), new THREE.MeshStandardMaterial({ color: '#5a0a14', roughness: 0.7, transparent: true }));
      abd.position.set(0, -r * 0.05, -r * 0.65);
      g.add(abd);

      // воротник из 5 костяных шипов на -Z
      const collarMat = new THREE.MeshStandardMaterial({ color: '#e6ded2', roughness: 0.4, transparent: true });
      for (let i = 0; i < 5; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(r * 0.06, r * 0.38, 4), collarMat);
        const ang = (i - 2) * 0.4;
        spike.position.set(Math.sin(ang) * r * 0.4, r * 0.35, -r * 0.25 - Math.cos(ang) * r * 0.15);
        spike.rotation.x = -0.6;
        spike.rotation.z = -ang;
        g.add(spike);
      }

      // костяные когти-крючья у корней крыльев
      const clawMat = new THREE.MeshStandardMaterial({ color: '#e6ded2', roughness: 0.35, metalness: 0.2, transparent: true });
      for (const side of [-1, 1]) {
        for (let k = 0; k < 2; k++) {
          const claw = new THREE.Mesh(new THREE.ConeGeometry(r * 0.055, r * 0.3, 4), clawMat);
          claw.position.set(side * r * (0.34 + k * 0.12), r * 0.16 - k * 0.08, r * 0.1 - k * 0.16);
          claw.rotation.x = 0.5;
          claw.rotation.z = side * -0.85;
          claw.userData = { pickable: false };
          g.add(claw);
        }
      }

      // кровавый туман (багровый аддитивный спрайт)
      const mistTex = glowTex('#990018');
      const bloodMist = new THREE.Sprite(new THREE.SpriteMaterial({
        map: mistTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.15,
      }));
      bloodMist.position.set(0, 0, -r * 0.15);
      bloodMist.scale.setScalar(r * 2.2);
      bloodMist.userData = { pickable: false };
      g.add(bloodMist);
      userData.bloodMist = bloodMist;

      // тройная корона-рога
      const crownGrp = new THREE.Group();
      const crownMat = new THREE.MeshBasicMaterial({ color: '#ff2244' });
      for (let i = 0; i < 3; i++) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(r * 0.06, r * 0.35, 4), crownMat);
        const ang = (i - 1) * 0.5;
        horn.position.set(Math.sin(ang) * r * 0.24, r * 0.6, Math.cos(ang) * r * 0.1);
        horn.rotation.x = -0.3;
        horn.rotation.z = -ang;
        crownGrp.add(horn);
      }
      g.add(crownGrp);
      userData.crown = crownGrp;

      addFangs(g, r, 1.3);
      addEyes(g, '#ff2244', r, { count: 2, size: 0.1, side: 0.2, y: 0.14, z: 0.55 });

      wings = makeWings('vampmoth', color, r * 1.05, {
        flapFreq: 6.5,
        pairs: [
          { span: 2.2, chord: 1.0, yOffset: 0.1, zOffset: 0.05, sweep: 1.2, flapAmp: 1.1 },
          { span: 1.4, chord: 0.6, yOffset: -0.1, zOffset: -0.25, sweep: 1.4, flapAmp: 0.95 },
        ],
      });
    }

    if (wings) {
      g.add(wings);
    }
    g.add(body);

    userData.body = body;
    userData.wings = wings;
    userData.core = core;
    userData.flapFreq = wings?.userData?.wings[0]?.userData?.flapFreq ?? 12;
  }

  // Общая тусклая «аура Мрака» под телом для всех 10 врагов (фиолетово-багровый аддитивный спрайт)
  const auraTex = glowTex('#550044');
  const darkAura = new THREE.Sprite(new THREE.SpriteMaterial({
    map: auraTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.11,
  }));
  darkAura.position.set(0, -r * 0.1, 0);
  darkAura.scale.setScalar(r * 1.9);
  darkAura.userData = { pickable: false };
  g.add(darkAura);
  userData.darkAura = darkAura;

  g.userData = userData;
  return g;
}

export class Enemy {
  constructor(typeId, wave, path, scene, worldCtx) {
    this.typeId = typeId;
    const def = ENEMY_TYPES[typeId];
    const endless = wave > 10;
    this.maxHp = Math.round(scaledHp(def.hp, wave, endless) * (worldCtx.diffCfg?.hpMult ?? 1));
    this.hp = this.maxHp;
    this.baseSpeed = def.speed;
    this.reward = Math.round(scaledReward(def.reward, wave, endless) * (worldCtx.moonRewardMul ?? 1) * (worldCtx.diffCfg?.rewardMult ?? 1));
    this.dmg = def.dmg * (worldCtx.diffCfg?.dmgMult ?? 1);
    this.armor = def.armor;
    this.heal = def.heal || 0;
    this.r = def.r * (def.boss ? 1.35 : 1);
    this.boss = !!def.boss;
    this.isCloakType = !!def.cloaked;
    this.path = path;
    this.progress = 0;
    this.alive = true;
    this.dead = false;
    this.reachedEnd = false;
    this.t = Math.random() * 10;
    this.scale = def.boss ? 1.6 : 1;
    this.speedMul = 1;
    this.effects = { slow: null, poison: 0, poisonT: 0, burn: 0, burnT: 0, vuln: 0, vulnT: 0, revealed: 0, lure: null };
    this.cloaked = worldCtx.cloakAll ? true : def.cloaked;
    this.worldCtx = worldCtx;
    this.ranged = def.ranged ? { ...def.ranged, dmg: def.ranged.dmg * (worldCtx.diffCfg?.dmgMult ?? 1) } : null;
    if (this.ranged) {this.rangedCd = 0;}
    this.healAura = def.healAura || 0;
    this.healAuraR = def.healAuraR || 0;
    this.healTick = 0;
    this.effectParticleT = 0;

    // позиция (чистый Vec3 для логики)
    this.pos = path.pointAt(0);
    this._tgt = new Vec3();
    this._dir = new Vec3();

    // меш
    this.mesh = buildEnemyMesh(typeId, def.color, this.r);
    this.mesh.scale.setScalar(this.scale);
    scene.add(this.mesh);
    this.wings = this.mesh.userData.wings?.userData?.wings || [];
    this.wingFreq = this.mesh.userData.flapFreq || 12;
    this.bodyMat = this.mesh.userData.body?.material;

    // тень
    if (!shadowTex) {shadowTex = shadowTexture();}
    this.shadow = new THREE.Sprite(new THREE.SpriteMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    this.shadow.scale.setScalar(this.r * 1.9 * this.scale);
    this.shadow.position.y = -0.1;
    this.mesh.add(this.shadow);

    // HP-бар (спрайты — всегда лицом к камере)
    const hpTex = hpPixel();
    this.hpBg = new THREE.Sprite(new THREE.SpriteMaterial({ map: hpTex, color: 0x16121f, transparent: true, opacity: 0.8, depthWrite: false }));
    this.hpBg.scale.set(0.66, 0.07, 1);
    this.hpBg.position.y = this.r * 1.75;
    this.hpFillS = new THREE.Sprite(new THREE.SpriteMaterial({ map: hpTex, color: 0x37e0a0, transparent: true, opacity: 0.95, depthWrite: false }));
    this.hpFillS.scale.set(0.6, 0.045, 1);
    this.hpFillS.position.y = this.r * 1.75;
    this.hpFillS.renderOrder = 2;
    this.hpBg.renderOrder = 1;
    this.mesh.add(this.hpBg, this.hpFillS);
    this.hpFillS.visible = false;

    // кольцо раскрытия
    this.revealRing = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('#66e0ff', 'rgba(120,220,255,0.8)'),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0,
    }));
    this.revealRing.scale.setScalar(this.r * 4);
    this.mesh.add(this.revealRing);

    this.updateCloakVisual();
  }

  get effSpeed() {
    const slow = this.effects.slow ? this.effects.slow.mult : 0;
    let s = effectiveSpeed(this.baseSpeed, slow);
    if (this.worldCtx.moonSpeedMul) {s *= this.worldCtx.moonSpeedMul;}
    if (this.worldCtx.diffCfg?.speedMult) { s *= this.worldCtx.diffCfg.speedMult; }
    return s;
  }

  get vulnBonus() { return this.effects.vuln || 0; }

  reveal(seconds = 4) {
    this.effects.revealed = Math.max(this.effects.revealed, seconds);
    this.cloaked = false;
    this.updateCloakVisual();
    this.revealRing.material.opacity = 0.9;
  }

  updateCloakVisual() {
    const op = this.cloaked && !this.effects.revealed ? 0.16 : 1;
    if (this.bodyMat) {this.bodyMat.opacity = op;}
    for (const w of this.wings) {w.material.opacity = op * 0.85;}
    this.shadow.material.opacity = op * 0.6;
  }

  update(dt) {
    if (!this.alive) {return;}
    this.t += dt;
    const fx = this.effects;

    // затухание вспышки попадания
    if (this._hitFlashTimer > 0) {
      this._hitFlashTimer -= dt;
      if (this._hitFlashTimer <= 0 && this.mesh?.userData?.body?.material?.emissive) {
        this.mesh.userData.body.material.emissive.setHex(0x000000);
        this.mesh.userData.body.material.emissiveIntensity = 0;
      }
    }

    // эффекты по времени
    if (fx.slow) { fx.slow.t -= dt; if (fx.slow.t <= 0) {fx.slow = null;} }
    if (fx.revealed > 0) {
      fx.revealed -= dt;
      this.revealRing.material.opacity = Math.max(0, fx.revealed / 4) * 0.9;
      if (fx.revealed <= 0) {this.updateCloakVisual();}
    }
    if (fx.vulnT > 0) { fx.vulnT -= dt; if (fx.vulnT <= 0) {fx.vuln = 0;} }
    let dot = 0;
    if (fx.poisonT > 0) { fx.poisonT -= dt; dot += fx.poison; if (fx.poisonT <= 0) {fx.poison = 0;} }
    if (fx.burnT > 0) { fx.burnT -= dt; dot += fx.burn; if (fx.burnT <= 0) {fx.burn = 0;} }
    if (dot > 0) {this.takeDamage(dot * dt, { dot: true });}

    // регенерация
    if (this.heal > 0 && this.hp < this.maxHp) {this.hp = Math.min(this.maxHp, this.hp + this.heal * dt);}

    // движение
    if (fx.lure) {
      const d = this.pos.dist(fx.lure.pos);
      if (d < 0.25) { fx.lure.t = 0; }
      if (d > 0.05) {
        this._dir.set(fx.lure.pos.x - this.pos.x, fx.lure.pos.y - this.pos.y, fx.lure.pos.z - this.pos.z).normalize();
        this.pos.add(this._dir.scale(this.effSpeed * dt));
      }
      fx.lure.t -= dt;
      if (fx.lure.t <= 0) {fx.lure = null;}
    } else if (this.ranged && this.progress > 2 && this.pos.dist(CRYSTAL.pos) <= this.ranged.dist) {
      // стрелок: встал на дистанции и бьёт по кристаллу
      this.rangedCd -= dt;
      if (this.rangedCd <= 0) {
        this.rangedCd = this.ranged.cd;
        if (this.mesh.userData.bow) {
          this.mesh.userData.bowKick = 1.0;
        }
        if (this.worldCtx.onCrystalDamage) {this.worldCtx.onCrystalDamage(this.ranged.dmg, this.pos);}
        if (this.worldCtx.particles) {
          this.worldCtx.particles.burst({ x: this.pos.x, y: this.pos.y, z: this.pos.z, count: 6, speed: 3, life: 0.45, size: 0.22, color: '#ffb84a', gravity: 0 });
        }
      }
    } else {
      this.progress += this.effSpeed * dt;
      if (this.progress >= this.path.length) {
        this.reachedEnd = true;
        this.alive = false;
        return;
      }
      this.path.pointAtInto(this.progress, this.pos);
    }

    // аура лечения жреца — раз в 0.5 с лечит соседей
    if (this.healAura > 0) {
      this.healTick -= dt;
      if (this.healTick <= 0) {
        this.healTick = 0.5;
        const rr = this.healAuraR * this.healAuraR;
        for (const e of this.worldCtx.enemies) {
          if (e.alive && e !== this && e.pos.distSq(this.pos) <= rr) {
            e.hp = Math.min(e.maxHp, e.hp + this.healAura * 0.5);
          }
        }
        if (this.worldCtx.particles) {
          this.worldCtx.particles.burst({ x: this.pos.x, y: this.pos.y + 0.3, z: this.pos.z, count: 4, speed: 1, life: 0.5, size: 0.2, color: '#ffd0e8', gravity: -0.3 });
        }
      }
    }

    // взмах крыльев
    for (const w of this.wings) {
      w.rotation.x = Math.sin(this.t * w.userData.flapFreq) * w.userData.flapAmp * 0.9;
    }
    this.mesh.position.copy(this.pos);
    // лёгкое покачивание в полёте
    this.mesh.position.y += Math.sin(this.t * 3 + this.progress * 0.5) * 0.04 * this.scale;

    // --- АНИМАЦИИ ВСЕХ 10 ТИПОВ (userData-хуки) ---
    // общая аура Мрака под телом (мерцание 0.08–0.14)
    const darkAura = this.mesh.userData.darkAura;
    if (darkAura) {
      darkAura.material.opacity = 0.11 + Math.sin(this.t * 3.2) * 0.03;
    }

    // жук: покачивание панциря в такт движения
    if (this.typeId === 'beetle') {
      this.mesh.rotation.z = Math.sin(this.t * 8) * 0.05;
    }

    // лапы жука и пауков (альтернативный шаг)
    const legs = this.mesh.userData.legs;
    if (legs) {
      for (let i = 0; i < legs.length; i++) {
        const leg = legs[i];
        leg.rotation.z = leg.userData.baseZ + Math.sin(this.t * leg.userData.walkSpeed + leg.userData.phase) * leg.userData.walkAmp;
      }
    }

    // шов панциря жука (оранжевое свечение глубин)
    const shellSeam = this.mesh.userData.shellSeam;
    if (shellSeam) {
      shellSeam.material.opacity = 0.25 + 0.15 * Math.sin(this.t * 2);
    }

    // усики мотылька (вибрация)
    const ants = this.mesh.userData.antennae;
    if (ants) {
      for (let i = 0; i < ants.length; i++) {
        const ant = ants[i];
        ant.rotation.z = ant.userData.baseZ + Math.sin(this.t * 18 + ant.userData.phase) * 0.1;
      }
    }

    // лунная пыльца мотылька: дрейф назад с затуханием
    const dustMotes = this.mesh.userData.dustMotes;
    if (dustMotes) {
      for (let i = 0; i < dustMotes.length; i++) {
        const m = dustMotes[i];
        const phase = (this.t * 1.5 + i * 0.5) % 1;
        m.position.z = -this.r * (0.65 + phase * 0.6);
        m.position.x = (i === 0 ? -1 : 1) * this.r * (0.06 + Math.sin(this.t * 4 + i) * 0.04);
        m.position.y = -this.r * 0.05 + Math.cos(this.t * 3 + i) * this.r * 0.06;
        m.material.opacity = (1 - phase) * 0.35;
      }
    }

    // мерцание жала роя
    const stingerGlow = this.mesh.userData.stingerGlow;
    if (stingerGlow) {
      stingerGlow.material.opacity = 0.32 + 0.2 * Math.sin(this.t * 26);
    }

    // вихревые пряди-хвосты невидимки
    const wisps = this.mesh.userData.wisps;
    if (wisps) {
      for (let i = 0; i < wisps.length; i++) {
        const w = wisps[i];
        w.material.opacity = Math.max(0.04, 0.15 + 0.1 * Math.sin(this.t * 3 + i * 1.2));
        w.rotation.x = w.userData.baseRotX + Math.sin(this.t * 3.5 + i * 2) * 0.14;
        w.rotation.z = Math.cos(this.t * 2.8 + i) * 0.08;
      }
    }

    // арбалетчик: отдача лука при выстреле
    if (this.mesh.userData.bow && this.mesh.userData.bowKick > 0) {
      this.mesh.userData.bowKick = Math.max(0, this.mesh.userData.bowKick - dt * 5);
      this.mesh.userData.bow.position.z = this.mesh.userData.bowBaseZ - this.mesh.userData.bowKick * 0.15 * this.r;
    }

    // покачивание колчана стрелка
    const quiver = this.mesh.userData.quiver;
    if (quiver) {
      quiver.rotation.z = Math.sin(this.t * 4) * 0.06;
    }

    // жрец: покачивание посоха
    const staff = this.mesh.userData.staff;
    if (staff) {
      staff.rotation.z = 0.4 + Math.sin(this.t * 3) * 0.08;
    }

    // столб молитвенного света жреца
    const prayerBeam = this.mesh.userData.prayerBeam;
    if (prayerBeam) {
      prayerBeam.rotation.y += dt * 0.8;
      prayerBeam.material.opacity = 0.12 + Math.sin(this.t * 2.5) * 0.04;
    }

    // вампир: пульс короны
    const crown = this.mesh.userData.crown;
    if (crown) {
      crown.scale.setScalar(1 + Math.sin(this.t * 3) * 0.12);
    }

    // кровавый туман вампира (медленный пульс)
    const bloodMist = this.mesh.userData.bloodMist;
    if (bloodMist) {
      bloodMist.material.opacity = 0.15 + 0.05 * Math.sin(this.t * 1.8);
      bloodMist.scale.setScalar(this.r * (2.2 + 0.2 * Math.sin(this.t * 1.5)));
    }

    // пульс ядра регенератора
    const core = this.mesh.userData.core;
    if (core) {core.scale.setScalar(1 + Math.sin(this.t * 5) * 0.25);}
    // спутники роя/регенератора вьются
    const sats = this.mesh.userData.satellites;
    if (sats) { sats.rotation.z += dt * 5; sats.rotation.x += dt * 1.6; }
    // кольца регенератора вращаются
    const rings = this.mesh.userData.coreRings;
    if (rings) {
      rings[0].rotation.x += dt * 2.4; rings[0].rotation.y += dt * 1.7;
      rings[1].rotation.x -= dt * 1.9; rings[1].rotation.y += dt * 1.2;
    }
    // миазмы регенератора (пульс в противофазе к ядру)
    const miasma = this.mesh.userData.miasma;
    if (miasma) {
      const p = 1 - Math.sin(this.t * 5) * 0.22;
      miasma.scale.setScalar(this.r * 1.4 * p);
      miasma.material.opacity = 0.18 + 0.12 * (1 - Math.sin(this.t * 5) * 0.5);
    }

    // нимб жреца крутится
    const halo = this.mesh.userData.halo;
    if (halo) {halo.rotation.z += dt * 1.5;}

    // ядовитый пузырёк паука пульсирует
    const venom = this.mesh.userData.venom;
    if (venom) {venom.scale.setScalar(1 + Math.sin(this.t * 4) * 0.18);}

    // ядовитая капельница паучихи
    const venomDrip = this.mesh.userData.venomDrip;
    if (venomDrip) {
      venomDrip.material.opacity = 0.5 + 0.3 * Math.sin(this.t * 4);
      venomDrip.scale.y = 1 + Math.sin(this.t * 4) * 0.2;
    }

    // светящаяся полоса на спинке паучонка
    const stripeGlow = this.mesh.userData.stripeGlow;
    if (stripeGlow) {
      stripeGlow.material.opacity = 0.55 + 0.35 * Math.sin(this.t * 7);
    }

    // HP-бар: цвет от зелёного к красному
    const f = this.hp / this.maxHp;
    const hidden = this.cloaked && !this.effects.revealed;
    if (f < 1 && !hidden) {
      this.hpFillS.visible = true;
      this.hpFillS.material.color.setHSL(0.34 * f, 0.85, 0.5);
      this.hpFillS.scale.x = 0.6 * Math.max(0.02, f);
    } else {
      this.hpFillS.visible = false;
    }
    // частицы активных эффектов — читаемость боя (огонь/яд/мороз)
    this.effectParticleT -= dt;
    if (this.effectParticleT <= 0) {
      this.effectParticleT = 0.35;
      const p = this.worldCtx.particles;
      if (p) {
        if (fx.burnT > 0) {
          p.spawn({ x: this.pos.x, y: this.pos.y + 0.2, z: this.pos.z, vx: (Math.random() - 0.5) * 0.6, vy: 0.9, vz: (Math.random() - 0.5) * 0.6, life: 0.5, size: 0.25, color: '#ff7a2a', gravity: 0 });
        } else if (fx.poisonT > 0) {
          p.spawn({ x: this.pos.x, y: this.pos.y + 0.2, z: this.pos.z, vx: (Math.random() - 0.5) * 0.4, vy: 0.5, vz: (Math.random() - 0.5) * 0.4, life: 0.6, size: 0.22, color: '#7be04a', gravity: 0 });
        } else if (fx.slow) {
          p.spawn({ x: this.pos.x, y: this.pos.y + 0.2, z: this.pos.z, vx: (Math.random() - 0.5) * 0.3, vy: 0.4, vz: (Math.random() - 0.5) * 0.3, life: 0.5, size: 0.2, color: '#5ac8ff', gravity: 0 });
        }
      }
    }
    // ориентация по движению
    if (!fx.lure) {
      this.path.tangentAtInto(this.progress, this._tgt);
      this.mesh.lookAt(this.pos.x + this._tgt.x, this.pos.y + this._tgt.y, this.pos.z + this._tgt.z);
    }
    // мерцание невидимки
    if (this.cloaked && !fx.revealed) {
      this.mesh.position.y += Math.sin(this.t * 6) * 0.04;
    }
  }

  applySlow(mult, dur) {
    const fx = this.effects;
    if (!fx.slow || fx.slow.mult < mult) {fx.slow = { mult, t: dur };}
    else {fx.slow.t = Math.max(fx.slow.t, dur);}
  }

  applyPoison(dps, dur) {
    const fx = this.effects;
    fx.poison = Math.max(fx.poison, dps);
    fx.poisonT = Math.max(fx.poisonT, dur);
  }

  applyBurn(dps, dur) {
    const fx = this.effects;
    fx.burn = Math.max(fx.burn, dps);
    fx.burnT = Math.max(fx.burnT, dur);
  }

  applyVuln(bonus, dur) {
    const fx = this.effects;
    fx.vuln = Math.max(fx.vuln, bonus);
    fx.vulnT = Math.max(fx.vulnT, dur);
  }

  takeDamage(amount, opts = {}) {
    if (!this.alive) {return 0;}
    const dmg = opts.dot ? amount : damageTaken(amount, this.armor, this.vulnBonus);
    this.hp -= dmg;
    // Вспышка при попадании: кратковременное свечение тела
    if (!opts.dot && this.mesh && this.mesh.userData.body) {
      const body = this.mesh.userData.body;
      if (body.material && body.material.emissive) {
        body.material.emissive.setHex(0xffffff);
        body.material.emissiveIntensity = 0.8;
        this._hitFlashTimer = 0.12;
      }
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
    }
    return dmg;
  }

  die() {
    if (!this.alive || this.dead) {return;}
    this.alive = false;
    this.dead = true;
    const ctx = this.worldCtx;
    ctx.onKill(this, this.reward);
  }

  // враг дошёл до кристалла
  dispose() {
    this.mesh.removeFromParent();
    this.mesh.traverse(o => {
      if (o.geometry) {o.geometry.dispose();}
      if (o.material) { const m = o.material; if (Array.isArray(m)) {m.forEach(x => x.dispose());} else {m.dispose();} }
    });
  }
}

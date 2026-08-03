// Враги: процедурные модели, полёт по пути, эффекты, боссы.
import * as THREE from 'three';

import { ENEMY_TYPES, scaledHp, scaledReward, effectiveSpeed, damageTaken } from '../core/enemies.js';
import { CRYSTAL } from '../core/layout.js';
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

// Пара крыльев (мотыльковые) — взмахи через rotation.x.
function makeWings(type, color, scale, opts = {}) {
  const tex = wingTex(color);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, opacity: opts.opacity ?? 0.85, side: THREE.DoubleSide, depthWrite: false,
  });
  const span = opts.span ?? 1.5, chord = opts.chord ?? 0.8;
  const geo = new THREE.PlaneGeometry(span, chord, 1, 1);
  const g = new THREE.Group();
  const flapFreq = opts.flapFreq ?? (type === 'swarm' ? 22 : (type === 'vampmoth' ? 7 : 12));
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(geo, mat);
    wing.position.x = side * span * 0.3;
    wing.rotation.y = side * (opts.sweep ?? 0.9);
    wing.geometry.translate(-span * 0.4 * side, 0, 0);
    wing.userData = { flapAmp: opts.flapAmp ?? (type === 'swarm' ? 1.4 : 0.85), flapFreq };
    g.add(wing);
    g.userData.wings = g.userData.wings || [];
    g.userData.wings.push(wing);
  }
  g.scale.setScalar(scale);
  return g;
}

// Глаза (светящиеся) спереди.
function addEyes(g, color, r, opts = {}) {
  const mat = new THREE.MeshBasicMaterial({ color });
  const n = opts.count ?? 2;
  for (let i = 0; i < n; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const k = Math.floor(i / 2);
    const eye = new THREE.Mesh(new THREE.SphereGeometry((opts.size ?? 0.08) * r * (1 - k * 0.3), 6, 6), mat);
    eye.position.set(side * (opts.side ?? 0.18) * r * (1 - k * 0.3), (opts.y ?? 0.12) * r, (opts.z ?? 0.55) * r);
    g.add(eye);
  }
}

// Клыки (для хищников) спереди снизу.
function addFangs(g, r, scale = 1) {
  const fangMat = new THREE.MeshStandardMaterial({ color: '#f2ece2', roughness: 0.25 });
  for (const side of [-1, 1]) {
    const fang = new THREE.Mesh(new THREE.ConeGeometry(r * 0.06 * scale, r * 0.3 * scale, 5), fangMat);
    fang.position.set(side * r * 0.13 * scale, -r * 0.05 * scale, r * 0.68 * scale);
    fang.rotation.x = -0.55;
    g.add(fang);
  }
}

function makeSpiderLegs(color, scale, count = 8) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  const g = new THREE.Group();
  const legGeo = new THREE.CylinderGeometry(0.035, 0.02, 0.55, 4);
  for (let i = 0; i < count; i++) {
    const leg = new THREE.Mesh(legGeo, mat);
    const side = i % 2 === 0 ? -1 : 1;
    const back = i < count / 2 ? 1 : -1;
    leg.position.set(side * 0.32, -0.18, back * 0.18);
    leg.rotation.z = side * (0.55 + (i % 4) * 0.22);
    leg.rotation.x = back * 0.3;
    g.add(leg);
  }
  g.scale.setScalar(scale);
  return g;
}

export function buildEnemyMesh(typeId, color, r) {
  const g = new THREE.Group();
  const dark = new THREE.Color(color).multiplyScalar(0.45).getStyle();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1, transparent: true });
  const userData = { type: 'moth', body: null, wings: null, flapFreq: 12, core: null };

  // --- бронежук: панцирь, без крыльев, 6 лапок ---
  if (typeId === 'beetle') {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.4 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(r * 0.55, 10, 8), mat);
    body.scale.set(1.5, 0.72, 1.2);
    body.position.y = r * 0.1;
    const shell = new THREE.Mesh(new THREE.SphereGeometry(r * 0.55, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    shell.scale.set(1.5, 0.95, 1.2);
    shell.position.y = r * 0.2;
    const legGeo = new THREE.CylinderGeometry(r * 0.03, r * 0.02, r * 0.42, 4);
    const legMat = new THREE.MeshStandardMaterial({ color: dark, roughness: 0.85 });
    for (let i = 0; i < 6; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(side * r * 0.48, -r * 0.2, (Math.floor(i / 2) - 1) * r * 0.34);
      leg.rotation.z = side * 0.85;
      g.add(leg);
    }
    // усики-рожки
    const antMat = new THREE.MeshStandardMaterial({ color: dark, roughness: 0.8 });
    for (const side of [-1, 1]) {
      const ant = new THREE.Mesh(new THREE.ConeGeometry(r * 0.04, r * 0.35, 4), antMat);
      ant.position.set(side * r * 0.2, r * 0.35, r * 0.5);
      ant.rotation.z = side * 0.7;
      g.add(ant);
    }
    // шипы на панцире
    const spikeMat = new THREE.MeshStandardMaterial({ color: dark, roughness: 0.6 });
    for (let i = 0; i < 5; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(r * 0.05, r * 0.22, 4), spikeMat);
      const ang = (i / 5) * Math.PI * 2 - Math.PI / 2;
      spike.position.set(Math.cos(ang) * r * 0.42, r * 0.34, Math.sin(ang) * r * 0.4);
      spike.rotation.z = -Math.cos(ang) * 0.8;
      spike.rotation.x = Math.sin(ang) * 0.8;
      g.add(spike);
    }
    addEyes(g, '#201a26', r, { size: 0.05, side: 0.22, y: 0.12, z: 0.55, count: 2 });
    g.add(body, shell);
    userData.body = body; userData.type = 'beetle'; userData.flapFreq = 0;
    g.userData = userData;
    return g;
  }

  // --- пауки: головогрудь + брюшко + 8 ног + клыки ---
  if (typeId === 'spider' || typeId === 'spiderling') {
    const isSpider = typeId === 'spider';
    const bodyMat2 = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.2 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 10, 8), bodyMat2);
    body.position.y = r * 0.08;
    const abd = new THREE.Mesh(new THREE.SphereGeometry(r * 0.55, 10, 8), bodyMat2);
    abd.position.set(0, r * 0.06, -r * 0.62);
    abd.scale.set(0.9, 0.85, 1.2);
    // узор на брюшке
    const pattern = new THREE.Mesh(new THREE.SphereGeometry(r * 0.3, 8, 8), new THREE.MeshBasicMaterial({
      color: isSpider ? '#ff3355' : '#ff8899', transparent: true, opacity: 0.85,
    }));
    pattern.position.set(0, r * 0.14, -r * 0.62);
    pattern.scale.set(0.7, 0.5, 0.8);
    const legCount = isSpider ? 8 : 6;
    const legs2 = makeSpiderLegs(dark, r, legCount);
    g.add(body, abd, pattern, legs2);
    // ядовитый пузырёк на брюшке (пульсирует)
    const venom = new THREE.Mesh(new THREE.SphereGeometry(r * 0.16, 8, 8), new THREE.MeshBasicMaterial({ color: '#88ff44', transparent: true, opacity: 0.9 }));
    venom.position.set(0, r * 0.24, -r * 0.62);
    g.add(venom);
    userData.venom = venom;
    // клыки
    addFangs(g, r, isSpider ? 1 : 0.7);
    // глаза: 2 больших + 4 маленьких
    addEyes(g, '#ff3355', r, { count: 2, size: 0.1, side: 0.2, y: 0.16, z: 0.55 });
    addEyes(g, '#ff8899', r, { count: 4, size: 0.05, side: 0.32, y: 0.08, z: 0.5 });
    userData.body = body; userData.type = 'spider'; userData.flapFreq = 0;
    g.userData = userData;
    return g;
  }

  // --- мотыльковые ---
  const body = new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 10, 8), bodyMat);
  body.scale.set(0.85, 0.8, 1.35);

  const wopts = {};
  let core = null;
  if (typeId === 'swarm') {
    wopts.span = 1.1; wopts.chord = 0.35; wopts.flapAmp = 1.5; wopts.flapFreq = 22;
    body.scale.set(0.6, 0.5, 1.8);
  } else if (typeId === 'cloak') {
    wopts.span = 1.9; wopts.chord = 0.35; wopts.opacity = 0.4; wopts.flapFreq = 16;
  } else if (typeId === 'regen') {
    wopts.flapFreq = 10;
  } else if (typeId === 'healer') {
    wopts.flapFreq = 9;
  } else if (typeId === 'ranger') {
    wopts.flapFreq = 13;
  } else if (typeId === 'vampmoth') {
    wopts.span = 2.1; wopts.chord = 1.0; wopts.flapFreq = 7; wopts.sweep = 1.2;
    body.scale.set(1.0, 0.9, 1.55);
  }
  const wings = makeWings(typeId, color, r * 1.05, wopts);

  // антенны
  const antMat = new THREE.MeshBasicMaterial({ color: dark });
  for (const side of [-1, 1]) {
    const ant = new THREE.Mesh(new THREE.ConeGeometry(r * 0.05, r * 0.5, 4), antMat);
    ant.position.set(side * r * 0.16, r * 0.42, r * 0.55);
    ant.rotation.z = side * 0.5;
    g.add(ant);
  }

  // глаза (у вампира — красные, у невидимки — голубые)
  const eyeColor = typeId === 'vampmoth' ? '#ff2244' : typeId === 'cloak' ? '#b8f0ff' : '#ffffff';
  addEyes(g, eyeColor, r, { count: 2, size: 0.08, side: 0.18, y: 0.12, z: 0.55 });

  // клыки вампира
  if (typeId === 'vampmoth') {
    addFangs(g, r, 1.2);
    // тёмное брюшко сзади
    const abd = new THREE.Mesh(new THREE.SphereGeometry(r * 0.4, 8, 8), new THREE.MeshStandardMaterial({ color: '#5a0a14', roughness: 0.7 }));
    abd.position.set(0, 0, -r * 0.6);
    g.add(abd);
    // корона из шипов на голове
    const crownMat = new THREE.MeshBasicMaterial({ color: '#ff2244' });
    for (let i = 0; i < 3; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(r * 0.05, r * 0.28, 4), crownMat);
      const ang = (i - 1) * 0.55;
      spike.position.set(Math.sin(ang) * r * 0.24, r * 0.62, Math.cos(ang) * r * 0.12);
      spike.rotation.x = -Math.sin(ang) * 0.7;
      g.add(spike);
    }
  }

  // регенератор: пульсирующее ядро + вращающиеся кольца
  if (typeId === 'regen') {
    core = new THREE.Mesh(new THREE.SphereGeometry(r * 0.3, 8, 8), new THREE.MeshBasicMaterial({ color: '#ff4fa0' }));
    core.position.set(0, r * 0.1, r * 0.3);
    g.add(core);
    const ringMat = new THREE.MeshBasicMaterial({ color: '#ff4fa0', transparent: true, opacity: 0.7 });
    const r1 = new THREE.Mesh(new THREE.TorusGeometry(r * 0.42, 0.02, 5, 20), ringMat);
    const r2 = new THREE.Mesh(new THREE.TorusGeometry(r * 0.52, 0.015, 5, 20), ringMat);
    r1.position.copy(core.position);
    r2.position.copy(core.position);
    g.add(r1, r2);
    userData.coreRings = [r1, r2];
  }

  // жало роя
  if (typeId === 'swarm') {
    const stinger = new THREE.Mesh(new THREE.ConeGeometry(r * 0.06, r * 0.4, 5), new THREE.MeshBasicMaterial({ color: '#ffe98a' }));
    stinger.position.set(0, 0, -r * 0.9);
    stinger.rotation.x = Math.PI;
    g.add(stinger);
    // спутники роя — мелкие осы, вьются вокруг
    const satellites = new THREE.Group();
    const satMat = new THREE.MeshBasicMaterial({ color });
    for (let i = 0; i < 6; i++) {
      const sat = new THREE.Mesh(new THREE.SphereGeometry(r * 0.13, 5, 5), satMat);
      const a = (i / 6) * Math.PI * 2;
      sat.position.set(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72, 0);
      satellites.add(sat);
    }
    g.add(satellites);
    userData.satellites = satellites;
  }

  // шлейф невидимки
  if (typeId === 'cloak') {
    const trail = new THREE.Mesh(new THREE.ConeGeometry(r * 0.16, r * 0.9, 6), new THREE.MeshBasicMaterial({ color: '#9ac8ff', transparent: true, opacity: 0.25, depthWrite: false }));
    trail.position.set(0, 0, -r * 0.7);
    trail.rotation.x = Math.PI;
    g.add(trail);
  }

  // нимб жреца (аура лечения)
  if (typeId === 'healer') {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(r * 0.36, 0.025, 6, 18), new THREE.MeshBasicMaterial({ color: '#ffd94a' }));
    halo.position.y = r * 0.78;
    halo.rotation.x = Math.PI / 2.4;
    g.add(halo);
    userData.halo = halo;
    // посох в лапке
    const staffMat = new THREE.MeshStandardMaterial({ color: '#8a6a3a', roughness: 0.8 });
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.03, r * 0.05, r * 1.1, 5), staffMat);
    staff.position.set(r * 0.5, -r * 0.1, r * 0.4);
    staff.rotation.z = 0.5;
    const orb = new THREE.Mesh(new THREE.SphereGeometry(r * 0.12, 6, 6), new THREE.MeshBasicMaterial({ color: '#ffe98a' }));
    orb.position.set(r * 0.68, r * 0.45, r * 0.4);
    g.add(staff, orb);
  }

  // дротик стрелка (бьёт по кристаллу издалека)
  if (typeId === 'ranger') {
    const dart = new THREE.Mesh(new THREE.ConeGeometry(r * 0.05, r * 0.4, 5), new THREE.MeshBasicMaterial({ color: '#fff0c8' }));
    dart.position.set(0, r * 0.05, r * 0.72);
    dart.rotation.x = Math.PI / 2;
    g.add(dart);
    // рога-рогатка
    for (const side of [-1, 1]) {
      const fork = new THREE.Mesh(new THREE.ConeGeometry(r * 0.04, r * 0.3, 4), new THREE.MeshBasicMaterial({ color: '#d8b06a' }));
      fork.position.set(side * r * 0.16, r * 0.18, r * 0.62);
      fork.rotation.x = Math.PI / 2.6;
      fork.rotation.z = side * 0.5;
      g.add(fork);
    }
  }

  g.add(body, wings);
  userData.body = body; userData.wings = wings; userData.core = core;
  userData.flapFreq = wings.userData.wings[0].userData.flapFreq;
  g.userData = userData;
  return g;
}

export class Enemy {
  constructor(typeId, wave, path, scene, worldCtx) {
    this.typeId = typeId;
    const def = ENEMY_TYPES[typeId];
    const endless = wave > 10;
    this.maxHp = Math.round(scaledHp(def.hp, wave, endless));
    this.hp = this.maxHp;
    this.baseSpeed = def.speed;
    this.reward = Math.round(scaledReward(def.reward, wave, endless) * (worldCtx.moonRewardMul ?? 1));
    this.dmg = def.dmg;
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
    this.ranged = def.ranged || null;
    if (this.ranged) {this.rangedCd = 0;}
    this.healAura = def.healAura || 0;
    this.healAuraR = def.healAuraR || 0;
    this.healTick = 0;
    this.effectParticleT = 0;

    // позиция (чистый Vec3 для логики)
    this.pos = path.pointAt(0);

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
        const dir = fx.lure.pos.clone().sub(this.pos).normalize();
        this.pos.add(dir.scale(this.effSpeed * dt));
      }
      fx.lure.t -= dt;
      if (fx.lure.t <= 0) {fx.lure = null;}
    } else if (this.ranged && this.progress > 2 && this.pos.dist(CRYSTAL.pos) <= this.ranged.dist) {
      // стрелок: встал на дистанции и бьёт по кристаллу
      this.rangedCd -= dt;
      if (this.rangedCd <= 0) {
        this.rangedCd = this.ranged.cd;
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
      this.pos = this.path.pointAt(this.progress);
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
    // пульс ядра регенератора
    const core = this.mesh.userData.core;
    if (core) {core.scale.setScalar(1 + Math.sin(this.t * 5) * 0.25);}
    // спутники роя вьются
    const sats = this.mesh.userData.satellites;
    if (sats) { sats.rotation.z += dt * 5; sats.rotation.x += dt * 1.6; }
    // кольца регенератора вращаются
    const rings = this.mesh.userData.coreRings;
    if (rings) {
      rings[0].rotation.x += dt * 2.4; rings[0].rotation.y += dt * 1.7;
      rings[1].rotation.x -= dt * 1.9; rings[1].rotation.y += dt * 1.2;
    }
    // нимб жреца крутится
    const halo = this.mesh.userData.halo;
    if (halo) {halo.rotation.z += dt * 1.5;}
    // ядовитый пузырёк паука пульсирует
    const venom = this.mesh.userData.venom;
    if (venom) {venom.scale.setScalar(1 + Math.sin(this.t * 4) * 0.18);}
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
      const tgt = this.path.tangentAt(this.progress);
      this.mesh.lookAt(this.pos.x + tgt.x, this.pos.y + tgt.y, this.pos.z + tgt.z);
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

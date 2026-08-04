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
  const geo = new THREE.PlaneGeometry(1.1, 0.55, 1, 1);
  const g = new THREE.Group();
  for (const side of [-1, 1]) {
    const w = new THREE.Mesh(geo, mat);
    w.position.x = side * 0.34;
    w.rotation.y = side * 1.0;
    w.geometry.translate(-0.5 * side, 0, 0);
    g.add(w);
  }
  g.scale.setScalar(scale);
  return g;
}

let shadowTex = null;

export function buildTowerMesh(typeId, level, isAlpha = false) {
  const def = TOWER_TYPES[typeId];
  const color = isAlpha ? def.alpha.color : def.color;
  const glow = isAlpha ? def.alpha.glow : def.glow;
  const s = isAlpha ? 1.28 : 1;

  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.15, emissive: new THREE.Color(color).multiplyScalar(0.25), emissiveIntensity: 0.5 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), bodyMat);
  body.scale.set(0.9, 0.85, 1.3);
  g.add(body);

  // каменная подставка-постамент
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.12, 8),
    new THREE.MeshStandardMaterial({ color: 0x4a4a5e, roughness: 0.9 }));
  base.position.y = -0.24;
  g.add(base);

  const wingG = wings(color, s);
  g.add(wingG);

  // уши спереди
  const earMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.6) });
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 4), earMat);
    ear.position.set(side * 0.09, 0.2, 0.16);
    ear.rotation.z = side * 0.35;
    g.add(ear);
  }
  // глаза спереди
  const eyeMat = new THREE.MeshBasicMaterial({ color: glow });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), eyeMat);
    eye.position.set(side * 0.1, 0.03, 0.22);
    g.add(eye);
  }

  // ---- типовые аксессуары: у каждого стража свой силуэт (растут с уровнем) ----
  const spinRings = [];
  const orbitOrbs = [];
  if (typeId === 'screamer') {
    // сонарный излучатель перед мордой + кольца-резонаторы (растут с уровнем)
    const horn = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.015, 6, 16), new THREE.MeshBasicMaterial({ color: glow }));
    horn.position.set(0, 0.02, 0.3);
    g.add(horn);
    for (let i = 1; i < level; i++) {
      const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.1 + i * 0.06, 0.012, 6, 18),
        new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.6 }));
      ring2.position.set(0, 0.02, 0.3);
      ring2.rotation.x = Math.PI / 2;
      g.add(ring2);
      spinRings.push(ring2);
    }
  } else if (typeId === 'frost') {
    // ледяные шипы на спине (больше с уровнем)
    const iceMat = new THREE.MeshBasicMaterial({ color: '#c8f0ff' });
    for (let i = 0; i < level + 1; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.2, 5), iceMat);
      spike.position.set((i - 1) * 0.09, 0.3, -0.05 - i * 0.05);
      spike.rotation.x = -0.5;
      g.add(spike);
    }
  } else if (typeId === 'spore') {
    // грибная шляпка на голове + споры по бокам (+ мини-шляпки с уровнем)
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#4fae2a', roughness: 0.6 }));
    cap.position.y = 0.32;
    g.add(cap);
    const sporeMat = new THREE.MeshBasicMaterial({ color: '#c8ffa0' });
    for (const side of [-1, 1]) {
      const sp = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), sporeMat);
      sp.position.set(side * 0.18, 0.2, 0.05);
      g.add(sp);
    }
    for (let i = 1; i < level; i++) {
      const mini = new THREE.Mesh(new THREE.SphereGeometry(0.055 + i * 0.01, 7, 5, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: '#5fc03a', roughness: 0.6 }));
      mini.position.set(i % 2 === 0 ? -0.14 : 0.14, 0.24 + i * 0.05, -0.02);
      g.add(mini);
    }
  } else if (typeId === 'echo') {
    // сонарные кольца вокруг тела (растут с уровнем)
    for (let i = 0; i < level + 1; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34 + i * 0.1, 0.012, 5, 20),
        new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.75 - i * 0.2 }));
      ring.rotation.x = Math.PI / 2 + i * 0.3;
      ring.position.y = 0.06;
      g.add(ring);
      spinRings.push(ring);
    }
  } else if (typeId === 'fire') {
    // языки пламени на спине (больше с уровнем)
    const flameMat = new THREE.MeshBasicMaterial({ color: '#ffd0a0' });
    for (let i = 0; i < level + 1; i++) {
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.045 - i * 0.008, 0.22 + i * 0.04, 5), flameMat);
      flame.position.set((i - 1) * 0.1, 0.3, -0.08);
      flame.rotation.x = -0.45;
      g.add(flame);
    }
  } else if (typeId === 'lantern') {
    // светящийся шар-фонарь над головой + орбитальные огоньки (с уровнем)
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: '#fff6c8' }));
    ball.position.y = 0.36;
    g.add(ball);
    for (let i = 0; i < level; i++) {
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.9 }));
      orb.position.set(0.16, 0.36, 0);
      g.add(orb);
      orbitOrbs.push(orb);
    }
  } else if (typeId === 'vampire') {
    // клыки + шипы-«крылья» на спине (с уровнем)
    const fangMat = new THREE.MeshStandardMaterial({ color: '#f2ece2', roughness: 0.25 });
    for (const side of [-1, 1]) {
      const fang = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 5), fangMat);
      fang.position.set(side * 0.05, 0.0, 0.24);
      fang.rotation.x = -0.5;
      g.add(fang);
    }
    const wingSpikeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.45) });
    for (let i = 1; i < level; i++) {
      for (const side of [-1, 1]) {
        const spk = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.16, 4), wingSpikeMat);
        spk.position.set(side * 0.22, 0.1, -0.12 - i * 0.06);
        spk.rotation.z = side * 0.9;
        g.add(spk);
      }
    }
  }

  // пипсы уровня
  const pips = [];
  for (let i = 0; i < MAX_LEVEL; i++) {
    const pip = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), new THREE.MeshBasicMaterial({ color: 0x334455 }));
    pip.position.set((i - 1) * 0.15, 0.37, 0);
    g.add(pip);
    pips.push(pip);
  }
  setPips(pips, level, glow);

  // аура альфы
  let aura = null;
  if (isAlpha) {
    const crown = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.03, 6, 18), new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.9 }));
    crown.rotation.x = Math.PI / 2;
    crown.position.y = 0.3;
    g.add(crown);
    aura = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(glow, '#ffffff'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.35,
    }));
    aura.scale.setScalar(1.9);
    aura.userData.pickable = false; // декор — не перехватывать клики
    g.add(aura);
  }

  g.scale.setScalar(s);
  g.userData = { body, wings: wingG, pips, aura, glow, spinRings, orbitOrbs };
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
    this.pickBox = new THREE.Box3().setFromObject(this.mesh);
    this.pips = this.mesh.userData.pips;
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
    for (const w of wings2) {
      w.rotation.x = Math.sin(this.t * 6) * 0.55;
    }
    this.mesh.position.y = this.pos.y + 0.35 + Math.sin(this.t * 2.4) * 0.05;

    // вращение сонарных колец (Визгун/Эхо)
    const spinRings = this.mesh.userData.spinRings;
    if (spinRings) {
      spinRings.forEach((r, i) => { r.rotation.z += dt * (i % 2 === 0 ? 1 : -1) * 1.5; });
    }
    // орбитальные огоньки Фонаря
    const orbitOrbs = this.mesh.userData.orbitOrbs;
    if (orbitOrbs) {
      orbitOrbs.forEach((o, i) => {
        const a = this.t * 2.2 + (i / orbitOrbs.length) * Math.PI * 2;
        o.position.set(Math.cos(a) * 0.17, 0.36 + Math.sin(this.t * 3 + i) * 0.03, Math.sin(a) * 0.17);
      });
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

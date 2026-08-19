// Снаряды: болты, огненные шары, пульсы. Гоминг по цели, взрывы по площади.
import * as THREE from 'three';

import { glowTexture } from '../world/textures.js';

let sharedGlow = null;
function glowMap(color) {
  if (!sharedGlow) {sharedGlow = new Map();}
  if (!sharedGlow.has(color)) {sharedGlow.set(color, glowTexture(color, '#ffffff'));}
  return sharedGlow.get(color);
}

const RADIUS = 0.16;

export class Projectile {
  constructor(scene, opts) {
    this.kind = opts.kind || 'bolt';
    this.damage = opts.damage;
    this.speed = opts.speed || 14;
    this.target = opts.target;      // враг или точка {pos}
    this.pos = opts.pos.clone();
    this.scene = scene;
    this.dead = false;
    this.color = opts.color || '#ff5a4e';
    this.onHit = opts.onHit || null;
    this.splash = opts.splash || 0;
    this.slow = opts.slow || 0;
    this.slowDur = opts.slowDur || 1.5;
    this.poison = opts.poison || 0;
    this.vuln = opts.vuln || 0;
    this.vulnDur = opts.vulnDur || 3;
    this.chain = opts.chain || 0;
    this.chainRange = opts.chainRange || 4;

    // визуал
    const mat = new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.95 });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(RADIUS, 8, 8), mat);
    this.mesh.position.copy(this.pos);
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowMap(this.color), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    }));
    this.glow.scale.setScalar(RADIUS * 5);
    // ВАЖНО: glow — дочерний объект mesh; позиция локальная (0,0,0).
    // Если скопировать сюда мировую позицию снаряда, свечение рендерится
    // в pos*2 — «дубль снаряда в стороне».
    this.mesh.add(this.glow);
    this.glow.position.set(0, 0, 0);
    scene.add(this.mesh);
    this.mat = mat;
  }

  // цель — точка (для пульсов цель двигается вперёд)
  update(dt) {
    if (this.dead) {return;}
    if (this.kind === 'pulse') {
      this.radius += dt * this.speed;
      this.glow.scale.setScalar(this.radius * 1.4);
      this.mesh.visible = false;
      return;
    }
    const tPos = this.target?.alive ? this.target.pos : this.target?.pos;
    if (!tPos) { this.kill(); return; }
    const dir = tPos.clone().sub(this.pos);
    const dist = dir.len();
    if (dist < 0.01) { this.hit(); return; }
    const step = this.speed * dt;
    if (step >= dist) {
      this.pos.copy(tPos);
      this.hit();
      return;
    }
    this.pos.add(dir.normalize().scale(step));
    this.mesh.position.copy(this.pos);
    // Лёгкий trail: пульсация свечения
    const pulse = 1 + Math.sin(performance.now() * 0.02) * 0.15;
    this.glow.scale.setScalar(RADIUS * 5 * pulse);
  }

  hit() {
    if (this.dead) {return;}
    this.dead = true;
    if (this.onHit) {this.onHit(this);}
    this.dispose();
  }

  kill() {
    if (this.dead) {return;}
    this.dead = true;
    this.dispose();
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.glow.material.dispose();
  }
}

// Расширяющееся кольцо-пульс (Эхо / Фонарь).
export class PulseRing {
  constructor(scene, opts) {
    this.pos = opts.pos.clone();
    this.radius = 0.2;
    this.maxRadius = opts.radius;
    this.speed = opts.speed || 16;
    this.dead = false;
    this.onExpand = opts.onExpand || null;
    this.done = false;
    const ringGeo = new THREE.RingGeometry(0.92, 1, 40);
    this.mesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: opts.color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.copy(this.pos);
    this.mesh.position.y += 0.4;
    scene.add(this.mesh);
    this.color = opts.color;
  }

  update(dt) {
    if (this.dead) {return;}
    this.radius += this.speed * dt;
    this.mesh.scale.setScalar(this.radius);
    this.mesh.material.opacity = Math.max(0, 0.9 * (1 - this.radius / this.maxRadius));
    if (!this.done && this.radius >= this.maxRadius * 0.55) {
      this.done = true;
      if (this.onExpand) {this.onExpand(this.radius);}
    }
    if (this.radius >= this.maxRadius) {
      this.dead = true;
      this.dispose();
    }
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

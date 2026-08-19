// Пул частиц: один draw-call через ShaderMaterial (позиция/цвет/размер/альфа).
import * as THREE from 'three';

const VERT = `
attribute float aSize;
attribute vec3 aColor;
attribute float aAlpha;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (260.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv) * 2.0;
  float a = smoothstep(1.0, 0.1, d) * vAlpha;
  gl_FragColor = vec4(vColor, a);
}
`;

const MAX = 500;

export class ParticleSystem {
  constructor(scene) {
    this.pool = [];
    this.live = 0;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.color = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    for (let i = 0; i < MAX; i++) {
      this.pool.push({
        i, alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
        life: 0, maxLife: 1, size: 1, r: 1, g: 1, b: 1, gravity: 0, drag: 0,
      });
    }
  }

  spawn(o) {
    const p = this.pool[this.live];
    if (!p) {return;} // пул полон
    this.live++;
    p.alive = true;
    p.x = o.x; p.y = o.y; p.z = o.z;
    p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0;
    p.maxLife = p.life = o.life ?? 0.8;
    p.size = o.size ?? 0.3;
    const c = o.color ?? '#ffffff';
    p.r = parseInt(c.slice(1, 3), 16) / 255;
    p.g = parseInt(c.slice(3, 5), 16) / 255;
    p.b = parseInt(c.slice(5, 7), 16) / 255;
    p.gravity = o.gravity ?? 0;
    p.drag = o.drag ?? 0;
  }

  burst(o) {
    const count = o.count ?? 8;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const up = (Math.random() - 0.5) * (o.spreadY ?? 1);
      const speed = (o.speed ?? 2) * (0.4 + Math.random() * 0.8);
      this.spawn({
        x: o.x, y: o.y, z: o.z,
        vx: Math.cos(ang) * speed,
        vy: up * speed + (o.up ?? 0.5),
        vz: Math.sin(ang) * speed,
        life: o.life ?? 0.7, size: o.size ?? 0.35,
        color: o.color ?? '#ffffff',
        gravity: o.gravity ?? 1.5, drag: o.drag ?? 1,
      });
    }
  }

  // Кольцевой взрыв (ударная волна): частицы разлетаются кольцом в XZ.
  ring(o) {
    const count = o.count ?? 16;
    const speed = o.speed ?? 3;
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2;
      this.spawn({
        x: o.x, y: o.y, z: o.z,
        vx: Math.cos(ang) * speed,
        vy: 0,
        vz: Math.sin(ang) * speed,
        life: o.life ?? 0.4, size: o.size ?? 0.3,
        color: o.color ?? '#ffffff',
        gravity: 0, drag: 2,
      });
    }
  }

  // Направленный взрыв (в сторону от точки): для попаданий снарядов.
  directed(o) {
    const count = o.count ?? 6;
    for (let i = 0; i < count; i++) {
      const spread = (Math.random() - 0.5) * 1.5;
      const speed = (o.speed ?? 3) * (0.5 + Math.random() * 0.5);
      this.spawn({
        x: o.x, y: o.y, z: o.z,
        vx: (o.dx ?? 0) * speed + spread,
        vy: (o.dy ?? 0.5) * speed,
        vz: (o.dz ?? 0) * speed + spread,
        life: o.life ?? 0.3, size: o.size ?? 0.2,
        color: o.color ?? '#ffffff',
        gravity: 0.5, drag: 1.5,
      });
    }
  }

  update(dt) {
    let w = 0;
    for (let i = 0; i < this.live; i++) {
      const p = this.pool[i];
      p.life -= dt;
      if (p.life <= 0) {continue;} // мёртвая — слот будет перезаписан
      if (w !== i) { // компактизация: живые объекты к началу пула
        const t = this.pool[w];
        this.pool[w] = p;
        this.pool[i] = t;
      }
      if (p.drag) {
        const d = Math.max(0, 1 - p.drag * dt);
        p.vx *= d; p.vy *= d; p.vz *= d;
      }
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const j = w * 3;
      this.pos[j] = p.x; this.pos[j + 1] = p.y; this.pos[j + 2] = p.z;
      this.color[j] = p.r; this.color[j + 1] = p.g; this.color[j + 2] = p.b;
      this.size[w] = p.size * (0.5 + 0.5 * (p.life / p.maxLife));
      this.alpha[w] = Math.min(1, p.life / p.maxLife * 2);
      w++;
    }
    this.live = w;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.points.count = Math.max(1, this.live);
    this.points.visible = this.live > 0;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
    this.points.removeFromParent();
  }
}

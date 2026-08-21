import * as THREE from 'three';

// Вспомогательные векторы для устранения per-frame аллокаций
const _pv = new THREE.Vector3();
const _off = new THREE.Vector3();

export class Effects {
  constructor(camera, renderer) {
    this.camera = camera;
    this.renderer = renderer;
    this.shake = 0;
    this.flashEl = document.getElementById('fx-flash');
    this.bannerEl = document.getElementById('fx-banner');
    this.bannerSubEl = document.getElementById('fx-banner-sub');
    this.dmgPool = [];
    this.dmgWrap = document.getElementById('fx-damage');
    for (let i = 0; i < 24; i++) {
      const el = document.createElement('div');
      el.className = 'dmg-num';
      el.style.display = 'none';
      this.dmgWrap.appendChild(el);
      this.dmgPool.push({ el, active: false, t: 0, x: 0, y: 0, vy: 0, life: 1 });
    }
    this.bannerTimer = 0;
  }

  addShake(amount) { this.shake = Math.min(1, this.shake + amount); }

  flash(color = 'rgba(255,60,60,0.35)') {
    this.flashEl.style.background = color;
    this.flashEl.style.opacity = 1;
  }

  showBanner(title, sub, color = '#66e0ff', dur = 3.2) {
    this.bannerEl.textContent = title;
    this.bannerEl.style.color = color;
    this.bannerSubEl.textContent = sub || '';
    this.bannerEl.parentElement.classList.add('show');
    this.bannerTimer = dur;
  }

  damageNumber(pos3, text, color = '#ffffff', big = false) {
    const p = this.dmgPool.find(p => !p.active) ?? this.dmgPool[0];
    if (pos3.isVector3 || pos3 instanceof THREE.Vector3) {
      _pv.copy(pos3).project(this.camera);
    } else {
      _pv.set(pos3.x, pos3.y, pos3.z).project(this.camera);
    }
    const w = this.renderer.domElement.clientWidth, h = this.renderer.domElement.clientHeight;
    p.active = true;
    p.t = 0;
    p.life = big ? 1.1 : 0.8;
    p.x = (_pv.x * 0.5 + 0.5) * w;
    p.y = (-_pv.y * 0.5 + 0.5) * h;
    p.vy = 42;
    p.el.textContent = text;
    p.el.style.color = color;
    p.el.style.fontSize = big ? '26px' : '15px';
    p.el.style.display = 'block';
    p.el.style.transform = `translate(${p.x}px, ${p.y}px)`;
  }

  update(dt) {
    // тряска
    this.shake = Math.max(0, this.shake - dt * 2.2);
    // вспышка
    const fo = parseFloat(this.flashEl.style.opacity || 0);
    if (fo > 0) {this.flashEl.style.opacity = Math.max(0, fo - dt * 2.5);}
    // баннер
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) {this.bannerEl.parentElement.classList.remove('show');}
    }
    // урон
    for (const p of this.dmgPool) {
      if (!p.active) {continue;}
      p.t += dt;
      if (p.t >= p.life) { p.active = false; p.el.style.display = 'none'; continue; }
      p.y -= p.vy * dt;
      p.vy *= Math.max(0, 1 - dt * 3);
      const s = p.t < 0.1 ? 1.2 : 1;
      p.el.style.transform = `translate(${p.x}px, ${p.y}px) scale(${s})`;
    }
  }

  // применяет тряску к камере, возвращает вектор смещения
  shakeOffset() {
    if (this.shake <= 0) {return null;}
    const a = this.shake * 0.35;
    return _off.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, 0);
  }
}

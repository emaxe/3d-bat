// Генерация всех текстур через Canvas 2D — ноль файлов ассетов.
import * as THREE from 'three';

import { mulberry32 } from '../core/rng.js';

function canvas2d(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

// Нормализация цвета для Canvas API: числа (0xffb066) -> '#ffb066', строки пропускаем.
function toCss(color, fallback = '#ffffff') {
  if (typeof color === 'number') {return '#' + color.toString(16).padStart(6, '0');}
  return color ?? fallback;
}

function toTexture(c, opts = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (opts.repeat) {t.repeat.set(opts.repeat[0], opts.repeat[1]);}
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Значение шума Вернона: грид строится ОДИН раз, дальше — только выборка.
function makeValueNoise(seed) {
  const rnd = mulberry32(seed);
  const grid = new Float32Array(128 * 128);
  for (let i = 0; i < grid.length; i++) {grid[i] = rnd();}
  return function (x, y) {
    const gx = Math.floor(x), gy = Math.floor(y);
    const fx = x - gx, fy = y - gy;
    const ix = ((gx % 128) + 128) % 128, iy = ((gy % 128) + 128) % 128;
    const v00 = grid[iy * 128 + ix];
    const v10 = grid[iy * 128 + ((ix + 1) % 128)];
    const v01 = grid[((iy + 1) % 128) * 128 + ix];
    const v11 = grid[((iy + 1) % 128) * 128 + ((ix + 1) % 128)];
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return v00 + (v10 - v00) * sx + (v01 - v00) * sy + (v11 - v10 - v01 + v00) * sx * sy;
  };
}

// FBM с предсобранными октавами — готов к вызову на пиксель.
export function makeFbm(seed, octaves = 4) {
  const octs = [];
  for (let o = 0; o < octaves; o++) {octs.push(makeValueNoise(seed + o * 101));}
  return function (x, y) {
    let a = 0, amp = 0.5, freq = 1, sum = 0;
    for (let o = 0; o < octs.length; o++) {
      a += amp * octs[o](x * freq, y * freq);
      sum += amp;
      amp *= 0.5; freq *= 2.1;
    }
    return a / sum;
  };
}

// Кэш тяжёлых текстур уровня: создаются ОДИН раз на всю игру.
// disposeScene() НЕ освобождает текстуры из этого набора — иначе следующий
// уровень получит сломанные текстуры. Утечки GPU-памяти при переходах между
// уровнями на мобильных — причина «белого экрана» (контекст умирает).
export const cachedTextures = new Set();

// Каменная текстура с прожилками.
const rockCache = new Map();
export function rockTexture(seed = 7) {
  if (rockCache.has(seed)) {return rockCache.get(seed);}
  const [c, g] = canvas2d(256, 256);
  const img = g.createImageData(256, 256);
  const fbm5 = makeFbm(seed, 5);
  const fbm3 = makeFbm(seed + 5, 3);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const n = fbm5(x / 64, y / 64);
      const vein = Math.sin(x * 0.35 + y * 0.2 + fbm3(x / 30, y / 30) * 6) * 0.5 + 0.5;
      const r = Math.round(40 + n * 34 + vein * 14);
      const gg = Math.round(34 + n * 30 + vein * 10);
      const b = Math.round(52 + n * 40 + vein * 16);
      const i = (y * 256 + x) * 4;
      img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = toTexture(c, { repeat: [3, 3] });
  cachedTextures.add(t);
  rockCache.set(seed, t);
  return t;
}

const bumpCache = new Map();
export function rockBumpTexture(seed = 11) {
  if (bumpCache.has(seed)) {return bumpCache.get(seed);}
  const [c, g] = canvas2d(256, 256);
  const img = g.createImageData(256, 256);
  const fbm4 = makeFbm(seed, 4);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const n = fbm4(x / 42, y / 42);
      const i = (y * 256 + x) * 4;
      const v = Math.round(90 + n * 160);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = toTexture(c, { repeat: [3, 3] });
  cachedTextures.add(t);
  bumpCache.set(seed, t);
  return t;
}

// Гранёный кристалл.
const crystalCache = new Map();
export function crystalTexture(seed = 3) {
  if (crystalCache.has(seed)) {return crystalCache.get(seed);}
  const [c, g] = canvas2d(256, 256);
  const grad = g.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, '#0a2a3a');
  grad.addColorStop(0.5, '#1a5a7a');
  grad.addColorStop(1, '#0a2a3a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  // грани
  for (let i = 0; i < 14; i++) {
    const rnd = mulberry32(seed * 31 + i);
    const x = rnd() * 256, y = rnd() * 256, w = 30 + rnd() * 70, h = 30 + rnd() * 70;
    const lg = g.createLinearGradient(x, y, x + w, y + h);
    lg.addColorStop(0, `rgba(${120 + rnd() * 80},${220 + rnd() * 35},255,${0.25 + rnd() * 0.3})`);
    lg.addColorStop(1, 'rgba(0,20,40,0.25)');
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(x + w / 2, y);
    g.lineTo(x + w, y + h);
    g.lineTo(x, y + h);
    g.closePath();
    g.fill();
  }
  const t = toTexture(c);
  cachedTextures.add(t);
  crystalCache.set(seed, t);
  return t;
}

// Прозрачное крыло мыши с прожилками.
const wingCache2 = new Map();
export function wingTexture(color = '#7a6a9a') {
  const key = String(color);
  if (wingCache2.has(key)) {return wingCache2.get(key);}
  const [c, g] = canvas2d(128, 64);
  g.clearRect(0, 0, 128, 64);
  const grad = g.createRadialGradient(10, 32, 4, 64, 32, 58);
  grad.addColorStop(0, toCss(color));
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(64, 32, 56, 26, 0, 0, Math.PI * 2);
  g.fill();
  // прожилки
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.moveTo(12, 32);
    g.quadraticCurveTo(60 + i * 8, 10 + i * 5, 118, 20 + i * 6);
    g.stroke();
  }
  const t = toTexture(c);
  cachedTextures.add(t);
  wingCache2.set(key, t);
  return t;
}

// Радиальный спрайт свечения.
const glowCache2 = new Map();
export function glowTexture(color = '#ffffff', inner = '#ffffff') {
  const key = `${color}|${inner}`;
  if (glowCache2.has(key)) {return glowCache2.get(key);}
  const [c, g] = canvas2d(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, toCss(inner));
  grad.addColorStop(0.35, toCss(color));
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cachedTextures.add(t);
  glowCache2.set(key, t);
  return t;
}

// Кольцо (сонар, ауры). Кэшируется по цвету; регистрируется в cachedTextures,
// чтобы disposeScene() НЕ уничтожил текстуру при переходе между уровнями.
const ringCache = new Map();
export function ringTexture(color = '#66e0ff') {
  if (ringCache.has(color)) {return ringCache.get(color);}
  const [c, g] = canvas2d(128, 128);
  g.clearRect(0, 0, 128, 128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.72, 'rgba(0,0,0,0)');
  grad.addColorStop(0.78, toCss(color));
  grad.addColorStop(0.85, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cachedTextures.add(t);
  ringCache.set(color, t);
  return t;
}

// Мягкая тень-пятно под объектами (фейк-тени вместо shadow mapping).
// Одна общая текстура на всю игру — кэш + регистрация в cachedTextures.
let shadowTexCached = null;
export function shadowTexture() {
  if (shadowTexCached) {return shadowTexCached;}
  const [c, g] = canvas2d(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.28)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  cachedTextures.add(t);
  shadowTexCached = t;
  return t;
}

// Иконка башни: силуэт летучей мыши на круглом фоне (чистый canvas для DOM/UI).
export function towerIconCanvas(typeColor, glowColor, w = 96, h = 96) {
  const [c, g] = canvas2d(w, h);
  const cx = w / 2, cy = h / 2, r = w / 2 - 6;
  typeColor = toCss(typeColor);
  glowColor = toCss(glowColor);
  const bg = g.createRadialGradient(cx, cy, 2, cx, cy, r);
  bg.addColorStop(0, '#241a3a');
  bg.addColorStop(1, '#0d0918');
  g.fillStyle = bg;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = glowColor;
  g.lineWidth = 2.5;
  g.stroke();

  // крылья-дуги
  g.fillStyle = typeColor;
  g.beginPath();
  g.moveTo(cx, cy - 4);
  g.quadraticCurveTo(cx - 34, cy - 26, cx - 36, cy + 6);
  g.quadraticCurveTo(cx - 26, cy - 2, cx - 12, cy + 2);
  g.quadraticCurveTo(cx - 14, cy + 16, cx - 30, cy + 22);
  g.quadraticCurveTo(cx - 8, cy + 18, cx, cy + 8);
  g.quadraticCurveTo(cx + 8, cy + 18, cx + 30, cy + 22);
  g.quadraticCurveTo(cx + 14, cy + 16, cx + 12, cy + 2);
  g.quadraticCurveTo(cx + 26, cy - 2, cx + 36, cy + 6);
  g.quadraticCurveTo(cx + 34, cy - 26, cx, cy - 4);
  g.closePath();
  g.fill();

  // уши
  g.beginPath();
  g.moveTo(cx - 4, cy - 2);
  g.lineTo(cx - 8, cy - 16);
  g.lineTo(cx, cy - 6);
  g.lineTo(cx + 8, cy - 16);
  g.lineTo(cx + 4, cy - 2);
  g.closePath();
  g.fill();

  // глаза
  g.fillStyle = glowColor;
  g.beginPath(); g.arc(cx - 5, cy + 2, 2.6, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(cx + 5, cy + 2, 2.6, 0, Math.PI * 2); g.fill();

  return c;
}

export function towerIconTexture(typeColor, glowColor, w = 96, h = 96) {
  const c = towerIconCanvas(typeColor, glowColor, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

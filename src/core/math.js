// Чистая 3D-математика без зависимостей от three.js — ядро переносимо куда угодно.

export class Vec3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x; this.y = y; this.z = z;
  }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vec3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  scale(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  lenSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  len() { return Math.sqrt(this.lenSq()); }
  distSq(v) { const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z; return dx * dx + dy * dy + dz * dz; }
  dist(v) { return Math.sqrt(this.distSq(v)); }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  cross(v) {
    const { x, y, z } = this;
    return new Vec3(y * v.z - z * v.y, z * v.x - x * v.z, x * v.y - y * v.x);
  }
  normalize() {
    const l = this.len();
    if (l > 1e-8) this.scale(1 / l);
    return this;
  }
  lerp(v, t) {
    this.x += (v.x - this.x) * t;
    this.y += (v.y - this.y) * t;
    this.z += (v.z - this.z) * t;
    return this;
  }
  toArray() { return [this.x, this.y, this.z]; }
  static fromArray(a) { return new Vec3(a[0], a[1], a[2]); }
}

// Catmull-Rom сплайн по массиву контрольных точек -> равномерная выборка по дистанции.
// Крайние точки экстраполируются, чтобы старт/финиш имели нормальную касательную.
export function catmullRom(points, samplesPerSegment = 24) {
  const pts = points.map(p => (p instanceof Vec3 ? p.clone() : new Vec3(p[0], p[1], p[2])));
  const n = pts.length;
  // экстраполяция за края
  const pStart = pts[0].clone().sub(pts[1]).add(pts[0]);   // 2*p0 - p1
  const pEnd = pts[n - 1].clone().sub(pts[n - 2]).add(pts[n - 1]); // 2*pn-1 - pn-2
  const all = [pStart, ...pts, pEnd];
  const samples = [];
  for (let i = 1; i <= n - 1; i++) { // реальные сегменты pts[i-1]->pts[i]; крайние — только для касательных
    const p0 = all[i - 1];
    const p1 = all[i];
    const p2 = all[i + 1];
    const p3 = all[i + 2];
    for (let j = 0; j < samplesPerSegment; j++) {
      const t = j / samplesPerSegment;
      const t2 = t * t, t3 = t2 * t;
      samples.push(new Vec3(
        0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3)
      ));
    }
  }
  // последняя точка
  samples.push(pts[n - 1].clone());
  return samples;
}

// Путь с прогрессом по дистанции (равномерная скорость вдоль кривой).
export class Path {
  constructor(points, samplesPerSegment = 24) {
    this.raw = points.map(p => (p instanceof Vec3 ? p.clone() : new Vec3(p[0], p[1], p[2])));
    this.samples = catmullRom(this.raw, samplesPerSegment);
    this.cum = new Float64Array(this.samples.length);
    this.length = 0;
    for (let i = 1; i < this.samples.length; i++) {
      this.length += this.samples[i].dist(this.samples[i - 1]);
      this.cum[i] = this.length;
    }
  }
  pointAt(dist) {
    const s = this.samples;
    const c = this.cum;
    if (dist <= 0) return s[0].clone();
    if (dist >= this.length) return s[s.length - 1].clone();
    let lo = 0, hi = s.length - 1;
    while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (c[mid] <= dist) lo = mid; else hi = mid; }
    const segLen = c[hi] - c[lo];
    const t = segLen > 1e-9 ? (dist - c[lo]) / segLen : 0;
    return s[lo].clone().lerp(s[hi], t);
  }
  // касательная (направление движения) в точке
  tangentAt(dist) {
    const a = this.pointAt(Math.max(0, dist - 0.2));
    const b = this.pointAt(Math.min(this.length, dist + 0.2));
    return b.sub(a).normalize();
  }
  // ближайшая точка кривой к заданной позиции (грубый перебор по выборке)
  nearest(pos, step = 1.2) {
    let bestD = Infinity, bestP = null;
    const n = this.samples.length;
    for (let d = 0; d <= this.length; d += step) {
      const p = this.samples[Math.min(n - 1, Math.round((d / this.length) * (n - 1)))];
      const dd = p.distSq(pos);
      if (dd < bestD) { bestD = dd; bestP = p; }
    }
    return bestP;
  }
  distanceToPoint(pos, step = 1.2) {
    let bestD = Infinity;
    const n = this.samples.length;
    for (let d = 0; d <= this.length; d += step) {
      const p = this.samples[Math.min(n - 1, Math.round((d / this.length) * (n - 1)))];
      const dd = p.distSq(pos);
      if (dd < bestD) bestD = dd;
    }
    return Math.sqrt(bestD);
  }
}

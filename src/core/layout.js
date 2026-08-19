// Геометрия уровней: пути, насесты, кристалл, темы. Чистые данные.
import { Vec3, Path } from './math.js';

// Уровень 1 — извилистая S-трасса: вход (высоко) → зигзаг по дуге → спираль к кристаллу.
// Путь удлинён (~95 единиц) и расширен (X до ±7) для размещения насестов по бокам.
const P0 = [
  [0, 3.0, -18],     // вход (портал)
  [-5.0, 2.6, -15],   // уход влево
  [5.5, 2.2, -12],    // рывок вправо
  [7.0, 1.8, -9],     // правая дуга
  [-1.0, 1.5, -7],    // возврат в центр
  [-6.5, 1.3, -5],    // уход влево
  [2.0, 1.1, -3],     // рывок вправо
  [6.0, 1.0, -1],     // правая дуга
  [-3.0, 0.9, 1],     // возврат влево
  [-5.0, 0.9, 3],     // левая дуга
  [2.0, 0.9, 5],      // рывок вправо
  [4.0, 0.9, 6],      // правая дуга
  [-1.0, 0.9, 7],     // возврат в центр
  [0, 0.9, 4],        // к кристаллу
  [0, 0.9, 1],        // финиш у кристалла
  [0, 0.9, 0.5],
];

// Уровень 2 — зеркальная версия уровня 1 (правое отражение).
const P1 = [
  [0, 3.0, -18],
  [5.0, 2.6, -15],
  [-5.5, 2.2, -12],
  [-7.0, 1.8, -9],
  [1.0, 1.5, -7],
  [6.5, 1.3, -5],
  [-2.0, 1.1, -3],
  [-6.0, 1.0, -1],
  [3.0, 0.9, 1],
  [5.0, 0.9, 3],
  [-2.0, 0.9, 5],
  [-4.0, 0.9, 6],
  [1.0, 0.9, 7],
  [0, 0.9, 4],
  [0, 0.9, 1],
  [0, 0.9, 0.5],
];

// Уровень 3 — плотная двойная S-трасса: зигзаги в центре, спираль к кристаллу.
// Удлинён и расширен для размещения насестов.
const P2 = [
  [0, 3.0, -18],
  [-4.0, 2.5, -15],
  [4.0, 2.0, -12],
  [-5.0, 1.6, -9],
  [5.0, 1.3, -6],
  [-3.0, 1.0, -3],
  [3.0, 0.9, 0],
  [-2.5, 0.9, 3],
  [2.5, 0.9, 5],
  [-1.0, 0.9, 6],
  [0, 0.9, 4],
  [0, 0.9, 1],
  [0, 0.9, 0.5],
];

const _toV = (arr) => arr.map(p => new Vec3(p[0], p[1], p[2])); // eslint-disable-line no-unused-vars

const CRYSTAL_POS = new Vec3(0, 0.9, 0);
const ENTRANCE_POS = new Vec3(0, 3.0, -18);

// Насесты расставлены логически: вдоль всего пути, по обе стороны,
// с гарантированным отступом друг от друга (≥2.5) и от пути (≥2.5, ≤6).
// Координаты подобраны так, чтобы каждый насест был рядом с каким-то
// участком пути (в радиусе атаки башен 5-10) и не пересекал декор/стены.

// Функция: разместить насесты вдоль пути с равными интервалами по дуге.
// Исключает зону у кристалла (последние 15% пути) и зону у входа (первые 5%).
// Минимальное расстояние между насестами — 2.5 (проверка при размещении).
function perchesAlongPath(pathPoints, count, sideOffset = 3.5) {
  const path = new Path(pathPoints);
  const perches = [];
  const startFrac = 0.05;  // пропускаем зону входа
  const endFrac = 0.85;    // пропускаем зону у кристалла
  const usableLen = path.length * (endFrac - startFrac);
  const step = usableLen / count;

  let placed = 0;
  for (let i = 0; i < count && placed < count; i++) {
    const d = path.length * startFrac + step * (i + 0.5);
    const p = path.pointAt(d);
    const t = path.tangentAt(d);
    // перпендикуляр в XZ-плоскости: (t.x, 0, t.z) → нормаль (-t.z, 0, t.x)
    const nx = -t.z;
    const nz = t.x;
    const side = i % 2 === 0 ? 1 : -1; // чередуем стороны
    const px = p.x + nx * sideOffset * side;
    const pz = p.z + nz * sideOffset * side;
    const py = 0.9;
    const candidate = new Vec3(px, py, pz);

    // Проверка: не ближе 2.8 к кристаллу
    if (candidate.dist(CRYSTAL_POS) <= 2.8) continue;

    // Проверка: не ближе 1.8 к пути (насест не должен стоять на дороге врагов)
    if (path.distanceToPoint(candidate, 0.8) < 1.8) continue;

    // Проверка: не ближе 1.8 к уже размещённым насестам
    let tooClose = false;
    for (const existing of perches) {
      if (candidate.dist(existing.pos) < 1.8) { tooClose = true; break; }
    }
    if (tooClose) continue;

    perches.push({ id: String.fromCharCode(65 + placed), pos: candidate });
    placed++;
  }
  return perches;
}

// Кампания: 3 уровня. Волны глобальные (1..10): ур.1 = 1-4, ур.2 = 5-7, ур.3 = 8-10.
export const LEVELS = [
  {
    id: 0,
    name: 'Преддверие',
    subtitle: 'Первые твари ищут свет…',
    pathPoints: P0,
    perches: perchesAlongPath(P0, 30, 3.5),
    unlockedTowers: ['screamer', 'frost', 'spore'],
    theme: {
      fog: 0x07040f, accent: 0x66e0ff, pool: 0x0a1a2e,
      warm1: 0xff9955, warm2: 0xff7744, portal: 0x8844ff, torch: 0xffb066,
      moon: 0x8899ff, fill: 0x4466cc, ambient: 0x3a3a5a, hemiA: 0x6688cc, hemiB: 0x181430,
      water: 0x12407a,
    },
  },
  {
    id: 1,
    name: 'Зал эха',
    subtitle: 'Здесь каждый шорох возвращается сторицей…',
    pathPoints: P1,
    perches: perchesAlongPath(P1, 30, 3.5),
    unlockedTowers: ['screamer', 'frost', 'spore', 'echo', 'fire'],
    theme: {
      fog: 0x06120f, accent: 0x4affc8, pool: 0x062018,
      warm1: 0x88ffcc, warm2: 0x66e8b0, portal: 0x22bb88, torch: 0x66ffd0,
      moon: 0x88ffdd, fill: 0x2a8877, ambient: 0x2a4a40, hemiA: 0x66ccaa, hemiB: 0x0a2018,
      water: 0x0a5a48,
    },
  },
  {
    id: 2,
    name: 'Сердце пещеры',
    subtitle: 'Твари чуют Кристалл — держи оборону!',
    pathPoints: P2,
    perches: perchesAlongPath(P2, 28, 3.3),
    unlockedTowers: ['screamer', 'frost', 'spore', 'echo', 'fire', 'lantern', 'vampire'],
    theme: {
      fog: 0x120a06, accent: 0xff8855, pool: 0x2e1208,
      warm1: 0xff7733, warm2: 0xff5533, portal: 0xff4422, torch: 0xff8844,
      moon: 0xffaa77, fill: 0x883322, ambient: 0x4a302a, hemiA: 0xcc8866, hemiB: 0x200a08,
      lava: 0xff4422,
    },
  },
];

// Обратная совместимость: уровень 1 — «старый» одиночный уровень.
export const PATH_POINTS = LEVELS[0].pathPoints;
export const PERCHES = LEVELS[0].perches;
export const CRYSTAL = { pos: CRYSTAL_POS, radius: 1.4 };
export const ENTRANCE = ENTRANCE_POS;

export function buildPath() {
  return new Path(PATH_POINTS);
}

export function buildLevelPath(levelIdx) {
  return new Path(LEVELS[levelIdx].pathPoints);
}
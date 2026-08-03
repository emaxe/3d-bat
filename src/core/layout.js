// Геометрия уровней: пути, насесты, кристалл, темы. Чистые данные.
import { Vec3, Path } from './math.js';

// Контрольные точки 3D-пути уровня 1: вход (высоко) -> плавная S-трасса -> кристалл.
const P0 = [
  [0, 3.0, -18],
  [-2.5, 2.6, -13.5],
  [6.0, 2.2, -10.5],
  [8.0, 1.7, -7.0],
  [3.0, 1.4, -5.5],
  [-3.0, 1.3, -6.5],
  [-8.0, 1.2, -5.0],
  [-9.0, 1.1, -1.0],
  [-5.5, 1.0, 2.2],
  [-2.0, 0.9, 3.6],
  [1.8, 0.9, 4.2],
  [-0.2, 0.9, 1.6],
  [-0.3, 0.9, 0.7],
];

// Уровень 2 — зеркальная трасса (уровень 1 зеркален уровню 0).
const P1 = [
  [0, 3.0, -18],
  [2.5, 2.6, -13.5],
  [-6.0, 2.2, -10.5],
  [-8.0, 1.7, -7.0],
  [-3.0, 1.4, -5.5],
  [3.0, 1.3, -6.5],
  [8.0, 1.2, -5.0],
  [9.0, 1.1, -1.0],
  [5.5, 1.0, 2.2],
  [2.0, 0.9, 3.6],
  [-1.8, 0.9, 4.2],
  [0.2, 0.9, 1.6],
  [0.3, 0.9, 0.7],
];

// Уровень 3 — плотная двойная S-трасса у самого сердца пещеры.
const P2 = [
  [0, 3.0, -18],
  [-3.5, 2.5, -13.5],
  [3.5, 2.0, -10.5],
  [-2.0, 1.7, -7.5],
  [4.0, 1.4, -5.0],
  [-1.5, 1.2, -2.5],
  [3.0, 1.0, 0.0],
  [0.0, 0.9, 2.2],
  [0.0, 0.9, 1.0],
];

const _toV = (arr) => arr.map(p => new Vec3(p[0], p[1], p[2])); // eslint-disable-line no-unused-vars

const CRYSTAL_POS = new Vec3(0, 0.9, 0);
const ENTRANCE_POS = new Vec3(0, 3.0, -18);

// Кампания: 3 уровня. Волны глобальные (1..10): ур.1 = 1-4, ур.2 = 5-7, ур.3 = 8-10.
export const LEVELS = [
  {
    id: 0,
    name: 'Преддверие',
    subtitle: 'Первые твари ищут свет…',
    pathPoints: P0,
    perches: [
      { id: 'A', pos: new Vec3(-5.2, 0.6, -15.5) },
      { id: 'B', pos: new Vec3(2.5, 0.4, -15.0) },
      { id: 'C', pos: new Vec3(6.5, 1.0, -11.5) },
      { id: 'D', pos: new Vec3(-6.0, 1.3, -8.5) },
      { id: 'E', pos: new Vec3(0.5, 0.7, -7.5) },
      { id: 'F', pos: new Vec3(6.5, 1.1, -4.5) },
      { id: 'G', pos: new Vec3(-5.4, 1.0, -2.0) },
      { id: 'H', pos: new Vec3(4.8, 1.0, 1.8) },
      { id: 'I', pos: new Vec3(-5.0, 1.2, 4.2) },
      { id: 'J', pos: new Vec3(4.2, 0.9, 5.2) },
      { id: 'K', pos: new Vec3(-3.0, 0.8, 2.6) },
      { id: 'L', pos: new Vec3(0.6, 0.6, -4.2) },
      { id: 'M', pos: new Vec3(-2.2, 0.5, -12.0) },
      { id: 'N', pos: new Vec3(3.8, 0.6, -8.8) },
      { id: 'O', pos: new Vec3(-1.0, 0.9, 6.8) },
      { id: 'P', pos: new Vec3(2.2, 0.9, -2.6) },
    ],
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
    perches: [
      { id: 'A', pos: new Vec3(5.2, 0.6, -15.5) },
      { id: 'B', pos: new Vec3(-2.5, 0.4, -15.0) },
      { id: 'C', pos: new Vec3(-6.5, 1.0, -11.5) },
      { id: 'D', pos: new Vec3(6.0, 1.3, -8.5) },
      { id: 'E', pos: new Vec3(-0.5, 0.7, -7.5) },
      { id: 'F', pos: new Vec3(-6.5, 1.1, -4.5) },
      { id: 'G', pos: new Vec3(5.4, 1.0, -2.0) },
      { id: 'H', pos: new Vec3(-4.8, 1.0, 1.8) },
      { id: 'I', pos: new Vec3(5.0, 1.2, 4.2) },
      { id: 'J', pos: new Vec3(-4.2, 0.9, 5.2) },
      { id: 'K', pos: new Vec3(3.0, 0.8, 2.6) },
      { id: 'L', pos: new Vec3(-0.6, 0.6, -4.2) },
      { id: 'M', pos: new Vec3(2.2, 0.5, -12.0) },
      { id: 'N', pos: new Vec3(-3.8, 0.6, -8.8) },
      { id: 'O', pos: new Vec3(1.0, 0.9, 6.8) },
      { id: 'P', pos: new Vec3(-2.2, 0.9, -2.6) },
    ],
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
    perches: [
      { id: 'A', pos: new Vec3(-5.0, 0.8, -14.5) },
      { id: 'B', pos: new Vec3(1.0, 0.6, -14.8) },
      { id: 'C', pos: new Vec3(6.0, 0.9, -11.0) },
      { id: 'D', pos: new Vec3(-6.5, 1.0, -8.0) },
      { id: 'E', pos: new Vec3(2.0, 0.6, -7.8) },
      { id: 'F', pos: new Vec3(-5.0, 1.1, -4.0) },
      { id: 'G', pos: new Vec3(2.5, 0.8, -2.0) },
      { id: 'H', pos: new Vec3(-4.2, 0.9, 1.5) },
      { id: 'I', pos: new Vec3(3.5, 0.8, 3.2) },
      { id: 'J', pos: new Vec3(-2.5, 0.7, 3.6) },
      { id: 'K', pos: new Vec3(5.5, 1.0, -5.5) },
      { id: 'L', pos: new Vec3(-4.0, 0.6, -11.5) },
    ],
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

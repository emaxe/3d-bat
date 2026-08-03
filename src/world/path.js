// Визуализация 3D-пути: светящаяся лента + маркеры. Данные пути — из core.
import * as THREE from 'three';
import { LEVELS, buildPath, ENTRANCE, CRYSTAL } from '../core/layout.js';
import { Path } from '../core/math.js';
import { glowTexture } from './textures.js';

export function buildPathVisual(scene, cfg = null) {
  const path = cfg ? new Path(cfg.pathPoints) : buildPath();
  const curve = new THREE.CatmullRomCurve3(path.raw.map(p => new THREE.Vector3(p.x, p.y, p.z)));
  const ribbon = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 140, 0.1, 6, false),
    new THREE.MeshBasicMaterial({ color: 0x6a4ac8, transparent: true, opacity: 0.22, depthWrite: false })
  );
  scene.add(ribbon);

  // яркое ядро ленты — путь видно издалека
  const core = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 120, 0.05, 5, false),
    new THREE.MeshBasicMaterial({ color: 0x9a7aff, transparent: true, opacity: 0.5, depthWrite: false })
  );
  scene.add(core);

  // маркеры-точки вдоль пути
  const n = 26;
  const positions = new Float32Array(n * 3);
  const dotTex = glowTexture('#7a5aff', 'rgba(140,110,255,0.9)');
  const mat = new THREE.SpriteMaterial({
    map: dotTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5,
  });
  const dots = [];
  for (let i = 0; i < n; i++) {
    const d = (i / (n - 1)) * path.length;
    const p = path.pointAt(d);
    positions[i * 3] = p.x; positions[i * 3 + 1] = p.y; positions[i * 3 + 2] = p.z;
    const s = new THREE.Sprite(mat);
    s.position.set(p.x, p.y, p.z);
    s.scale.setScalar(0.28);
    dots.push(s);
    scene.add(s);
  }

  // стрелки направления движения (шевроны) — путь читается с одного взгляда
  const chevronGeo = new THREE.ConeGeometry(0.14, 0.4, 4);
  const chevronMat = new THREE.MeshBasicMaterial({
    color: 0xc4a0ff, transparent: true, opacity: 0.85, depthWrite: false,
  });
  const upV = new THREE.Vector3(0, 1, 0);
  const chevrons = [];
  const step = path.length / 11;
  for (let i = 1; i < 11; i++) {
    const d = i * step;
    const p = path.pointAt(d);
    const t = path.tangentAt(d);
    const cone = new THREE.Mesh(chevronGeo, chevronMat);
    cone.position.set(p.x, p.y + 0.22, p.z);
    cone.quaternion.setFromUnitVectors(upV, new THREE.Vector3(t.x, t.y, t.z));
    chevrons.push(cone);
    scene.add(cone);
  }

  // стрелка у конца пути (атака кристалла)
  const end = path.pointAt(path.length);

  return { path, curve, ribbon, core, dots, chevrons, end };
}

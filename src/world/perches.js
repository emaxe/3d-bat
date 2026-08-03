// Насесты — каменные столбы с маркером установки.
import * as THREE from 'three';
import { LEVELS, PERCHES } from '../core/layout.js';
import { glowTexture, ringTexture } from './textures.js';

export function buildPerches(scene, rockMat, cfg = null) {
  const perches = [];
  const FLOOR_Y = -1.35;
  const defs = cfg ? cfg.perches : PERCHES;
  const accent = cfg?.theme?.accent ?? 0x66e0ff;

  for (const def of defs) {
    const g = new THREE.Group();
    g.position.copy(def.pos);

    const h = def.pos.y - FLOOR_Y;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, h, 7), rockMat);
    pillar.position.y = -h / 2;
    g.add(pillar);

    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.42, 0.18, 8), rockMat);
    top.position.y = 0.05;
    g.add(top);

    // маркер-кольцо (подсвечивается в режиме стройки)
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.78, 24),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.22;
    g.add(ring);

    scene.add(g);
    perches.push({
      def, group: g, ring,
      occupied: false,
      setHighlight: (on) => { ring.material.opacity = on ? 0.85 : 0.0; },
    });
  }

  return perches;
}

// Подсветка доступных насестов при выборе башни.
export function highlightAvailable(perches, affordable) {
  for (const p of perches) {
    if (p.occupied) continue;
    p.setHighlight(affordable);
  }
}

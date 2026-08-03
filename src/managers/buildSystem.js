// BuildSystem: управление строительством башен, размещением, продажей, улучшением
import * as THREE from 'three';

import { TOWER_TYPES, upgradeCost, mergePartner, mergeCost } from '../core/towers.js';
import { sellPrice } from '../core/economy.js';
import { Tower } from '../entities/tower.js';
import { glowTexture } from '../world/textures.js';

export class BuildSystem {
  constructor(state, effects, sfx, particles, hud, panel, camera) {
    this.state = state;
    this.effects = effects;
    this.sfx = sfx;
    this.particles = particles;
    this.hud = hud;
    this.panel = panel;
    this.camera = camera;
    this.scene = null;

    this.buildMode = null;
    this.selectedTower = null;
    this.ghostRing = null;
    this.hintEl = null;
    this.lastHoverTower = null;
  }

  /**
   * Устанавливает активную сцену (меняется при переходе между уровнями).
   * Призрак башни живёт в сцене, поэтому его надо перевешивать при смене сцены.
   */
  setScene(scene) {
    this.scene = scene;
    if (this.ghostRing) {
      if (this.ghostRing.parent && this.ghostRing.parent !== scene) this.ghostRing.parent.remove(this.ghostRing);
      scene.add(this.ghostRing);
    }
  }

  /**
   * Входит в режим строительства
   * @param {string} typeId - ID типа башни
   * @param {object} def - определение башни
   * @param {Array} perches - массив насестов
   */
  enterBuildMode(typeId, def, perches) {
    this.sfx.init();
    this.sfx.click();
    
    const cost = this.buildCost(def);
    if (!this.state.canAfford(cost)) {
      this.hud?.showToast(`Не хватает ◆ ${cost} на «${def.name}»`, '#ff8899');
      return;
    }
    
    this.deselectTower();
    this.buildMode = typeId;
    
    // Подсветка доступных насестов
    for (const p of perches) {
      p.setHighlight(!p.occupied && this.state.canAfford(cost));
    }
    
    this.hintEl = this.hintEl || document.getElementById('build-hint');
    this.hintEl.textContent = `Разместите: ${def.name} (◆ ${cost}) — клик по насесту, Esc отмена`;
    this.hintEl.classList.add('show');
    
    // Призрак башни
    if (!this.ghostRing) {
      const tex = glowTexture('#66e0ff', 'rgba(150,230,255,0.7)');
      this.ghostRing = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.5 })
      );
      if (this.scene) this.scene.add(this.ghostRing);
    }
    this.ghostRing.visible = true;
  }

  /**
   * Выходит из режима строительства
   * @param {Array} perches - массив насестов
   */
  cancelBuildMode(perches) {
    if (!this.buildMode) {return;}

    this.buildMode = null;
    for (const p of (perches ?? [])) {
      p.setHighlight(false);
    }
    if (this.ghostRing) {
      this.ghostRing.visible = false;
    }
    this.hintEl?.classList.remove('show');
  }

  /**
   * Строит башню на насесте
   * @param {string} typeId - ID типа башни
   * @param {object} perch - насест
   * @param {THREE.Scene} scene - сцена
   * @returns {Tower|null} построенная башня
   */
  buildTower(typeId, perch, scene) {
    const def = TOWER_TYPES[typeId];
    const cost = this.buildCost(def);
    
    if (!this.state.spend(cost)) {
      return null;
    }
    
    const tower = new Tower(typeId, perch, scene);
    tower.spent = cost; // фактически заплачено (с учётом скидки)
    
    perch.occupied = true;
    perch.tower = tower;
    
    this.sfx.build();
    this.particles.burst({
      x: perch.def.pos.x,
      y: perch.def.pos.y + 0.6,
      z: perch.def.pos.z,
      count: 12,
      speed: 2,
      life: 0.6,
      size: 0.35,
      color: def.glow,
      gravity: 0.5
    });

    // режим строительства снимает вызывающий (game.js.cancelBuildMode с perches —
    // он же снимает подсветку насестов); здесь сбрасываем только состояние.
    this.buildMode = null;
    if (this.ghostRing) {
      this.ghostRing.visible = false;
    }
    this.hintEl?.classList.remove('show');
    return tower;
  }

  /**
   * Вычисляет стоимость с учётом скидок
   * @param {object} def - определение башни
   * @param {number} discount - скидка (0-1)
   * @returns {number}
   */
  buildCost(def, discount = 0) {
    return Math.round(def.cost * (1 - discount));
  }

  /**
   * Выбирает башню для взаимодействия
   * @param {Tower} tower - башня
   * @param {Array} allTowers - все башни для поиска партнёра для слияния
   */
  selectTower(tower, allTowers) {
    if (this.selectedTower === tower) {return;}
    
    if (this.selectedTower) {
      this.selectedTower.showRange(false);
    }
    
    this.selectedTower = tower;
    tower.showRange(true);
    
    const partner = mergePartner(tower, allTowers);
    this.panel.select(tower, partner);
  }

  /**
   * Отменяет выбор башни
   */
  deselectTower() {
    if (this.selectedTower) {
      this.selectedTower.showRange(false);
      this.selectedTower = null;
      this.panel.deselect();
    }
  }

  /**
   * Улучшает башню
   * @param {Tower} tower - башня
   * @param {object} particles - система частиц
   * @param {Array} towers - все башни (для поиска партнёра слияния)
   * @returns {boolean} успешно ли
   */
  upgradeTower(tower, particles, towers) {
    if (!tower || tower.isAlpha) {return false;}
    
    const cost = upgradeCost(tower.typeId, tower.level);
    if (!this.state.spend(cost)) {return false;}
    
    tower.upgrade();
    this.sfx.upgrade();
    
    particles.burst({
      x: tower.pos.x,
      y: tower.pos.y + 0.8,
      z: tower.pos.z,
      count: 10,
      speed: 1.6,
      life: 0.7,
      size: 0.3,
      color: TOWER_TYPES[tower.typeId].glow,
      gravity: 0
    });

    // обновить панель: партнёр для слияния мог появиться/измениться
    const partner = mergePartner(tower, towers ?? []);
    this.panel?.select(tower, partner);
    return true;
  }

  /**
   * Объединяет две башни
   * @param {Tower} tower - основная башня
   * @param {Tower} partner - башня-партнёр
   * @param {Function} removeTowerFn - функция удаления башни
   * @returns {boolean} успешно ли
   */
  mergeTowers(tower, partner, removeTowerFn) {
    if (!tower || !partner || !tower.alive || !partner.alive) {return false;}
    
    const cost = mergeCost(tower, partner);
    if (!this.state.spend(cost)) {return false;}
    
    // Удаляем партнёра
    removeTowerFn(partner);
    partner.perch.occupied = false;
    partner.perch.tower = null;
    
    // Превращаем эту в альфу
    const alpha = tower.becomeAlpha();
    this.sfx.merge();
    
    this.effects.showBanner(`🦇 ${alpha.name}!`, alpha.passive, alpha.color, 3.5);
    
    this.particles.burst({
      x: tower.pos.x,
      y: tower.pos.y + 1,
      z: tower.pos.z,
      count: 30,
      speed: 4,
      life: 1,
      size: 0.5,
      color: alpha.glow,
      gravity: 0
    });

    this.panel?.select(tower, null);
    return true;
  }

  /**
   * Продаёт башню
   * @param {Tower} tower - башня
   * @param {Array} perches - насесты
   * @returns {number} полученная эссенция
   */
  sellTower(tower, perches) {
    if (!tower) {return 0;}
    
    const refund = sellPrice(tower.spent);
    this.state.addEssence(refund);
    
    const perch = perches.find(p => p.tower === tower);
    if (perch) {
      perch.occupied = false;
      perch.tower = null;
    }
    
    this.deselectTower();
    this.sfx.coin();
    
    return refund;
  }

  /**
   * Обрабатывает наведение мыши на насест в режиме строительства
   * @param {number} x - координата X
   * @param {number} y - координата Y
   * @param {Array} perches - насесты
   * @param {THREE.Raycaster} raycaster - рейкастер
   * @param {THREE.Camera} camera - камера
   */
  handleBuildHover(x, y, perches, raycaster, camera) {
    if (!this.buildMode) {return null;}
    
    const perch = this.raycastPerch(x, y, perches, raycaster, camera);
    
    for (const p of perches) {
      p.setHighlight(p === perch);
    }
    
    if (this.ghostRing) {
      this.ghostRing.visible = !!perch;
      if (perch) {
        this.ghostRing.position.copy(perch.def.pos).setY(perch.def.pos.y + 0.5);
      }
    }
    
    return perch;
  }

  /**
   * Обрабатывает наведение мыши на башню
   * @param {number} x - координата X
   * @param {number} y - координата Y
   * @param {Array} towers - башни
   * @param {THREE.Raycaster} raycaster - рейкастер
   * @param {THREE.Camera} camera - камера
   */
  handleTowerHover(x, y, towers, raycaster, camera) {
    const t = this.raycastTower(x, y, towers, raycaster, camera);
    
    if (this.lastHoverTower && 
        this.lastHoverTower !== this.selectedTower && 
        this.lastHoverTower !== t) {
      this.lastHoverTower.showRange(false);
    }
    
    if (t && t !== this.selectedTower) {
      t.showRange(true);
    }
    
    this.lastHoverTower = t;
    return t;
  }

  /**
   * Raycast на насест
   */
  raycastPerch(x, y, perches, raycaster) {
    const ndc = this.toNdc(x, y);
    raycaster.setFromCamera(ndc, this.camera);
    
    const meshes = [];
    const perchByMesh = new Map();
    
    for (const p of perches) {
      if (p.occupied) {continue;}
      p.group.traverse(o => {
        if (o.isMesh) {
          meshes.push(o);
          perchByMesh.set(o, p);
        }
      });
    }
    
    if (!meshes.length) {return null;}
    
    const hits = raycaster.intersectObjects(meshes, false);
    if (!hits.length) {return null;}
    
    return perchByMesh.get(hits[0].object) || null;
  }

  /**
   * Raycast на башню.
   *
   * Проблема старого подхода: брался первый хит луча по мешам — у башен есть
   * выступающие части (крылья, ауры, тени), поэтому при плотной застройке клик
   * «перехватывала» соседняя башня. Теперь главный критерий — расстояние от
   * точки тапа на земле до позиции башни (порог 1.6), а пересечение мешей —
   * только фолбэк, если луч не попал в радиус ни одной башни.
   */
  raycastTower(x, y, towers, raycaster) {
    const ndc = this.toNdc(x, y);
    raycaster.setFromCamera(ndc, this.camera);

    // точка тапа на уровне центра башен (y ≈ 1.0)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.0);
    const groundHit = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, groundHit)) {
      let best = null;
      let bestD = 1.6;
      for (const t of towers) {
        if (!t.alive) {continue;}
        const dx = groundHit.x - t.pos.x;
        const dz = groundHit.z - t.pos.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < bestD) {bestD = d; best = t;}
      }
      if (best) {return best;}
    }

    // фолбэк: классический raycast по мешам
    const meshes = towers.filter(t => t.alive).map(t => t.mesh);
    const hits = raycaster.intersectObjects(meshes, true);
    if (!hits.length) {return null;}
    return towers.find(t =>
      t.mesh === hits[0].object ||
      t.mesh.children.includes(hits[0].object) ||
      this.isDescendant(hits[0].object, t.mesh)
    ) || null;
  }

  /**
   * Кандидаты на выбор: все живые башни в радиусе 2.8 от точки тапа,
   * отсортированные по близости. Нужно для циклического перебора
   * (повторный тап по группе башен выбирает следующую).
   */
  raycastTowerCandidates(x, y, towers, raycaster) {
    const ndc = this.toNdc(x, y);
    raycaster.setFromCamera(ndc, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.0);
    const groundHit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, groundHit)) {return [];}
    const out = [];
    for (const t of towers) {
      if (!t.alive) {continue;}
      const dx = groundHit.x - t.pos.x;
      const dz = groundHit.z - t.pos.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d <= 2.8) {out.push({ t, d });}
    }
    out.sort((a, b) => a.d - b.d);
    return out.map(o => o.t);
  }

  /**
   * Конвертирует экранные координаты в NDC
   */
  toNdc(x, y) {
    // Используем текущий размер окна
    return new THREE.Vector2(
      (x / window.innerWidth) * 2 - 1,
      -(y / window.innerHeight) * 2 + 1
    );
  }

  /**
   * Проверяет является ли объект потомком
   */
  isDescendant(child, root) {
    let o = child;
    while (o && o !== root) {o = o.parent;}
    return o === root;
  }

  /**
   * Обновляет призрак башни при изменении позиции камеры
   */
  updateGhostPosition(perch) {
    if (this.ghostRing && perch) {
      this.ghostRing.position.copy(perch.def.pos).setY(perch.def.pos.y + 0.5);
    }
  }

  /**
   * Сбрасывает состояние системы строительства
   */
  reset() {
    this.buildMode = null;
    this.selectedTower = null;
    if (this.ghostRing) {
      this.ghostRing.visible = false;
    }
    this.hintEl?.classList.remove('show');
  }
}

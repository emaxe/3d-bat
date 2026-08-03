// Оркестратор: волны, размещение, камера, ввод, уровни, победа/поражение.
import * as THREE from 'three';
import { GameState } from './core/state.js';
import { buildCave, updateCave } from './world/cave.js';
import { buildPathVisual } from './world/path.js';
import { buildPerches } from './world/perches.js';
import { TOWER_TYPES } from './core/towers.js';
import { killReward, ECONOMY, waveClearReward } from './core/economy.js';
import { wavePreview, TOTAL_WAVES } from './core/waves.js';
import { ENEMY_TYPES } from './core/enemies.js';
import { LEVELS, CRYSTAL, buildLevelPath } from './core/layout.js';
import { UPGRADE_POOL, pickUpgrades } from './core/upgrades.js';
import { mulberry32 } from './core/rng.js';
import { Enemy } from './entities/enemy.js';
import { ParticleSystem } from './entities/particles.js';
import { Effects } from './entities/effects.js';
import { Sfx } from './audio/sfx.js';
import { Music } from './audio/music.js';
import { Hud, buildBuildBar } from './ui/hud.js';
import { Menus } from './ui/menu.js';
import { TowerPanel } from './ui/towerpanel.js';
import { cachedTextures } from './world/textures.js';
import { CameraController } from './managers/cameraController.js';
import { WaveManager } from './managers/waveManager.js';
import { BuildSystem } from './managers/buildSystem.js';

export class Game {
  constructor(container) {
    this.container = container;
    // мобильные GPU слабее: меньше пикселей, без MSAA, без форсированного high-performance
    this.isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    // На телефонах стартуем с 1.0: буферы кадра вдвое меньше, чем при 1.25 —
    // слабые GPU теряют WebGL-контекст от переполнения памяти. Адаптивный
    // рендерер поднимет разрешение до 1.25 сам, если кадры быстрые.
    this.maxPixelRatio = this.isTouch ? 1.25 : 2;
    this.startPixelRatio = this.isTouch ? 1.0 : 2;
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isTouch,
      powerPreference: this.isTouch ? 'default' : 'high-performance',
    });
    // кинематографичный тонмаппинг: мягкие блики, глубокие тени
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.startPixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.renderer.domElement);

    // Потеря контекста (обычно — нехватка GPU-памяти на слабых телефонах):
    // показываем понятную ошибку вместо «белого экрана».
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      try {
        window.dispatchEvent(new ErrorEvent('error', {
          message: 'WebGL-контекст потерян (не хватило памяти GPU). Обновите страницу.',
          filename: 'webgl', lineno: 0,
        }));
      } catch { /* оверлей недоступен */ }
    });
    // Контекст вернулся (браузер освободил память) — перезапускаем начисто:
    // three.js восстановит контекст, но текстуры/состояние могли протухнуть.
    this.renderer.domElement.addEventListener('webglcontextrestored', () => {
      setTimeout(() => location.reload(), 400);
    });

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 120);
    this.cameraCtrl = new CameraController(this.camera, this.renderer.domElement);

    this.sfx = new Sfx();
    this.music = new Music(this.sfx);
    this.state = new GameState();
    this.effects = new Effects(this.camera, this.renderer);

    // коллекции сущностей (до buildLevel — на случай рекурсивных вызовов)
    this.enemies = [];
    this.towers = [];
    this.projectiles = [];
    this.pulses = [];
    this.gameTime = 0;
    this.kills = 0;
    this.continuing = false;
    this.running = false;
    this.raycaster = new THREE.Raycaster();
    this.hud = null;
    this.panel = null;
    this.menus = null;

    // менеджеры: строительство, камера, волны (hud/panel/particles подключаются позже)
    this.waves = new WaveManager(this.state, this.effects, this.sfx, null);
    this.build = new BuildSystem(this.state, this.effects, this.sfx, null, null, null, this.camera);

    // прогрессия кампании
    this.levelIndex = 0;
    this.levelCfg = LEVELS[0];
    this.essenceBonus = 0;
    this.levelUpgrades = [];

    // контекст для сущностей
    this.ctx = {
      scene: null,
      towers: this.towers,
      enemies: this.enemies,
      projectiles: this.projectiles,
      pulses: this.pulses,
      particles: this.particles,
      damageNumber: (p, t, c, big) => this.effects.damageNumber(p, t, c, big),
      sfx: this.sfx,
      onKill: (e, r) => this.onKill(e, r),
      onCrystalDamage: (dmg, pos) => this.enemyRangedHit(dmg, pos),
      moonSpeedMul: 1, moonRewardMul: 1, moonTowerMul: 1, cloakAll: false,
      towerDmgMul: 1, towerRateMul: 1, buildDiscount: 0,
    };

    this.buildLevel(0);
    this.ctx.scene = this.cave.scene;
    this.ctx.particles = this.particles;

    this.setupEvents();
    this.bindBonuses();
    this.hud = new Hud(this.state, this.sfx);
    this.hud.setLevel(this.levelIndex, this.levelCfg.name);
    buildBuildBar(this.levelCfg.unlockedTowers, this.ctx.buildDiscount, (id, def) => this.enterBuildMode(id, def));
    this.menus = new Menus((endless) => this.startGame(endless));
    this.panel = new TowerPanel(this.state, this.sfx, {
      upgrade: (t) => this.upgradeTower(t),
      merge: (t, partner) => this.mergeTowers(t, partner),
      sell: (t) => this.sellTower(t),
      deselect: () => this.deselectTower(),
    });
    // менеджеры получают ссылки на UI (создаются раньше, в конструкторе)
    this.build.hud = this.hud;
    this.build.panel = this.panel;
    this.waves.hud = this.hud;
    this.hud.el.next.addEventListener('click', () => this.skipDelay());
    this.state.on('gameover', () => {
      this.sfx.gameover();
      this.music.stop();
      this.saveProgress();
      this.menus.showGameOver(this.levelIndex, this.state.wave, this.kills);
    });
  }

  // ---------- состояние волн ----------
  startGame(endless = false) {
    this.sfx.init();
    this.music.start();
    this.running = true;
    if (endless && this.state.won) {
      // продолжение в бесконечном режиме: база сохраняется
      this.continuing = true;
      this.state.won = false;
      this.state.over = false;
      this.waves.setWaveDelay(3.0);
      this.effects.showBanner('Бесконечный режим', 'Волны всё сильнее…', '#ff9a2a', 3);
      return;
    }
    // полный сброс кампании
    this.essenceBonus = 0;
    this.levelUpgrades = [];
    this.state.maxHp = ECONOMY.startHp;
    this.ctx.towerDmgMul = 1;
    this.ctx.towerRateMul = 1;
    this.ctx.buildDiscount = 0;
    this.continuing = false;
    this.kills = 0;
    this.state.setWave(0);
    this.state.setMoon(null);
    this.state.essence = 0; // buildLevel даст стартовую для уровня 0
    this.buildLevel(0);
    this.state.won = false;
    this.state.over = false;
    this.state.combo = 0;
    this.state.spawning = false;
    this.state.paused = false;
    this.state.emit('combo', 0);
    this.waves.setWaveDelay(1.6);
  }

  // Строит сцену уровня idx: пещера (тема), путь, насесты, частицы, билд-бар.
  buildLevel(idx) {
    const cfg = LEVELS[idx];
    this.levelIndex = idx;
    this.levelCfg = cfg;
    this.clearEntities();
    if (this.cave) this.disposeScene(this.cave.scene);
    this.path = buildLevelPath(idx);
    this.cave = buildCave(cfg, this.path);
    this.pathVis = buildPathVisual(this.cave.scene, cfg);
    this.perches = buildPerches(this.cave.scene, this.cave.materials.rockMat, cfg);
    this.particles = new ParticleSystem(this.cave.scene);
    this.build.particles = this.particles;
    this.build.setScene(this.cave.scene);
    if (this.ctx) { this.ctx.scene = this.cave.scene; this.ctx.particles = this.particles; }
    if (this.hud) {
      buildBuildBar(cfg.unlockedTowers, this.ctx.buildDiscount, (id, def) => this.enterBuildMode(id, def));
      this.hud.setLevel(idx, cfg.name);
    }
    // сброс состояния уровня: волны НЕ трогаем (они глобальные 1..10),
    // эссенцию переносим (не меньше стартовой для уровня)
    this.state.spawning = false;
    this.state.paused = false;
    this.state.combo = 0;
    this.state.crystalHp = this.state.maxHp;
    this.state.essence = Math.max(ECONOMY.startEssence + this.essenceBonus, this.state.essence);
    this.state.emit('combo', 0);
    this.state.emit('hp', this.state.crystalHp, this.state.maxHp);
    this.state.emit('essence', this.state.essence);
    this.waves.reset();
    this.effects?.showBanner(`Ур.${idx + 1} · ${cfg.name}`, cfg.subtitle, cfg.theme.accent, 3.5);
    this.cameraCtrl?.reset();
  }

  // Освобождает геометрию/материалы/текстуры старой сцены при переходе между
  // уровнями. Кэшированные текстуры (cachedTextures) НЕ трогаем — они общие
  // для всех уровней и живут до конца игры (иначе следующий уровень сломается).
  disposeScene(scene) {
    scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (!m) continue;
          m.dispose();
          for (const t of [m.map, m.bumpMap, m.normalMap, m.emissiveMap, m.alphaMap]) {
            if (t && !cachedTextures.has(t)) t.dispose();
          }
        }
      }
    });
  }

  saveProgress() {
    const names = LEVELS.map(l => l.name);
    this.menus?.saveProgress({
      bestLevel: Math.max(this.levelIndex, 0),
      bestWave: Math.max(this.state.wave, 0),
      kills: Math.max(this.kills, 0),
      won: this.state.won,
      levelName: names[this.levelIndex] ?? '',
    });
  }

  // Пропустить ожидание между волнами (кнопка «▶ Волну!» / клавиша N).
  skipDelay() {
    if (!this.running || this.state.spawning || this.state.won || this.state.over || this.state.paused) return;
    if (this.waves.waveDelayLeft > 0) this.waves.skipDelay();
  }

  // Переключение скорости ×1 → ×2 → ×3 (клавиша Q).
  cycleSpeed() {
    if (!this.running) return;
    const next = this.state.speed === 1 ? 2 : this.state.speed === 2 ? 3 : 1;
    this.state.setSpeed(next);
    this.sfx.click();
  }

  clearEntities() {
    for (const e of this.enemies) e.dispose();
    for (const t of this.towers) t.dispose();
    for (const p of this.projectiles) p.dispose();
    for (const p of this.pulses) p.dispose();
    this.enemies.length = 0;
    this.towers.length = 0;
    this.projectiles.length = 0;
    this.pulses.length = 0;
    if (this.perches) for (const perch of this.perches) { perch.occupied = false; perch.tower = null; }
    this.deselectTower();
    this.cancelBuildMode();
    this.waves.reset();
  }

  startWave(wave) {
    this.waves.startWave(wave, this.ctx);
  }

  waveCleared() {
    const bonus = waveClearReward(this.state.wave);
    this.state.addEssence(bonus);
    this.effects.damageNumber(new THREE.Vector3(0, 2.4, 0), `+${bonus} ◆`, '#ffe9a0', true);
    if (this.state.wave >= TOTAL_WAVES && !this.continuing) {
      // кампания пройдена
      this.state.won = true;
      this.saveProgress();
      this.sfx.win();
      this.music.stop();
      this.menus.showWin(this.state.wave, this.kills);
      return;
    }
    // границы уровней: волна 4 = конец ур.1, волна 7 = конец ур.2
    if (!this.continuing && (this.state.wave === 4 || this.state.wave === 7)) {
      this.levelCleared();
      return;
    }
    this.waves.setWaveDelay(3.0);
    // выбор награды после 3/6/9 волн
    if (this.state.wave === 3 || this.state.wave === 6 || this.state.wave === 9) {
      this.showBonusChoice();
    }
  }

  // ---------- прогрессия уровней ----------
  levelCleared() {
    this.saveProgress();
    this.state.paused = true;
    this.showUpgradeChoice();
  }

  showUpgradeChoice() {
    const el = document.getElementById('levelup');
    if (!el) return;
    document.getElementById('levelup-title').textContent =
      `${this.levelCfg.name} отбит${this.levelIndex === 2 ? 'о' : ''}! Выбери одно улучшение на всю кампанию:`;
    const rng = mulberry32(777 + this.levelIndex * 131);
    const picks = pickUpgrades(UPGRADE_POOL, rng);
    for (let i = 0; i < 3; i++) {
      const u = picks[i];
      const btn = document.getElementById(`up-${i}`);
      btn.innerHTML = `<b>${u.icon} ${u.name}</b><br>${u.desc}`;
      btn.onclick = () => this.applyUpgrade(u);
    }
    el.classList.add('show');
  }

  applyUpgrade(u) {
    document.getElementById('levelup')?.classList.remove('show');
    this.levelUpgrades.push(u.id);
    if (u.id === 'gold') this.essenceBonus += 40;
    else if (u.id === 'crystal') {
      this.state.maxHp += 6;
      this.state.crystalHp = this.state.maxHp;
      this.state.emit('hp', this.state.crystalHp, this.state.maxHp);
    } else if (u.id === 'dmg') this.ctx.towerDmgMul *= 1.12;
    else if (u.id === 'discount') this.ctx.buildDiscount += 0.1;
    else if (u.id === 'rate') this.ctx.towerRateMul *= 1.08;
    this.sfx.coin();
    this.hud?.showToast(`${u.icon} ${u.name}`, '#ffe9a0');
    this.state.paused = false;
    if (this.levelIndex < LEVELS.length - 1) {
      // следующий уровень: защита от «белого экрана» — если построение падает,
      // показываем ошибку (main.js перехватит) и откатываемся на текущий уровень
      try {
        this.buildLevel(this.levelIndex + 1);
      } catch (err) {
        try { window.dispatchEvent(new ErrorEvent('error', { error: err, message: String((err && err.stack) || err), filename: 'applyUpgrade', lineno: 0 })); } catch { /* оверлей недоступен */ }
        try { this.buildLevel(this.levelIndex); } catch { /* остаёмся как есть */ }
      }
      this.waves.setWaveDelay(3.0);
    } else {
      // уровень 3 пройден, но до победы ещё волны 8–10 не все отбиты —
      // сюда попадаем только если TOTAL_WAVES совпал с границей (не случается)
      this.waves.setWaveDelay(3.0);
    }
  }

  // ---------- выбор награды ----------
  bindBonuses() {
    for (const kind of ['gold', 'repair', 'meteor']) {
      document.getElementById(`bonus-${kind}`)?.addEventListener('click', () => this.applyBonus(kind));
    }
  }

  showBonusChoice() {
    const el = document.getElementById('bonus');
    if (!el) return;
    document.getElementById('bonus-wave').textContent = `Волна ${this.state.wave} отбита! Выбери награду:`;
    el.classList.add('show');
    this.state.paused = true;
  }

  applyBonus(kind) {
    const el = document.getElementById('bonus');
    if (el) el.classList.remove('show');
    const at = new THREE.Vector3(0, 2.4, 0);
    if (kind === 'gold') {
      this.state.addEssence(60);
      this.sfx.coin();
      this.effects.damageNumber(at, '+60 ◆', '#ffe9a0', true);
    } else if (kind === 'repair') {
      this.state.healCrystal(6);
      this.sfx.coin();
      this.effects.damageNumber(at, '+6 Кристалл', '#37e0a0', true);
    } else if (kind === 'meteor') {
      for (const e of this.enemies) {
        if (e.alive) e.takeDamage(150);
      }
      this.sfx.explosion();
      this.effects.addShake(0.8);
      this.effects.flash();
    }
    this.state.paused = false;
  }

  // ---------- ввод ----------
  setupEvents() {
    const dom = this.renderer.domElement;
    // жесты и мультитач ведёт CameraController (tap/drag/pinch/pan)

    dom.addEventListener('pointerdown', e => this.onPointerDown(e));
    window.addEventListener('pointermove', e => this.onPointerMove(e));
    window.addEventListener('pointerup', e => this.onPointerUp(e));
    window.addEventListener('pointercancel', e => this.onPointerUp(e));
    dom.addEventListener('wheel', e => { e.preventDefault(); this.cameraCtrl.zoom(e.deltaY); }, { passive: false });
    dom.addEventListener('contextmenu', e => { e.preventDefault(); this.cancelBuildMode(); });
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') { this.cancelBuildMode(); this.deselectTower(); }
      // хоткеи управления (только в бою)
      if (this.running) {
        if (e.key === ' ') { e.preventDefault(); this.state.togglePause(); this.sfx.click(); return; }
        if (e.key === 'q' || e.key === 'Q') { this.cycleSpeed(); return; }
        if (e.key === 'n' || e.key === 'N') { this.skipDelay(); return; }
        if (/^[1-9]$/.test(e.key) && !this.state.over && !this.state.won) {
          const unlocked = this.levelCfg.unlockedTowers;
          const id = unlocked[Number(e.key) - 1];
          if (id && TOWER_TYPES[id]) { this.enterBuildMode(id, TOWER_TYPES[id]); return; }
        }
      }
      // WASD / стрелки — сдвиг уровня
      const panKeys = {
        w: [0, 16], s: [0, -16], a: [-16, 0], d: [16, 0],
        ArrowUp: [0, 16], ArrowDown: [0, -16], ArrowLeft: [-16, 0], ArrowRight: [16, 0],
      };
      const pk = panKeys[e.key];
      if (pk) { e.preventDefault(); this.cameraCtrl.pan(pk[0], pk[1]); }
    });
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.running) this.state.paused = true;
    });
  }

  onPointerDown(e) {
    if (!this.running) return;
    this.sfx.init();
    this.cameraCtrl.handlePointerDown(e);
    this.cameraCtrl.addPointer(e);
  }

  onPointerMove(e) {
    if (!this.running) return;
    this.cameraCtrl.handlePointerMove(e);
    // hover подсветка только мышью и вне жеста перетаскивания
    if (e.pointerType === 'mouse' && !this.cameraCtrl.dragging && this.cameraCtrl.gesture !== 'pan') {
      this.hover(e.clientX, e.clientY);
    }
  }

  onPointerUp(e) {
    if (!this.running) return;
    const res = this.cameraCtrl.handlePointerUp(e);
    if (!res) return;
    if (res.type === 'tap') {
      this.click(res.pos.x, res.pos.y);
    } else if (res.type === 'two-finger-tap') {
      // тап двумя пальцами — пауза
      this.state.togglePause();
      this.sfx.click();
    }
  }

  hover(x, y) {
    if (this.build.buildMode) {
      this.build.handleBuildHover(x, y, this.perches, this.raycaster, this.camera);
      return;
    }
    // подсветка радиуса при наведении на башню
    this.build.handleTowerHover(x, y, this.towers, this.raycaster, this.camera);
  }

  click(x, y) {
    if (this.build.buildMode) {
      const perch = this.build.raycastPerch(x, y, this.perches, this.raycaster);
      if (perch) {
        if (!perch.occupied && this.state.canAfford(this.buildCost(TOWER_TYPES[this.build.buildMode]))) {
          this.buildTower(this.build.buildMode, perch);
        } else if (perch.occupied) {
          this.hud?.showToast('Этот насест занят', '#ff8899');
          this.sfx.click();
        }
      }
      return;
    }
    const cands = this.build.raycastTowerCandidates(x, y, this.towers, this.raycaster);
    if (cands.length) {
      // По умолчанию — ближайшая к тапу. Если уже выбрана одна из группы —
      // повторный тап циклически перебирает остальные (иначе плотные
      // постройки невозможно выбрать).
      let t = cands[0];
      if (this.build.selectedTower && cands.includes(this.build.selectedTower)) {
        const i = cands.indexOf(this.build.selectedTower);
        t = cands[(i + 1) % cands.length];
      }
      this.selectTower(t);
    } else {
      this.deselectTower();
    }
  }

  // ---------- башни ----------
  buildCost(def) {
    return this.build.buildCost(def, this.ctx.buildDiscount ?? 0);
  }

  enterBuildMode(typeId, def) {
    this.build.enterBuildMode(typeId, def, this.perches);
  }

  cancelBuildMode() {
    this.build.cancelBuildMode(this.perches);
  }

  buildTower(typeId, perch) {
    const tower = this.build.buildTower(typeId, perch, this.cave.scene);
    if (tower) this.towers.push(tower);
    this.cancelBuildMode();
  }

  selectTower(tower) {
    this.build.selectTower(tower, this.towers);
  }

  deselectTower() {
    this.build.deselectTower();
  }

  upgradeTower(tower) {
    this.build.upgradeTower(tower, this.particles, this.towers);
  }

  mergeTowers(tower, partner) {
    this.build.mergeTowers(tower, partner, (t) => this.removeTower(t));
  }

  removeTower(tower) {
    const i = this.towers.indexOf(tower);
    if (i >= 0) this.towers.splice(i, 1);
    tower.dispose();
  }

  sellTower(tower) {
    if (!tower) return;
    this.build.sellTower(tower, this.perches);
    this.removeTower(tower);
  }

  updateBuildBarCosts() {
    // подсветка доступности карточек обновляется в hud.setEssence
  }

  // ---------- враги ----------
  onKill(enemy, baseReward) {
    this.kills++;
    this.state.addKill();
    const reward = killReward(baseReward, this.state.combo);
    this.state.addEssence(reward);
    this.sfx.death();
    this.particles.burst({
      x: enemy.pos.x, y: enemy.pos.y, z: enemy.pos.z,
      count: enemy.boss ? 30 : 8, speed: enemy.boss ? 5 : 2.5,
      life: 0.6, size: enemy.boss ? 0.6 : 0.3, color: ENEMY_TYPES[enemy.typeId].color, gravity: 0,
    });
    this.effects.damageNumber(enemy.pos, `+${reward} ◆`, '#ffe9a0');

    // босс
    if (enemy.boss && this.waves.currentBoss === enemy) this.waves.currentBoss = null;

    // паучиха распадается на паучат
    if (enemy.typeId === 'spider') {
      for (let i = 0; i < 4; i++) {
        const child = new Enemy('spiderling', this.state.wave, this.path, this.cave.scene, this.ctx);
        child.progress = enemy.progress;
        child.pos = this.path.pointAt(child.progress);
        this.enemies.push(child);
      }
      this.effects.showBanner('Паучиха повержена!', 'Из неё вылезают паучата…', '#ff3355', 2.5);
    }

    // вампир лечит кристалл (альфа — втрое + бонус эссенции)
    const vam = this.towers.find(t => t.alive && t.typeId === 'vampire');
    if (vam) {
      this.state.healCrystal(ECONOMY.crystalHealPerVampireKill * (vam.isAlpha ? 3 : 1));
      if (vam.isAlpha) {
        const bonus = Math.max(1, Math.round(reward * 0.5));
        this.state.addEssence(bonus);
        this.effects.damageNumber(enemy.pos, `+${bonus} ◆`, '#ff90a0');
      }
    }
    // грибница альфа-споры
    const sporeAlpha = this.towers.find(t => t.alive && t.typeId === 'spore' && t.isAlpha);
    if (sporeAlpha) {
      for (const e of this.enemies) {
        if (e.alive && e.pos.distSq(enemy.pos) <= 9) e.applyPoison(12, 3);
      }
    }

    enemy.dispose();
  }

  enemyReachedEnd(enemy) {
    const dmg = enemy.dmg;
    this.state.damageCrystal(dmg);
    this.sfx.hurt();
    this.effects.addShake(dmg >= 5 ? 0.7 : 0.35);
    this.effects.flash();
    this.particles.burst({ x: enemy.pos.x, y: enemy.pos.y, z: enemy.pos.z, count: 16, speed: 3.5, life: 0.7, size: 0.45, color: '#ff5566', gravity: 0 });
    this.effects.damageNumber(enemy.pos, `-${dmg} КР`, '#ff5566', true);
    enemy.dispose();
  }

  // Стрелок бьёт по кристаллу с дистанции.
  enemyRangedHit(dmg, pos) {
    if (!pos) pos = CRYSTAL.pos;
    this.state.damageCrystal(dmg);
    this.sfx.hurt();
    this.effects.addShake(0.25);
    this.particles.burst({ x: pos.x, y: pos.y + 0.5, z: pos.z, count: 8, speed: 3, life: 0.5, size: 0.3, color: '#ffb84a', gravity: 0 });
    this.effects.damageNumber(new THREE.Vector3(0, 2.4, 0), `-${dmg} КР`, '#ffb84a', true);
  }

  // ---------- цикл ----------
  update(dt) {
    if (!this.running) return;
    // синхронизация кнопки паузы (паузу может включить жест/скрытие вкладки)
    const pauseLabel = this.state.paused ? '▶' : '⏸';
    if (this.hud.el.pause.textContent !== pauseLabel) {
      this.hud.el.pause.textContent = pauseLabel;
      this.hud.el.pause.classList.toggle('on', this.state.paused);
    }
    if (this.state.paused || this.state.over) {
      this.renderer.render(this.cave.scene, this.camera);
      return;
    }
    dt = Math.min(dt, 0.05) * this.state.speed;
    this.gameTime += dt;
    this.state.tickCombo(dt);
    this.effects.update(dt);
    this.cameraCtrl.update(dt);

    // спавн волны
    if (this.waves.waveDelayLeft > 0 && !this.state.spawning && !this.state.won) {
      this.hud?.setWaveState(this.state.wave + 1, this.waves.waveDelayLeft, wavePreview(this.state.wave + 1));
      if (this.waves.updateWaveDelay(dt)) this.startWave(this.state.wave + 1);
    }
    this.waves.updateSpawning(dt, this.enemies, this.path, this.cave.scene, this.ctx);
    if (this.waves.checkWaveComplete(this.enemies)) this.waveCleared();

    // враги
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.alive) {
        if (e.reachedEnd) this.enemyReachedEnd(e);
        this.enemies.splice(i, 1);
        continue;
      }
      e.update(dt);
    }

    // башни
    for (const t of this.towers) if (t.alive) t.update(dt, this.ctx);

    // снаряды
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.update(dt);
      if (p.dead) this.projectiles.splice(i, 1);
    }
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i];
      p.update(dt);
      if (p.dead) this.pulses.splice(i, 1);
    }

    this.particles.update(dt);
    updateCave(this.cave, this.gameTime);

    // бар босса
    if (this.waves.currentBoss?.alive) {
      this.hud.updateBoss(this.waves.currentBoss.hp, this.waves.currentBoss.maxHp);
    } else if (this.waves.currentBoss) {
      this.waves.currentBoss = null;
    }

    // тряска камеры
    const off = this.effects.shakeOffset();
    if (off) this.camera.position.add(off);

    this.renderer.render(this.cave.scene, this.camera);
  }

  loop = (time) => {
    requestAnimationFrame(this.loop);
    const dt = this.lastTime ? Math.min((time - this.lastTime) / 1000, 0.1) : 0;
    this.lastTime = time;
    this.update(dt);
    // адаптивное разрешение: FPS упал — снижаем pixelRatio, восстановился — поднимаем
    this._fpsAcc = (this._fpsAcc || 0) + dt;
    this._fpsFrames = (this._fpsFrames || 0) + 1;
    if (this._fpsFrames >= 90) {
      const avgMs = (this._fpsAcc / this._fpsFrames) * 1000;
      const cur = this.renderer.getPixelRatio();
      if (avgMs > 38 && cur > 0.7) {
        this.renderer.setPixelRatio(Math.max(0.7, cur * 0.8));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
      } else if (avgMs < 20 && cur < this.maxPixelRatio - 0.05) {
        this.renderer.setPixelRatio(Math.min(this.maxPixelRatio, cur * 1.1));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
      }
      this._fpsAcc = 0;
      this._fpsFrames = 0;
    }
  };

  start() {
    requestAnimationFrame(this.loop);
    this.menus.showMenu();
  }
}


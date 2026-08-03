// Оркестратор: волны, размещение, камера, ввод, уровни, победа/поражение.
import * as THREE from 'three';
import { GameState } from './core/state.js';
import { buildCave, updateCave } from './world/cave.js';
import { buildPathVisual } from './world/path.js';
import { buildPerches, highlightAvailable } from './world/perches.js';
import { TOWER_TYPES } from './core/towers.js';
import { upgradeCost, mergePartner, mergeCost, MAX_LEVEL } from './core/towers.js';
import { sellPrice, killReward, ECONOMY, waveClearReward } from './core/economy.js';
import { waveSpawns, wavePreview, moonForWave, MOON_PHASES, TOTAL_WAVES } from './core/waves.js';
import { ENEMY_TYPES } from './core/enemies.js';
import { LEVELS, CRYSTAL, buildLevelPath } from './core/layout.js';
import { UPGRADE_POOL, pickUpgrades } from './core/upgrades.js';
import { mulberry32 } from './core/rng.js';
import { Enemy } from './entities/enemy.js';
import { Tower } from './entities/tower.js';
import { ParticleSystem } from './entities/particles.js';
import { Effects } from './entities/effects.js';
import { Sfx } from './audio/sfx.js';
import { Music } from './audio/music.js';
import { Hud, buildBuildBar } from './ui/hud.js';
import { Menus } from './ui/menu.js';
import { TowerPanel } from './ui/towerpanel.js';
import { glowTexture, cachedTextures } from './world/textures.js';

export class Game {
  constructor(container) {
    this.container = container;
    // мобильные GPU слабее: меньше пикселей, без MSAA, без форсированного high-performance
    this.isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    this.maxPixelRatio = this.isTouch ? 1.5 : 2;
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isTouch,
      powerPreference: this.isTouch ? 'default' : 'high-performance',
    });
    // кинематографичный тонмаппинг: мягкие блики, глубокие тени
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.maxPixelRatio));
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

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 120);
    this.cameraRig = new CameraRig(this.camera, this.renderer.domElement);

    this.sfx = new Sfx();
    this.music = new Music(this.sfx);
    this.state = new GameState();
    this.effects = new Effects(this.camera, this.renderer);

    // коллекции сущностей (до buildLevel — на случай рекурсивных вызовов)
    this.enemies = [];
    this.towers = [];
    this.projectiles = [];
    this.pulses = [];
    this.currentBoss = null;
    this.selectedTower = null;
    this.buildMode = null;
    this.spawnQueue = [];
    this.spawnIdx = 0;
    this.spawnTimer = 0;
    this.waveDelay = 2.2;
    this.waveDelayLeft = 0;
    this.gameTime = 0;
    this.kills = 0;
    this.continuing = false;
    this.running = false;
    this.ghostRing = null;
    this.raycaster = new THREE.Raycaster();
    this.lastHoverTower = null;
    this.hud = null;
    this.panel = null;
    this.menus = null;

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
      this.waveDelayLeft = 3.0;
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
    this.waveDelayLeft = 1.6;
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
    this.spawnQueue = [];
    this.spawnIdx = 0;
    this.waveDelayLeft = 0;
    this.currentBoss = null;
    this.effects?.showBanner(`Ур.${idx + 1} · ${cfg.name}`, cfg.subtitle, cfg.theme.accent, 3.5);
    this.cameraRig?.reset();
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
    if (this.waveDelayLeft > 0) {
      this.waveDelayLeft = 0.01;
      this.sfx.click();
    }
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
    this.currentBoss = null;
    this.spawnQueue = [];
    this.spawnIdx = 0;
  }

  startWave(wave) {
    this.state.setWave(wave);
    // фаза луны
    const moonId = moonForWave(wave);
    this.state.setMoon(moonId);
    const m = moonId ? MOON_PHASES[moonId] : null;
    this.ctx.moonSpeedMul = m?.speedMul ?? 1;
    this.ctx.moonRewardMul = m?.rewardMul ?? 1;
    this.ctx.moonTowerMul = m?.towerMul ?? 1;
    this.ctx.cloakAll = m?.cloakAll ?? false;
    if (m) {
      this.effects.showBanner(`🌙 ${m.name}`, m.desc, m.color, 4);
    }
    this.spawnQueue = waveSpawns(wave);
    this.spawnIdx = 0;
    this.spawnTimer = 0;
    this.state.spawning = true;
    if (this.ctx.moonTowerMul > 1) this.effects.showBanner(`Волна ${wave}`, 'Лунный свет усиливает стражей', '#ffe9a0', 1.6);
    else this.effects.showBanner(`Волна ${wave}`, '', '#66e0ff', 1.6);
    this.sfx.wave();
    if (this.spawnQueue.some(s => ENEMY_TYPES[s.type].boss)) this.sfx.boss();
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
    this.waveDelayLeft = 3.0;
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
      this.waveDelayLeft = 3.0;
    } else {
      // уровень 3 пройден, но до победы ещё волны 8–10 не все отбиты —
      // сюда попадаем только если TOTAL_WAVES совпал с границей (не случается)
      this.waveDelayLeft = 3.0;
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
    // мультитач: pointerId → {x, y}; gesture: 'tap' | 'drag' | 'pinch'
    this.pointers = new Map();
    this.gesture = null;
    this.tapId = null;
    this.clickPos = null;
    this.clickMoved = false;
    this.pinchStart = 0;
    this.pinchMoved = false;
    this.gestureStart = 0;

    dom.addEventListener('pointerdown', e => this.onPointerDown(e));
    window.addEventListener('pointermove', e => this.onPointerMove(e));
    window.addEventListener('pointerup', e => this.onPointerUp(e));
    window.addEventListener('pointercancel', e => this.onPointerUp(e));
    dom.addEventListener('wheel', e => { e.preventDefault(); this.cameraRig.zoom(e.deltaY); }, { passive: false });
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
      if (pk) { e.preventDefault(); this.cameraRig.pan(pk[0], pk[1]); }
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
    this.cameraRig.interact();
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      if (e.button === 0 || e.pointerType === 'touch') {
        // одиночное касание: ждём — тап или драг
        this.gesture = 'tap';
        this.tapId = e.pointerId;
        this.clickPos = { x: e.clientX, y: e.clientY };
        this.clickMoved = false;
        this.gestureStart = performance.now();
      } else if (e.button === 1) {
        // средняя кнопка — сдвиг уровня
        this.gesture = 'pan';
        this.tapId = e.pointerId;
        this.clickPos = null;
        this.panLast = { x: e.clientX, y: e.clientY };
      } else {
        // правая кнопка — сразу вращение
        this.gesture = 'drag';
        this.tapId = e.pointerId;
        this.clickPos = null;
        this.cameraRig.dragStart(e.clientX, e.clientY);
      }
    } else if (this.pointers.size === 2) {
      // щипок: зум + сдвиг одновременно
      const [a, b] = [...this.pointers.values()];
      this.pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
      this.pinchMoved = false;
      this.pinchPrev = null;
      this.gestureStart = performance.now();
      this.gesture = 'pinch';
      this.clickPos = null;
      this.cameraRig.dragEnd();
    }
  }

  onPointerMove(e) {
    if (!this.running || !this.pointers.has(e.pointerId)) return;
    const p = this.pointers.get(e.pointerId);
    p.x = e.clientX; p.y = e.clientY;
    if (this.gesture === 'pan') {
      this.cameraRig.pan(e.clientX - this.panLast.x, e.clientY - this.panLast.y);
      this.panLast = { x: e.clientX, y: e.clientY };
      return;
    }
    if (this.gesture === 'pinch' && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const prev = this.pinchPrev;
      if (prev) {
        if (Math.abs(d - prev.d) > 4) this.pinchMoved = true;
        if (Math.hypot(cx - prev.cx, cy - prev.cy) > 3) this.pinchMoved = true;
        if (prev.d > 0) {
          const ratio = d / prev.d;
          if (Math.abs(ratio - 1) > 0.005) this.cameraRig.zoomByRatio(ratio);
        }
        const pdx = cx - prev.cx, pdy = cy - prev.cy;
        if (Math.hypot(pdx, pdy) > 0.5) this.cameraRig.pan(pdx, pdy);
      }
      this.pinchPrev = { d, cx, cy };
      return;
    }
    if (this.gesture === 'tap' && this.clickPos) {
      if (Math.hypot(e.clientX - this.clickPos.x, e.clientY - this.clickPos.y) > 8) {
        this.gesture = 'drag';
        this.cameraRig.dragStart(this.clickPos.x, this.clickPos.y);
      }
    }
    if (this.gesture === 'drag') {
      this.cameraRig.drag(e.clientX, e.clientY);
    } else if (e.pointerType === 'mouse') {
      this.hover(e.clientX, e.clientY);
    }
  }

  onPointerUp(e) {
    if (!this.running) return;
    this.pointers.delete(e.pointerId);
    if (this.gesture === 'pinch') {
      if (this.pointers.size === 0 && !this.pinchMoved && performance.now() - this.gestureStart < 350) {
        // тап двумя пальцами — пауза
        this.state.togglePause();
        this.sfx.click();
      }
      if (this.pointers.size < 2) {
        this.gesture = null;
        this.clickPos = null;
        this.cameraRig.dragEnd();
      }
      return;
    }
    if (this.gesture === 'pan' && this.tapId === e.pointerId) {
      this.gesture = null;
      return;
    }
    if (this.gesture === 'drag' && this.tapId === e.pointerId) {
      this.cameraRig.dragEnd();
      this.gesture = null;
      return;
    }
    if (this.gesture === 'tap' && this.tapId === e.pointerId && this.clickPos) {
      this.cameraRig.dragEnd();
      this.click(this.clickPos.x, this.clickPos.y);
      this.gesture = null;
      this.clickPos = null;
    }
    if (this.pointers.size === 0) this.gesture = null;
  }

  hover(x, y) {
    if (this.buildMode) {
      const perch = this.raycastPerch(x, y);
      for (const p of this.perches) p.setHighlight(p === perch);
      if (this.ghostRing) {
        this.ghostRing.visible = !!perch;
        if (perch) this.ghostRing.position.copy(perch.def.pos).setY(perch.def.pos.y + 0.5);
      }
      return;
    }
    // подсветка радиуса при наведении на башню
    const t = this.raycastTower(x, y);
    if (this.lastHoverTower && this.lastHoverTower !== this.selectedTower && this.lastHoverTower !== t) {
      this.lastHoverTower.showRange(false);
    }
    if (t && t !== this.selectedTower) t.showRange(true);
    this.lastHoverTower = t;
  }

  click(x, y) {
    if (this.buildMode) {
      const perch = this.raycastPerch(x, y);
      if (perch) {
        if (!perch.occupied && this.state.canAfford(this.buildCost(TOWER_TYPES[this.buildMode]))) {
          this.buildTower(this.buildMode, perch);
        } else if (perch.occupied) {
          this.hud?.showToast('Этот насест занят', '#ff8899');
          this.sfx.click();
        }
      }
      return;
    }
    const t = this.raycastTower(x, y);
    if (t) {
      this.selectTower(t);
    } else {
      this.deselectTower();
    }
  }

  raycastPerch(x, y) {
    const ndc = this.toNdc(x, y);
    this.raycaster.setFromCamera(ndc, this.camera);
    const meshes = [];
    const perchByMesh = new Map();
    for (const p of this.perches) {
      if (p.occupied) continue;
      p.group.traverse(o => { if (o.isMesh) { meshes.push(o); perchByMesh.set(o, p); } });
    }
    if (!meshes.length) return null;
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (!hits.length) return null;
    return perchByMesh.get(hits[0].object) || null;
  }

  raycastTower(x, y) {
    const ndc = this.toNdc(x, y);
    this.raycaster.setFromCamera(ndc, this.camera);
    const meshes = this.towers.filter(t => t.alive).map(t => t.mesh);
    const hits = this.raycaster.intersectObjects(meshes, true);
    if (!hits.length) return null;
    return this.towers.find(t => t.mesh === hits[0].object || t.mesh.children.includes(hits[0].object) || isDescendant(hits[0].object, t.mesh)) || null;
  }

  toNdc(x, y) {
    return new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  }

  // ---------- башни ----------
  buildCost(def) {
    return Math.round(def.cost * (1 - (this.ctx.buildDiscount ?? 0)));
  }

  enterBuildMode(typeId, def) {
    this.sfx.init();
    this.sfx.click();
    const cost = this.buildCost(def);
    if (!this.state.canAfford(cost)) {
      this.hud?.showToast(`Не хватает ◆ ${cost} на «${def.name}»`, '#ff8899');
      return;
    }
    this.deselectTower();
    this.buildMode = typeId;
    highlightAvailable(this.perches, this.state.canAfford(cost));
    this.hintEl = this.hintEl || document.getElementById('build-hint');
    this.hintEl.textContent = `Разместите: ${def.name} (◆ ${cost}) — клик по насесту, Esc отмена`;
    this.hintEl.classList.add('show');
    // призрак
    if (!this.ghostRing) {
      const tex = glowTexture('#66e0ff', 'rgba(150,230,255,0.7)');
      this.ghostRing = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.5 }));
      this.cave.scene.add(this.ghostRing);
    }
  }

  cancelBuildMode() {
    if (!this.buildMode) return;
    this.buildMode = null;
    for (const p of this.perches) p.setHighlight(false);
    if (this.ghostRing) this.ghostRing.visible = false;
    this.hintEl?.classList.remove('show');
  }

  buildTower(typeId, perch) {
    const def = TOWER_TYPES[typeId];
    const cost = this.buildCost(def);
    if (!this.state.spend(cost)) return;
    const tower = new Tower(typeId, perch, this.cave.scene);
    tower.spent = cost; // фактически заплачено (с учётом скидки) — для продажи/слияния
    this.towers.push(tower);
    perch.occupied = true;
    perch.tower = tower;
    this.sfx.build();
    this.particles.burst({ x: perch.def.pos.x, y: perch.def.pos.y + 0.6, z: perch.def.pos.z, count: 12, speed: 2, life: 0.6, size: 0.35, color: def.glow, gravity: 0.5 });
    this.cancelBuildMode();
  }

  selectTower(tower) {
    if (this.selectedTower === tower) return;
    if (this.selectedTower) this.selectedTower.showRange(false);
    this.selectedTower = tower;
    tower.showRange(true);
    const partner = mergePartner(tower, this.towers);
    this.panel.select(tower, partner);
  }

  deselectTower() {
    if (this.selectedTower) {
      this.selectedTower.showRange(false);
      this.selectedTower = null;
      this.panel.deselect();
    }
  }

  upgradeTower(tower) {
    if (!tower || tower.isAlpha) return;
    const cost = upgradeCost(tower.typeId, tower.level);
    if (!this.state.spend(cost)) return;
    tower.upgrade();
    this.sfx.upgrade();
    this.particles.burst({ x: tower.pos.x, y: tower.pos.y + 0.8, z: tower.pos.z, count: 10, speed: 1.6, life: 0.7, size: 0.3, color: TOWER_TYPES[tower.typeId].glow, gravity: 0 });
    const partner = mergePartner(tower, this.towers);
    this.panel.select(tower, partner);
  }

  mergeTowers(tower, partner) {
    if (!tower || !partner || !tower.alive || !partner.alive) return;
    const cost = mergeCost(tower, partner);
    if (!this.state.spend(cost)) return;
    // удаляем партнёра
    this.removeTower(partner);
    partner.perch.occupied = false;
    partner.perch.tower = null;
    // превращаем эту в альфу
    const alpha = tower.becomeAlpha();
    this.sfx.merge();
    this.effects.showBanner(`🦇 ${alpha.name}!`, alpha.passive, alpha.color, 3.5);
    this.particles.burst({ x: tower.pos.x, y: tower.pos.y + 1, z: tower.pos.z, count: 30, speed: 4, life: 1, size: 0.5, color: alpha.glow, gravity: 0 });
    this.panel.select(tower, null);
  }

  removeTower(tower) {
    const i = this.towers.indexOf(tower);
    if (i >= 0) this.towers.splice(i, 1);
    tower.dispose();
  }

  sellTower(tower) {
    if (!tower) return;
    const refund = sellPrice(tower.spent);
    this.state.addEssence(refund);
    const perch = this.perches.find(p => p.tower === tower);
    if (perch) { perch.occupied = false; perch.tower = null; }
    this.removeTower(tower);
    this.panel.deselect();
    this.sfx.coin();
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
    if (enemy.boss && this.currentBoss === enemy) this.currentBoss = null;

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
    this.cameraRig.update(dt);

    // спавн волны
    if (this.waveDelayLeft > 0 && !this.state.spawning && !this.state.won) {
      this.waveDelayLeft -= dt;
      this.hud?.setWaveState(this.state.wave + 1, this.waveDelayLeft, wavePreview(this.state.wave + 1));
      if (this.waveDelayLeft <= 0) this.startWave(this.state.wave + 1);
    }
    if (this.state.spawning) {
      this.spawnTimer += dt;
      while (this.spawnIdx < this.spawnQueue.length && this.spawnQueue[this.spawnIdx].t <= this.spawnTimer) {
        const s = this.spawnQueue[this.spawnIdx++];
        const enemy = new Enemy(s.type, this.state.wave, this.path, this.cave.scene, this.ctx);
        this.enemies.push(enemy);
        if (enemy.boss) {
          this.currentBoss = enemy;
          this.hud.showBoss(ENEMY_TYPES[s.type].name, enemy.hp, enemy.maxHp);
        }
      }
      if (this.spawnIdx >= this.spawnQueue.length && this.enemies.length === 0) {
        this.state.spawning = false;
        this.waveCleared();
      }
    }

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
    if (this.currentBoss?.alive) {
      this.hud.updateBoss(this.currentBoss.hp, this.currentBoss.maxHp);
    } else if (this.currentBoss) {
      this.currentBoss = null;
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
      if (avgMs > 45 && cur > 0.8) {
        this.renderer.setPixelRatio(Math.max(0.8, cur * 0.85));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
      } else if (avgMs < 22 && cur < this.maxPixelRatio - 0.05) {
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

// орбитальная камера
class CameraRig {
  constructor(camera, dom) {
    this.camera = camera;
    this.target = new THREE.Vector3(0, 1.2, 0);
    this.yaw = 0.7;
    this.pitch = 0.52;
    this.dist = 27;
    this.dragging = false;
    this.lastX = 0; this.lastY = 0;
    this.lastInteract = -10;
    this.autoRotate = true;
  }
  interact() { this.lastInteract = performance.now() / 1000; }

  // Сброс на стандартный обзор — вызывается при построении нового уровня,
  // чтобы камера не осталась за пределами свежей пещеры.
  reset() {
    this.target.set(0, 1.2, 0);
    this.yaw = 0.7;
    this.pitch = 0.52;
    this.dist = 27;
    this.autoRotate = true;
  }
  dragStart(x, y) { this.dragging = true; this.lastX = x; this.lastY = y; }
  drag(x, y) {
    this.yaw -= (x - this.lastX) * 0.005;
    this.pitch = Math.min(1.35, Math.max(0.15, this.pitch + (y - this.lastY) * 0.004));
    this.lastX = x; this.lastY = y;
    this.interact();
  }
  dragEnd() { this.dragging = false; }
  zoom(dy) {
    this.dist = Math.min(44, Math.max(13, this.dist + dy * 0.01 * this.dist * 0.5));
    this.interact();
  }
  zoomByRatio(ratio) {
    if (!(ratio > 0)) return;
    this.dist = Math.min(44, Math.max(13, this.dist / ratio));
    this.interact();
  }
  // Сдвиг уровня: движение в экранных пикселях → смещение цели камеры по земле.
  pan(dx, dy) {
    this.camera.updateMatrixWorld();
    const h = (Math.tan(this.camera.fov * Math.PI / 360) * 2 * this.dist) / window.innerHeight;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    this.target.addScaledVector(right, -dx * h);
    this.target.addScaledVector(up, -dy * h);
    // границы уровня — нельзя улететь в пустоту
    this.target.x = Math.max(-19, Math.min(19, this.target.x));
    this.target.y = Math.max(-0.5, Math.min(7, this.target.y));
    this.target.z = Math.max(-19, Math.min(19, this.target.z));
    this.interact();
  }
  update(dt) {
    const now = performance.now() / 1000;
    if (!this.dragging && this.autoRotate && now - this.lastInteract > 5) {
      this.yaw += dt * 0.05;
    }
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * cp * this.dist,
      this.target.y + sp * this.dist,
      this.target.z + Math.cos(this.yaw) * cp * this.dist
    );
    this.camera.lookAt(this.target);
  }
}

function isDescendant(child, root) {
  let o = child;
  while (o && o !== root) o = o.parent;
  return o === root;
}

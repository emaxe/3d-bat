// WaveManager: управление волнами врагов, спавн, тайминги, боссы
import { ENEMY_TYPES } from '../core/enemies.js';
import { waveSpawns, moonForWave, MOON_PHASES, TOTAL_WAVES } from '../core/waves.js';
import { Enemy } from '../entities/enemy.js';

export class WaveManager {
  constructor(state, effects, sfx, hud) {
    this.state = state;
    this.effects = effects;
    this.sfx = sfx;
    this.hud = hud;
    
    this.spawnQueue = [];
    this.spawnIdx = 0;
    this.spawnTimer = 0;
    this.waveDelayLeft = 0;
    this.currentBoss = null;
  }

  /**
   * Инициализирует новую волну
   * @param {number} wave - номер волны
   * @param {object} ctx - контекст игры (множители луны и т.д.)
   */
  startWave(wave, ctx) {
    this.state.setWave(wave);
    
    // фаза луны
    const moonId = moonForWave(wave);
    this.state.setMoon(moonId);
    const m = moonId ? MOON_PHASES[moonId] : null;
    ctx.moonSpeedMul = m?.speedMul ?? 1;
    ctx.moonRewardMul = m?.rewardMul ?? 1;
    ctx.moonTowerMul = m?.towerMul ?? 1;
    ctx.cloakAll = m?.cloakAll ?? false;
    
    if (m) {
      this.effects.showBanner(`🌙 ${m.name}`, m.desc, m.color, 4);
    }
    
    this.spawnQueue = waveSpawns(wave);
    this.spawnIdx = 0;
    this.spawnTimer = 0;
    this.state.spawning = true;
    
    if (ctx.moonTowerMul > 1) {
      this.effects.showBanner(`Волна ${wave}`, 'Лунный свет усиливает стражей', '#ffe9a0', 1.6);
    } else {
      this.effects.showBanner(`Волна ${wave}`, '', '#66e0ff', 1.6);
    }
    
    this.sfx.wave();
    if (this.spawnQueue.some(s => ENEMY_TYPES[s.type].boss)) {
      this.sfx.boss();
    }
  }

  /**
   * Обновляет логику спавна врагов
   * @param {number} dt - дельта времени
   * @param {Array} enemies - массив врагов
   * @param {object} path - путь для врагов
   * @param {THREE.Scene} scene - сцена
   * @param {object} ctx - контекст игры
   */
  updateSpawning(dt, enemies, path, scene, ctx) {
    if (!this.state.spawning) {return;}
    
    this.spawnTimer += dt;
    while (this.spawnIdx < this.spawnQueue.length && 
           this.spawnQueue[this.spawnIdx].t <= this.spawnTimer) {
      const s = this.spawnQueue[this.spawnIdx++];
      const enemy = new Enemy(s.type, this.state.wave, path, scene, ctx);
      enemies.push(enemy);
      
      if (enemy.boss) {
        this.currentBoss = enemy;
        this.hud.showBoss(ENEMY_TYPES[s.type].name, enemy.hp, enemy.maxHp);
      }
    }
  }

  /**
   * Проверяет завершение волны
   * @param {Array} enemies - массив врагов
   * @returns {boolean} true если волна завершена
   */
  checkWaveComplete(enemies) {
    if (this.state.spawning && 
        this.spawnIdx >= this.spawnQueue.length && 
        enemies.length === 0) {
      this.state.spawning = false;
      return true;
    }
    return false;
  }

  /**
   * Проверяет победу в кампании
   * @returns {boolean} true если все волны пройдены
   */
  isCampaignComplete() {
    return this.state.wave >= TOTAL_WAVES;
  }

  /**
   * Возвращает текущего босса
   * @returns {Enemy|null}
   */
  getCurrentBoss() {
    return this.currentBoss;
  }

  /**
   * Сбрасывает состояние босса
   */
  clearBoss() {
    this.currentBoss = null;
  }

  /**
   * Сбрасывает состояние спавна при переходе между уровнями
   */
  reset() {
    this.spawnQueue = [];
    this.spawnIdx = 0;
    this.spawnTimer = 0;
    this.waveDelayLeft = 0;
    this.currentBoss = null;
  }

  /**
   * Устанавливает задержку до следующей волны
   * @param {number} delay - задержка в секундах
   */
  setWaveDelay(delay) {
    this.waveDelayLeft = delay;
  }

  /**
   * Обновляет задержку волны
   * @param {number} dt - дельта времени
   * @returns {boolean} true если пора начинать волну
   */
  updateWaveDelay(dt) {
    if (this.waveDelayLeft > 0 && !this.state.spawning && !this.state.won) {
      this.waveDelayLeft -= dt;
      if (this.waveDelayLeft <= 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * Пропускает задержку волны (кнопка "Волну!")
   */
  skipDelay() {
    if (this.waveDelayLeft > 0) {
      this.waveDelayLeft = 0.01;
      this.sfx.click();
    }
  }

  /**
   * Возвращает информацию о следующей волне для HUD
   * @returns {{wave: number, delay: number, preview: string}}
   */
  getWaveInfo() {
    return {
      wave: this.state.wave + 1,
      delay: this.waveDelayLeft,
      preview: '' // будет заполнено из waves.js
    };
  }
}

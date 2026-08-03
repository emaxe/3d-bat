// Игровое состояние + события для UI.
import { Emitter } from './events.js';
import { ECONOMY } from './economy.js';

export class GameState extends Emitter {
  constructor() {
    super();
    this.essence = ECONOMY.startEssence;
    this.crystalHp = ECONOMY.startHp;
    this.maxHp = ECONOMY.startHp;
    this.wave = 0;              // текущая волна (0 = ещё не начата)
    this.moon = null;           // активная фаза луны
    this.combo = 0;
    this.comboTimer = 0;
    this.speed = 1;             // 1|2|3
    this.paused = false;
    this.over = false;
    this.won = false;
    this.spawning = false;      // идёт ли спавн текущей волны
  }

  canAfford(cost) { return this.essence >= cost; }

  spend(cost) {
    if (!this.canAfford(cost)) return false;
    this.essence -= cost;
    this.emit('essence', this.essence);
    return true;
  }

  addEssence(amount) {
    this.essence += amount;
    this.emit('essence', this.essence);
  }

  damageCrystal(dmg) {
    if (this.over) return;
    this.crystalHp = Math.max(0, this.crystalHp - dmg);
    this.emit('hp', this.crystalHp, this.maxHp);
    if (this.crystalHp <= 0) {
      this.over = true;
      this.emit('gameover');
    } else {
      this.emit('hurt');
    }
  }

  healCrystal(amount) {
    if (this.over) return;
    this.crystalHp = Math.min(this.maxHp, this.crystalHp + amount);
    this.emit('hp', this.crystalHp, this.maxHp);
  }

  setWave(wave) {
    this.wave = wave;
    this.emit('wave', wave);
  }

  setMoon(phaseId) {
    this.moon = phaseId;
    this.emit('moon', phaseId);
  }

  addKill() {
    this.combo = Math.min(this.combo + 1, 99);
    this.comboTimer = ECONOMY.comboWindow;
    this.emit('combo', this.combo);
  }

  resetCombo() {
    if (this.combo !== 0) {
      this.combo = 0;
      this.emit('combo', 0);
    }
  }

  tickCombo(dt) {
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.resetCombo();
    }
  }

  setSpeed(s) { this.speed = s; this.emit('speed', s); }
  togglePause() { this.paused = !this.paused; this.emit('pause', this.paused); return this.paused; }
}

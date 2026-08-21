// Синтез всех звуковых эффектов через WebAudio — ноль аудиофайлов.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.muted = false;
    this.sfxVolume = 1;     // 0..1, раздельная громкость эффектов
    this.musicVolume = 1;   // 0..1, раздельная громкость музыки
    this.baseMaster = 0.5;  // базовый множитель мастер-шины (прежний микс)
  }

  // Вызывается по первому жесту пользователя.
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') {this.ctx.resume();} return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    // Мастер — только гейт «mute» (0/1). Раздельные громкости — на шинах.
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);
    // Шина эффектов: масштабирует громкость SFX относительно базового микса.
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = this.sfxVolume * this.baseMaster;
    this.sfxBus.connect(this.master);
    // Шина музыки: независимая громкость музыкального канала.
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = this.musicVolume * this.baseMaster;
    this.musicBus.connect(this.master);
    // белый шум
    const len = this.ctx.sampleRate * 1.2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {d[i] = Math.random() * 2 - 1;}
    this.noiseBuf = buf;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) {this.master.gain.value = m ? 0 : 1;}
  }

  // Раздельная громкость эффектов (0..1). До init лишь запоминает число —
  // init() применит его при создании шины.
  setSfxVolume(v) {
    this.sfxVolume = Math.max(0, Math.min(1, v));
    if (this.sfxBus) {this.sfxBus.gain.value = this.sfxVolume * this.baseMaster;}
  }

  // Раздельная громкость музыки (0..1).
  setMusicVolume(v) {
    this.musicVolume = Math.max(0, Math.min(1, v));
    if (this.musicBus) {this.musicBus.gain.value = this.musicVolume * this.baseMaster;}
  }

  _env(dur, peak = 0.5, attack = 0.005) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), this.ctx.currentTime + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
    return g;
  }

  _osc(type, f0, f1, dur, peak, delay = 0) {
    if (!this.ctx || this.muted) {return;}
    const o = this.ctx.createOscillator();
    o.type = type;
    const t0 = this.ctx.currentTime + delay;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) {o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);}
    const g = this._env(dur, peak);
    o.connect(g).connect(this.sfxBus || this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  _noise(dur, filterFreq, peak, type = 'lowpass', delay = 0) {
    if (!this.ctx || this.muted) {return;}
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterFreq;
    const g = this._env(dur, peak);
    src.connect(f).connect(g).connect(this.sfxBus || this.master);
    const t0 = this.ctx.currentTime + delay;
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  click() { this._osc('square', 660, 880, 0.06, 0.12); }
  build() { this._osc('triangle', 220, 440, 0.12, 0.3); this._noise(0.1, 900, 0.12); }
  upgrade() { [440, 660, 880].forEach((f, i) => this._osc('triangle', f, f * 1.01, 0.12, 0.22, i * 0.07)); }
  merge() { [523, 659, 784, 1046].forEach((f, i) => this._osc('sine', f, f, 0.35, 0.25, i * 0.06)); this._noise(0.5, 3000, 0.08, 'highpass', 0.1); }
  coin() { this._osc('sine', 880, 1760, 0.09, 0.16); this._osc('sine', 1320, 2200, 0.12, 0.1, 0.04); }
  shoot(type) {
    const map = { screamer: [900, 500], frost: [1200, 800], spore: [300, 200], fire: [180, 90], vampire: [500, 260] };
    const [f0, f1] = map[type] || [600, 400];
    this._osc('square', f0, f1, 0.07, 0.1);
    // короткий шумовой щелчок — «выстрел» читается чётче
    this._noise(0.05, 2500, 0.06, 'highpass');
  }
  hit(type) {
    if (type === 'frost') {this._osc('sine', 1400, 900, 0.06, 0.1); this._osc('sine', 2100, 1400, 0.05, 0.06);}
    else if (type === 'spore') { this._osc('sine', 200, 90, 0.1, 0.12); this._noise(0.08, 1200, 0.05, 'highpass'); }
    else if (type === 'fire') { this._noise(0.12, 900, 0.1, 'lowpass'); this._osc('sine', 150, 60, 0.1, 0.1); }
    else {this._osc('square', 300, 150, 0.05, 0.08);}
  }
  explosion() { this._noise(0.4, 500, 0.4); this._noise(0.3, 120, 0.3, 'lowpass'); this._osc('sine', 120, 40, 0.35, 0.4); }
  echo() { this._osc('sine', 2200, 400, 0.3, 0.15); this._osc('sine', 2400, 500, 0.3, 0.1, 0.05); }
  lantern() { this._osc('sine', 880, 880, 0.4, 0.18); this._osc('sine', 1318, 1318, 0.5, 0.12, 0.08); }
  shriek() { this._osc('sawtooth', 1200, 300, 0.3, 0.14); this._osc('square', 900, 200, 0.25, 0.1); }
  death(isBoss = false) {
    this._osc('sawtooth', 500, 80, 0.22, 0.14);
    this._noise(0.15, 800, 0.1);
    if (isBoss) {
      // босс: низкий суб-удар + более длинный спад
      this._osc('sine', 90, 30, 0.6, 0.4);
      this._noise(0.5, 300, 0.3, 'lowpass');
    }
  }
  wave() { this._osc('triangle', 196, 196, 0.5, 0.25); this._osc('triangle', 294, 294, 0.5, 0.2, 0.1); this._osc('triangle', 392, 392, 0.6, 0.18, 0.2); }
  // Торжественный синтезированный перезвон при достижении комбо-порога (высота растёт с уровнем).
  comboMilestone(combo = 5) {
    const step = Math.max(1, Math.floor(combo / 5));
    const pitchMul = Math.pow(1.1, Math.min(step - 1, 8));
    const freqs = [523, 659, 784, 1046].map(f => f * pitchMul);
    // Восходящее арпеджио (кристальный перезвон)
    freqs.forEach((f, i) => {
      this._osc('sine', f, f * 1.01, 0.22, 0.18, i * 0.045);
      this._osc('triangle', f * 0.5, f * 0.5, 0.18, 0.1, i * 0.045);
    });
    // Высокочастотный искрящийся акцент
    this._noise(0.18, Math.min(8000, 3500 + step * 400), 0.06, 'highpass', 0.06);
  }
  boss() { this._osc('sawtooth', 90, 45, 0.9, 0.35); this._osc('sawtooth', 96, 48, 0.9, 0.3, 0.05); this._noise(0.8, 250, 0.3); }
  hurt() { this._osc('sine', 200, 60, 0.4, 0.5); this._noise(0.3, 300, 0.3); }
  gameover() { [440, 349, 293, 220].forEach((f, i) => this._osc('triangle', f, f * 0.98, 0.5, 0.22, i * 0.22)); }
  win() { [523, 659, 784, 1046, 1318].forEach((f, i) => this._osc('triangle', f, f, 0.4, 0.22, i * 0.12)); }
}

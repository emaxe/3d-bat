// Генеративная эмбиент-музыка: минорная гамма, арпеджио, бас, шумовой «ветер пещеры».
// Lookahead-планировщик — ноты планируются заранее, музыка не рвётся.

const SCALE = [220, 246.9, 261.6, 293.7, 329.6, 349.2, 392, 440]; // A minor-ish
const BASS = [55, 65.4, 82.4, 98, 110];

export class Music {
  constructor(sfx) {
    this.sfx = sfx;
    this.playing = false;
    this.timer = null;
    this.nextTime = 0;
    this.step = 0;
    this.bpm = 86;
    this.vol = 0.16;
    this.windVol = 0.05;
  }

  start() {
    if (this.playing) return;
    const ctx = this.sfx.ctx;
    if (!ctx) return;
    this.playing = true;
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.1;
    // шумовой «ветер» — постоянный фон
    this.windSrc = ctx.createBufferSource();
    this.windSrc.buffer = this.sfx.noiseBuf;
    this.windSrc.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 320;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = this.windVol;
    this.windSrc.connect(this.windFilter).connect(this.windGain).connect(this.sfx.master);
    this.windSrc.start();
    // лёгкое «дыхание» ветра
    this.windLfo = ctx.createOscillator();
    this.windLfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.03;
    this.windLfo.connect(lfoGain).connect(this.windGain.gain);
    this.windLfo.start();

    this.timer = setInterval(() => this.schedule(), 40);
  }

  stop() {
    this.playing = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    try {
      this.windSrc?.stop();
      this.windLfo?.stop();
    } catch { /* noop */ }
  }

  stepDur() { return 60 / this.bpm / 2; } // восьмые

  schedule() {
    const ctx = this.sfx.ctx;
    const stepDur = this.stepDur();
    while (this.nextTime < ctx.currentTime + 0.25) {
      this.playStep(this.step, this.nextTime, stepDur);
      this.step = (this.step + 1) % 32;
      this.nextTime += stepDur;
    }
  }

  playStep(step, t, dur) {
    const ctx = this.sfx.ctx;
    const isBeat = step % 4 === 0;
    const isBar = step % 8 === 0;
    const isBass = step % 4 === 2;

    // бас
    if (isBass) {
      const f = BASS[(step / 4) % BASS.length | 0] || BASS[0];
      this.note('triangle', f, dur * 3.4, this.vol * 1.1, t, 0.15);
    }
    // арпеджио (случайный выбор из гаммы, детерминированный по шагу)
    if (isBeat) {
      const idx = (step * 3 + Math.floor(step / 4) * 5) % SCALE.length;
      const f = SCALE[idx] * (step % 8 === 4 ? 2 : 1);
      this.note('sine', f, dur * 1.6, this.vol * 0.9, t, 0.3);
      // лёгкий щелчок-хэт
      const h = ctx.createBufferSource();
      h.buffer = this.sfx.noiseBuf;
      const hf = ctx.createBiquadFilter();
      hf.type = 'highpass'; hf.frequency.value = 5000;
      const hg = ctx.createGain();
      hg.gain.setValueAtTime(0.028, t);
      hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      h.connect(hf).connect(hg).connect(this.sfx.master);
      h.start(t); h.stop(t + 0.06);
    }
    // пэд на бар
    if (isBar) {
      const f = SCALE[(step / 8) % SCALE.length | 0] || SCALE[0];
      this.note('sawtooth', f / 2, dur * 7, this.vol * 0.35, t, 0.5);
    }
  }

  note(type, freq, dur, peak, t, filterFreq) {
    const ctx = this.sfx.ctx;
    if (this.sfx.muted) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    let node = o;
    if (filterFreq) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filterFreq;
      o.connect(f);
      node = f;
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    node.connect(g).connect(this.sfx.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

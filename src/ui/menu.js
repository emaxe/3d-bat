// Меню: старт, поражение, победа (endless), прогресс кампании, история/лор.
import { STORY_LORE } from '../config/story.js';
import { getDifficulty } from '../config/difficulty.js';
import { readSettings, saveSettings, PARTICLE_DENSITY } from '../config/settings.js';

export class Menus {
  constructor(onStart, sfx = null, onAccessChange = null) {
    this.onStart = onStart;
    this.sfx = sfx;
    this.onAccessChange = onAccessChange;
    this.menuEl = document.getElementById('menu');
    this.overEl = document.getElementById('gameover');
    this.winEl = document.getElementById('win');
    this.storyEl = document.getElementById('story');
    this.difficulty = this.readDifficulty();
    this.bindDifficultyButtons();
    this.saveDifficulty(this.difficulty);
    this.bindSoundPanel();
    this.bindAccessPanel();

    document.getElementById('btn-start').addEventListener('click', () => {
      this.menuEl.classList.remove('show');
      this.onStart(false, this.difficulty);
    });
    document.getElementById('btn-restart').addEventListener('click', () => {
      this.overEl.classList.remove('show');
      this.onStart(false, this.difficulty);
    });
    document.getElementById('btn-win-restart').addEventListener('click', () => {
      this.winEl.classList.remove('show');
      this.onStart(false, this.difficulty);
    });
    document.getElementById('btn-endless').addEventListener('click', () => {
      this.winEl.classList.remove('show');
      this.onStart(true, this.difficulty);
    });
    document.getElementById('btn-story')?.addEventListener('click', () => {
      this.showStory();
    });
    document.getElementById('btn-story-close')?.addEventListener('click', () => {
      this.storyEl?.classList.remove('show');
    });
  }

  readDifficulty() {
    try { return localStorage.getItem('3dbat.difficulty') || 'normal'; } catch { return 'normal'; }
  }

  saveDifficulty(id) {
    this.difficulty = id;
    try { localStorage.setItem('3dbat.difficulty', id); } catch { /* приватный режим */ }
    document.querySelectorAll('.diff-btn').forEach(b => b.classList.toggle('active', b.dataset.diff === id));
    const d = getDifficulty(id);
    const desc = document.getElementById('diff-desc');
    if (desc && d) desc.textContent = `${d.icon} ${d.desc}`;
  }

  bindDifficultyButtons() {
    document.querySelectorAll('.diff-btn').forEach(btn => {
      btn.addEventListener('click', () => { this.saveDifficulty(btn.dataset.diff); this.sfx?.click?.(); });
    });
  }

  // --- Панель настроек звука (раздельные громкости музыки и эффектов) ---
  readVolumes() {
    const clamp01 = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1);
    try {
      return {
        music: clamp01(parseFloat(localStorage.getItem('3dbat.vol.music') ?? '1')),
        sfx: clamp01(parseFloat(localStorage.getItem('3dbat.vol.sfx') ?? '1')),
      };
    } catch { return { music: 1, sfx: 1 }; }
  }

  saveVolumes(music, sfx) {
    try {
      localStorage.setItem('3dbat.vol.music', String(music));
      localStorage.setItem('3dbat.vol.sfx', String(sfx));
    } catch { /* приватный режим */ }
  }

  bindSoundPanel() {
    const musicEl = document.getElementById('vol-music');
    const sfxEl = document.getElementById('vol-sfx');
    if (!this.sfx || !musicEl || !sfxEl) return;
    const vols = this.readVolumes();
    musicEl.value = String(Math.round(vols.music * 100));
    sfxEl.value = String(Math.round(vols.sfx * 100));
    // применяем сохранённые значения (до init шины ещё нет — числа запомнятся)
    this.sfx.setMusicVolume(vols.music);
    this.sfx.setSfxVolume(vols.sfx);

    musicEl.addEventListener('input', () => {
      const v = parseFloat(musicEl.value) / 100;
      this.sfx.setMusicVolume(v);
      this.saveVolumes(v, parseFloat(sfxEl.value) / 100);
    });
    sfxEl.addEventListener('input', () => {
      const v = parseFloat(sfxEl.value) / 100;
      this.sfx.setSfxVolume(v);
      this.saveVolumes(parseFloat(musicEl.value) / 100, v);
    });
    // подтверждающий щелчок при отпускании ползунка эффектов
    sfxEl.addEventListener('change', () => { this.sfx?.click?.(); });
  }

  // --- Панель настроек доступности (тряска, частицы, крупный текст) ---
  bindAccessPanel() {
    this.access = readSettings();
    this.applyAccessUI();
    document.querySelectorAll('.acc-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.acc;
        this.access[key] = !this.access[key];
        saveSettings(this.access);
        this.applyAccessUI();
        this.onAccessChange?.(this.access);
        this.sfx?.click?.();
      });
    });
    document.querySelectorAll('.acc-part').forEach(btn => {
      btn.addEventListener('click', () => {
        this.access.particles = btn.dataset.part;
        saveSettings(this.access);
        this.applyAccessUI();
        this.onAccessChange?.(this.access);
        this.sfx?.click?.();
      });
    });
  }

  // Отражает текущие настройки доступности в кнопках и body.large-text.
  applyAccessUI() {
    document.querySelectorAll('.acc-btn').forEach(btn => {
      const key = btn.dataset.acc;
      btn.classList.toggle('active', !!this.access[key]);
    });
    document.querySelectorAll('.acc-part').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.part === this.access.particles);
    });
    document.body.classList.toggle('large-text', !!this.access.largeText);
  }

  // Отрисовка и открытие оверлея «История и лор».
  showStory() {
    const set = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    set('story-prologue', STORY_LORE.prologue);
    set('story-guardians', STORY_LORE.guardians);
    set('story-enemies', STORY_LORE.enemies);
    const levelsEl = document.getElementById('story-levels');
    if (levelsEl) {
      levelsEl.innerHTML = '';
      for (const lv of STORY_LORE.levels) {
        const b = document.createElement('div');
        b.innerHTML = `<b style="color:var(--accent);">${lv.name}:</b> ${lv.text}`;
        levelsEl.appendChild(b);
      }
    }
    this.storyEl?.classList.add('show');
  }

  showMenu() {
    this.menuEl.classList.add('show');
    const best = this.readProgress();
    const el = document.getElementById('menu-best');
    if (el) {
      if (best.won) {
        el.textContent = `🏆 Лучший результат: кампания пройдена (${best.kills} убийств)`;
      } else if (best.bestLevel > 0) {
        const names = ['Преддверие', 'Зал эха', 'Сердце пещеры'];
        el.textContent = `📜 Лучший результат: уровень ${best.bestLevel + 1} «${names[best.bestLevel] ?? '?'}», волна ${best.bestWave}`;
      } else if (best.bestWave > 0) {
        el.textContent = `📜 Лучший результат: волна ${best.bestWave}`;
      } else {
        el.textContent = '';
      }
    }
  }

  readProgress() {
    try {
      return JSON.parse(localStorage.getItem('3dbat.progress') || '{}');
    } catch { return {}; }
  }

  saveProgress(patch) {
    try {
      const cur = this.readProgress();
      localStorage.setItem('3dbat.progress', JSON.stringify({ ...cur, ...patch }));
    } catch { /* приватный режим — не критично */ }
  }

  showGameOver(levelIdx, wave, score, stats = null) {
    document.getElementById('go-level').textContent = String(levelIdx + 1);
    document.getElementById('go-wave').textContent = String(wave);
    document.getElementById('go-score').textContent = String(score);
    this.renderRunStats('go', stats);
    this.overEl.classList.add('show');
  }

  showWin(wave, score, stats = null) {
    document.getElementById('win-wave').textContent = String(wave);
    document.getElementById('win-score').textContent = String(score);
    this.renderRunStats('win', stats);
    this.winEl.classList.add('show');
  }

  // Заполняет блок детальной статистики забега; без stats — скрывает его.
  renderRunStats(prefix, stats) {
    const wrap = document.getElementById(`${prefix}-stats`);
    if (!wrap) {return;}
    if (!stats) { wrap.style.display = 'none'; return; }
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v); };
    set(`${prefix}-combo`, stats.maxCombo);
    set(`${prefix}-bosses`, stats.bosses);
    set(`${prefix}-essence`, stats.essenceEarned);
    set(`${prefix}-towers`, stats.towersBuilt);
    const best = document.getElementById(`${prefix}-best`);
    if (best) {
      const rec = stats.newBestWave || stats.newBestKills;
      best.style.display = rec ? '' : 'none';
      if (rec) {
        best.textContent = stats.newBestWave ? '🏆 Новый рекорд: волна!' : '🏆 Новый рекорд: убийства!';
      }
    }
    wrap.style.display = '';
  }
}

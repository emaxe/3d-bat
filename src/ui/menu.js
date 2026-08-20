// Меню: старт, поражение, победа (endless), прогресс кампании, история/лор.
import { STORY_LORE } from '../config/story.js';

export class Menus {
  constructor(onStart) {
    this.onStart = onStart;
    this.menuEl = document.getElementById('menu');
    this.overEl = document.getElementById('gameover');
    this.winEl = document.getElementById('win');
    this.storyEl = document.getElementById('story');
    document.getElementById('btn-start').addEventListener('click', () => {
      this.menuEl.classList.remove('show');
      this.onStart();
    });
    document.getElementById('btn-restart').addEventListener('click', () => {
      this.overEl.classList.remove('show');
      this.onStart();
    });
    document.getElementById('btn-win-restart').addEventListener('click', () => {
      this.winEl.classList.remove('show');
      this.onStart();
    });
    document.getElementById('btn-endless').addEventListener('click', () => {
      this.winEl.classList.remove('show');
      this.onStart(true);
    });
    document.getElementById('btn-story')?.addEventListener('click', () => {
      this.showStory();
    });
    document.getElementById('btn-story-close')?.addEventListener('click', () => {
      this.storyEl?.classList.remove('show');
    });
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

  showGameOver(levelIdx, wave, score) {
    document.getElementById('go-level').textContent = String(levelIdx + 1);
    document.getElementById('go-wave').textContent = String(wave);
    document.getElementById('go-score').textContent = String(score);
    this.overEl.classList.add('show');
  }

  showWin(wave, score) {
    document.getElementById('win-wave').textContent = String(wave);
    document.getElementById('win-score').textContent = String(score);
    this.winEl.classList.add('show');
  }
}

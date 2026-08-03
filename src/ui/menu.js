// Меню: старт, поражение, победа (endless), прогресс кампании.
export class Menus {
  constructor(onStart) {
    this.onStart = onStart;
    this.menuEl = document.getElementById('menu');
    this.overEl = document.getElementById('gameover');
    this.winEl = document.getElementById('win');
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

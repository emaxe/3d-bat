// HUD: эссенция, ХП кристалла, волна, уровень, комбо, луна, скорость/пауза/звук, бар босса.
import { TOWER_TYPES } from '../core/towers.js';
import { ENEMY_TYPES } from '../core/enemies.js';
import { MOON_PHASES } from '../core/waves.js';
import { towerIconCanvas } from '../world/textures.js';

export class Hud {
  constructor(state, sfx) {
    this.state = state;
    this.sfx = sfx;
    this.el = {
      essence: document.getElementById('hud-essence'),
      hpFill: document.getElementById('hud-hp-fill'),
      hpText: document.getElementById('hud-hp-text'),
      level: document.getElementById('hud-level'),
      wave: document.getElementById('hud-wave'),
      wavePreview: document.getElementById('hud-wave-preview'),
      next: document.getElementById('btn-next'),
      combo: document.getElementById('hud-combo'),
      moon: document.getElementById('hud-moon'),
      moonName: document.getElementById('hud-moon-name'),
      speed: document.getElementById('btn-speed'),
      pause: document.getElementById('btn-pause'),
      mute: document.getElementById('btn-mute'),
      bossWrap: document.getElementById('bossbar'),
      bossFill: document.getElementById('bossbar-fill'),
      bossName: document.getElementById('bossbar-name'),
    };
    this.muted = false;
    this.bind();
    // восстанавливаем сохранённое глушение из предыдущей сессии
    try {
      if (localStorage.getItem('3dbat.muted') === '1') {
        this.muted = true;
        this.sfx.setMuted(true);
        this.el.mute.textContent = '🔇';
        this.el.mute.classList.add('on');
      }
    } catch { /* приватный режим */ }
  }

  bind() {
    const s = this.state;
    s.on('essence', v => this.setEssence(v));
    s.on('hp', (hp, max) => this.setHp(hp, max));
    s.on('wave', w => this.setWave(w));
    s.on('combo', c => this.setCombo(c));
    s.on('moon', id => this.setMoon(id));
    s.on('speed', sp => {
      this.el.speed.textContent = `⏩ ×${sp}`;
      this.el.speed.classList.toggle('on', sp > 1);
    });

    this.el.speed.addEventListener('click', () => {
      const next = this.state.speed === 1 ? 2 : this.state.speed === 2 ? 3 : 1;
      this.state.setSpeed(next);
      this.sfx.click();
    });
    this.el.pause.addEventListener('click', () => {
      const paused = this.state.togglePause();
      this.el.pause.textContent = paused ? '▶' : '⏸';
      this.el.pause.classList.toggle('on', paused);
      this.sfx.click();
    });
    this.el.mute.addEventListener('click', () => {
      this.muted = !this.muted;
      this.sfx.setMuted(this.muted);
      this.el.mute.textContent = this.muted ? '🔇' : '🔊';
      try { localStorage.setItem('3dbat.muted', this.muted ? '1' : '0'); } catch { /* приватный режим */ }
    });
    this.setEssence(s.essence);
    this.setHp(s.crystalHp, s.maxHp);
    this.setWave(0);
    this.setCombo(0);
    this.setMoon(null);
  }

  setEssence(v) {
    this.el.essence.textContent = `◆ ${v}`;
    // лёгкая вспышка при изменении — сразу видно расход/доход
    this.el.essence.classList.remove('bump');
    void this.el.essence.offsetWidth;
    this.el.essence.classList.add('bump');
    document.querySelectorAll('.build-card').forEach(card => {
      const cost = parseInt(card.dataset.cost, 10);
      card.classList.toggle('cant', v < cost);
    });
  }

  setLevel(idx, name) {
    this.el.level.textContent = `Ур.${idx + 1} · ${name}`;
  }

  // Текст волны: либо «Волна N», либо каунтдаун с превью состава.
  setWaveState(wave, delayLeft, preview) {
    if (wave <= 0 && !delayLeft) {
      this.el.wave.textContent = 'Приготовьтесь…';
      this.el.wavePreview.textContent = '';
      this.el.next.style.display = 'none';
      return;
    }
    if (delayLeft > 0) {
      const prev = (preview || []).map(p => `${ENEMY_TYPES[p.type]?.icon ?? '❓'}×${p.n}`).join(' ');
      this.el.wave.textContent = `→ Волна ${wave} через ${delayLeft.toFixed(1)}с`;
      this.el.wavePreview.textContent = prev;
      this.el.next.style.display = '';
    } else {
      this.el.wave.textContent = `Волна ${wave}`;
      this.el.wavePreview.textContent = '';
      this.el.next.style.display = 'none';
    }
  }

  setHp(hp, max) {
    this.el.hpFill.style.width = `${(hp / max) * 100}%`;
    this.el.hpText.textContent = `${hp}/${max}`;
    this.el.hpFill.classList.toggle('low', hp / max < 0.3);
  }

  setWave(w) {
    this.setWaveState(w, 0, null);
  }

  setCombo(c) {
    if (c >= 2) {
      this.el.combo.textContent = `×${c} КОМБО`;
      this.el.combo.classList.add('show');
    } else {
      this.el.combo.classList.remove('show');
    }
  }

  setMoon(id) {
    if (!id) { this.el.moon.classList.remove('show'); return; }
    const m = MOON_PHASES[id];
    this.el.moonName.textContent = m.name;
    this.el.moon.style.color = m.color;
    this.el.moon.classList.add('show');
  }

  showBoss(name, hp, max) {
    this.el.bossWrap.classList.add('show');
    this.el.bossName.textContent = name;
    this.el.bossFill.style.width = `${(hp / max) * 100}%`;
  }

  updateBoss(hp, max) {
    if (hp <= 0) { this.el.bossWrap.classList.remove('show'); return; }
    this.el.bossFill.style.width = `${(hp / max) * 100}%`;
  }

  // Всплывающее сообщение (тост) — для подсказок и предупреждений.
  showToast(msg, color = '#ffe9a0', ms = 2200) {
    const wrap = document.getElementById('toasts');
    if (!wrap) {return;}
    const t = document.createElement('div');
    t.className = 'toast';
    t.style.borderColor = color;
    t.style.color = color;
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 350);
    }, ms);
  }
}

// Строит карточки билд-бара: только разблокированные башни уровня, со скидкой.
export function buildBuildBar(ids, discount, onSelect) {
  const bar = document.getElementById('buildbar');
  bar.innerHTML = '';
  for (const id of ids) {
    const def = TOWER_TYPES[id];
    if (!def) {continue;}
    const cost = Math.round(def.cost * (1 - (discount ?? 0)));
    const card = document.createElement('button');
    card.className = 'build-card';
    card.dataset.type = id;
    card.dataset.cost = String(cost);
    const icon = towerIconCanvas(def.color, def.glow, 96, 96);
    const img = document.createElement('img');
    img.src = icon.toDataURL();
    img.alt = def.name;
    const name = document.createElement('div');
    name.className = 'card-name';
    name.textContent = def.name;
    const costEl = document.createElement('div');
    costEl.className = 'card-cost';
    costEl.textContent = `◆ ${cost}`;
    card.append(img, name, costEl);
    card.title = def.desc;
    card.addEventListener('click', () => onSelect(id, def));
    bar.appendChild(card);
  }
}

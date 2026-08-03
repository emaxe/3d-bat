// Панель выбранной башни: апгрейд, слияние, продажа.
import { TOWER_TYPES, upgradeCost, MAX_LEVEL } from '../core/towers.js';
import { ECONOMY } from '../core/economy.js';

export class TowerPanel {
  constructor(state, sfx, actions) {
    this.state = state;
    this.sfx = sfx;
    this.actions = actions; // { upgrade, merge, sell, deselect }
    this.tower = null;
    this.el = document.getElementById('towerpanel');
    this.title = document.getElementById('tp-title');
    this.desc = document.getElementById('tp-desc');
    this.stats = document.getElementById('tp-stats');
    this.upgradeBtn = document.getElementById('tp-upgrade');
    this.mergeBtn = document.getElementById('tp-merge');
    this.sellBtn = document.getElementById('tp-sell');
    this.mergePartnerName = null;

    this.upgradeBtn.addEventListener('click', () => this.actions.upgrade(this.tower));
    this.mergeBtn.addEventListener('click', () => this.actions.merge(this.tower, this.mergePartnerName));
    this.sellBtn.addEventListener('click', () => this.actions.sell(this.tower));
    document.getElementById('tp-close').addEventListener('click', () => this.actions.deselect());

    this.state.on('essence', () => { if (this.tower) {this.refresh();} });
  }

  select(tower, mergePartner) {
    this.tower = tower;
    this.mergePartnerName = mergePartner;
    this.refresh();
    this.el.classList.add('show');
  }

  deselect() {
    this.tower = null;
    this.el.classList.remove('show');
  }

  refresh() {
    const t = this.tower;
    if (!t) {return;}
    const def = TOWER_TYPES[t.typeId];
    const name = t.isAlpha ? def.alpha.name : `${def.name} ${'★'.repeat(t.level)}`;
    this.title.textContent = name;
    this.title.style.color = t.isAlpha ? def.alpha.color : def.glow;
    this.desc.textContent = t.isAlpha ? def.alpha.passive : def.desc;
    const dmg = t.isAlpha ? def.alpha.damage : def.damage[t.level - 1];
    const rate = t.isAlpha ? def.alpha.rate : def.rate[t.level - 1];
    const range = t.isAlpha ? def.alpha.range : def.range[t.level - 1];
    this.stats.innerHTML = `Урон <b>${dmg}</b> · Скорость <b>${rate.toFixed(2)}с</b><br>Радиус <b>${range}</b>`;

    // апгрейд
    if (t.isAlpha || t.level >= MAX_LEVEL) {
      this.upgradeBtn.disabled = true;
      this.upgradeBtn.textContent = 'МАКС';
    } else {
      const cost = upgradeCost(t.typeId, t.level);
      const can = this.state.canAfford(cost);
      this.upgradeBtn.disabled = !can;
      this.upgradeBtn.textContent = `Улучшить ◆ ${cost}`;
    }

    // слияние
    if (this.mergePartnerName && !t.isAlpha) {
      const cost = Math.round((t.spent + (this.mergePartnerName?.spent ?? 0)) * 0.6);
      this.mergeBtn.style.display = '';
      this.mergeBtn.disabled = !this.state.canAfford(cost);
      this.mergeBtn.textContent = `Слияние ◆ ${cost}`;
      this.mergeBtn.title = 'Слить с соседней башней того же типа в Альфа-форму';
    } else {
      this.mergeBtn.style.display = 'none';
    }

    this.sellBtn.textContent = `Продать ◆ ${Math.round(t.spent * ECONOMY.sellRatio)}`;
  }
}

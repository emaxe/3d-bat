// Экономика: комбо, награды, продажа, волновые бонусы.

export const ECONOMY = {
  startEssence: 120,
  startHp: 20,
  sellRatio: 0.7,
  comboWindow: 3.0,      // с, окно комбо
  comboMax: 5,
  comboGoldBonus: 0.1,   // +10% эссенции за уровень комбо
  comboMilestoneStep: 5, // шаг комбо-милстоунов (5, 10, 15, 20...)
  waveClearBonus: 35,    // бонус за зачистку волны
  crystalHealPerVampireKill: 0.5,
};

// Награда за убийство с учётом комбо.
export function killReward(baseReward, combo) {
  const mult = 1 + ECONOMY.comboGoldBonus * Math.min(combo, ECONOMY.comboMax);
  return Math.round(baseReward * mult);
}

export function sellPrice(totalSpent) {
  return Math.round(totalSpent * ECONOMY.sellRatio);
}

export function waveClearReward(wave) {
  return ECONOMY.waveClearBonus + Math.min(25, Math.floor(wave * 2.5));
}

// Бонус эссенции за комбо-милстоун (5 -> +15, 10 -> +25, 15 -> +40, 20 -> +60, 25 -> +85...).
// Возвращает 0, если combo не кратен шагу милстоунов.
export function comboMilestoneReward(combo) {
  if (combo < ECONOMY.comboMilestoneStep || combo % ECONOMY.comboMilestoneStep !== 0) {
    return 0;
  }
  const step = Math.floor(combo / ECONOMY.comboMilestoneStep);
  // Прогрессия: 10 + 5 * (step * (step + 1) / 2) -> 1: 15, 2: 25, 3: 40, 4: 60, 5: 85
  return 10 + 5 * Math.round((step * (step + 1)) / 2);
}

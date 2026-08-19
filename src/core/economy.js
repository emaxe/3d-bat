// Экономика: комбо, награды, продажа, волновые бонусы.

export const ECONOMY = {
  startEssence: 120,
  startHp: 20,
  sellRatio: 0.7,
  comboWindow: 3.0,      // с, окно комбо
  comboMax: 5,
  comboGoldBonus: 0.1,   // +10% эссенции за уровень комбо
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

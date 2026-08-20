// Выбор сложности: пресеты баланса. Чистый модуль — без three/DOM.
export const DEFAULT_DIFFICULTY = 'normal';

export const DIFFICULTIES = {
  easy: {
    id: 'easy', name: 'Лёгкая', icon: '🌱', desc: 'Комфортный темп: враги слабее, награды щедрее',
    hpMult: 0.8, dmgMult: 0.8, rewardMult: 1.15, speedMult: 0.9, startEssence: 150, startHp: 25,
  },
  normal: {
    id: 'normal', name: 'Обычная', icon: '⚔️', desc: 'Исходный выверенный баланс кампании',
    hpMult: 1.0, dmgMult: 1.0, rewardMult: 1.0, speedMult: 1.0, startEssence: 120, startHp: 20,
  },
  hard: {
    id: 'hard', name: 'Сложная', icon: '💀', desc: 'Враги живучее и злее, доход скромнее',
    hpMult: 1.25, dmgMult: 1.1, rewardMult: 0.85, speedMult: 1.1, startEssence: 100, startHp: 15,
  },
};

export function getDifficulty(id) {
  return DIFFICULTIES[id] || DIFFICULTIES[DEFAULT_DIFFICULTY];
}

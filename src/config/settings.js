// Настройки доступности: тряска камеры, плотность частиц, крупный текст.
// Чистый модуль — без three/DOM. Хранится в localStorage, применяется при старте.

export const DEFAULT_SETTINGS = {
  shake: true,        // тряска камеры при взрывах/уроне
  particles: 'normal', // 'low' | 'normal' | 'high' — плотность частиц
  largeText: false,   // крупный текст интерфейса
};

// Множитель плотности частиц для каждого пресета.
export const PARTICLE_DENSITY = {
  low: 0.5,
  normal: 1.0,
  high: 1.5,
};

const KEY = '3dbat.access';

export function readSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      shake: typeof raw.shake === 'boolean' ? raw.shake : DEFAULT_SETTINGS.shake,
      particles: PARTICLE_DENSITY[raw.particles] ? raw.particles : DEFAULT_SETTINGS.particles,
      largeText: typeof raw.largeText === 'boolean' ? raw.largeText : DEFAULT_SETTINGS.largeText,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch { /* приватный режим */ }
}

// Чистый модуль достижений для 3D-BAT (без Three.js, DOM, localStorage).

/**
 * Снимок игровой статистики:
 * {
 *   kills, bossKills, towersBuilt, merges,          // за текущий забег
 *   maxCombo, essenceEarned, essence,               // из state
 *   wave, won, endless,                             // endless = это бесконечный забег
 *   towerTypesBuilt: { screamer: n, ... },          // накоплено за забег по типам башен
 *   lifetime: { kills, bosses, towers, merges, runs, wins, endlessBest },
 *   best: { kills, wave, maxCombo, essenceEarned }, // рекорды из хранилища
 * }
 */

/**
 * Каталог достижений игры (14 шт.).
 */
export const ACHIEVEMENTS = [
  {
    id: 'first_blood',
    name: 'Первая кровь',
    desc: 'Уничтожить первого ночного врага',
    metric: 'kills',
    target: 1,
    icon: '🩸',
  },
  {
    id: 'slayer_100',
    name: 'Сотня поверженных',
    desc: 'Уничтожить 100 врагов за забег',
    metric: 'kills',
    target: 100,
    icon: '🦇',
  },
  {
    id: 'slayer_500',
    name: 'Ночной кошмар тварей',
    desc: 'Уничтожить 500 врагов за всё время',
    metric: 'lifetime.kills',
    target: 500,
    icon: '💀',
  },
  {
    id: 'boss_first',
    name: 'Гроза боссов',
    desc: 'Победить первого босса',
    metric: 'bossKills',
    target: 1,
    icon: '👑',
  },
  {
    id: 'boss_10',
    name: 'Коллекционер корон',
    desc: 'Победить 10 боссов за всё время',
    metric: 'lifetime.bosses',
    target: 10,
    icon: '🕷️',
  },
  {
    id: 'towers_20',
    name: 'Застройщик пещеры',
    desc: 'Построить 20 башен за забег',
    metric: 'towersBuilt',
    target: 20,
    icon: '🏗️',
  },
  {
    id: 'vampire_fan',
    name: 'Кровный союз',
    desc: 'Построить башню «Вампир»',
    metric: 'towerTypesBuilt.vampire',
    target: 1,
    icon: '🧛',
  },
  {
    id: 'combo_15',
    name: 'Вихрь клыков',
    desc: 'Достичь комбо ×15 за забег',
    metric: 'maxCombo',
    target: 15,
    icon: '🔥',
  },
  {
    id: 'combo_25',
    name: 'Идеальная серия',
    desc: 'Достичь комбо ×25 (рекорд)',
    metric: 'best.maxCombo',
    target: 25,
    icon: '⚡',
  },
  {
    id: 'essence_2000',
    name: 'Золотая жила',
    desc: 'Заработать 2000 эссенции за забег',
    metric: 'essenceEarned',
    target: 2000,
    icon: '💰',
  },
  {
    id: 'rich_800',
    name: 'Скупой страж',
    desc: 'Иметь 800 эссенции на руках',
    metric: 'essence',
    target: 800,
    icon: '💎',
  },
  {
    id: 'wave_10',
    name: 'Десять волн тьмы',
    desc: 'Достичь 10-й волны',
    metric: 'wave',
    target: 10,
    icon: '🌑',
  },
  {
    id: 'campaign_won',
    name: 'Свет не угаснет',
    desc: 'Пройти кампанию (3 уровня)',
    metric: 'won',
    target: 1,
    icon: '🏆',
  },
  {
    id: 'endless_15',
    name: 'Хозяин бесконечности',
    desc: 'Достичь 15-й волны в бесконечном режиме',
    metric: 'endlessBest',
    target: 15,
    icon: '♾️',
  },
];

const ACHIEVEMENTS_MAP = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
const KNOWN_ACHIEVEMENT_IDS = new Set(ACHIEVEMENTS.map((a) => a.id));

/**
 * Получить объект достижения по его id.
 * @param {string} id
 * @returns {object|undefined}
 */
export function getAchievement(id) {
  return ACHIEVEMENTS_MAP.get(id);
}

/**
 * Вычисляет числовое значение метрики из снимка статистики.
 * Поддерживает простые имена ('kills'), точечные пути ('lifetime.kills', 'best.maxCombo', 'towerTypesBuilt.vampire'),
 * а также особые случаи 'won' и 'endlessBest'.
 * @param {string} metric
 * @param {object} stats
 * @returns {number}
 */
export function evaluateMetric(metric, stats) {
  if (!metric || typeof metric !== 'string' || !stats || typeof stats !== 'object') {
    return 0;
  }

  // Особый случай: булева метрика прохождения кампании
  if (metric === 'won') {
    return stats.won ? 1 : 0;
  }

  // Особый случай: лучший результат в бесконечном режиме
  if (metric === 'endlessBest') {
    const val = stats.lifetime?.endlessBest ?? stats.endlessBest;
    return typeof val === 'number' && Number.isFinite(val) && val >= 0 ? val : 0;
  }

  // Разбор точечного пути или простого поля
  const parts = metric.split('.');
  let current = stats;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') {
      return 0;
    }
    current = current[part];
  }

  if (typeof current === 'number' && Number.isFinite(current)) {
    return current >= 0 ? current : 0;
  }
  if (typeof current === 'boolean') {
    return current ? 1 : 0;
  }

  return 0;
}

/**
 * Рассчитывает текущий прогресс достижения.
 * @param {object|string} ach - объект достижения или его id
 * @param {object} stats - снимок статистики
 * @returns {{ cur: number, target: number, done: boolean }}
 */
export function achievementProgress(ach, stats) {
  const item = typeof ach === 'string' ? getAchievement(ach) : ach;
  if (!item || typeof item !== 'object') {
    return { cur: 0, target: 0, done: false };
  }

  const target = typeof item.target === 'number' && Number.isFinite(item.target) && item.target > 0
    ? item.target
    : 0;
  const cur = evaluateMetric(item.metric, stats);
  const done = target > 0 ? cur >= target : false;

  return { cur, target, done };
}

/**
 * Проверяет выполнение условий достижений и возвращает массив новых разблокировок.
 * Чистая функция, ничего не мутирует.
 * @param {object} stats - снимок статистики
 * @param {Array<string>|Set<string>} [unlockedIds=[]] - список уже открытых достижений
 * @returns {Array<{ id: string, name: string, desc: string, icon: string, value: number }>}
 */
export function checkAchievements(stats, unlockedIds = []) {
  if (!stats || typeof stats !== 'object') {
    return [];
  }

  const unlockedSet = unlockedIds instanceof Set
    ? unlockedIds
    : new Set(Array.isArray(unlockedIds) ? unlockedIds : []);

  const newlyUnlocked = [];

  for (const ach of ACHIEVEMENTS) {
    if (unlockedSet.has(ach.id)) {
      continue;
    }

    const { cur, done } = achievementProgress(ach, stats);
    if (done) {
      newlyUnlocked.push({
        id: ach.id,
        name: ach.name,
        desc: ach.desc,
        icon: ach.icon,
        value: cur,
      });
    }
  }

  return newlyUnlocked;
}

/**
 * Применяет результаты завершённого забега к долгосрочной статистике (lifetime).
 * Возвращает новый объект (не мутирует входные данные).
 * @param {object} lifetime - текущее состояние lifetime
 * @param {object} stats - статистика завершённого забега
 * @returns {{ kills: number, bosses: number, towers: number, merges: number, runs: number, wins: number, endlessBest: number }}
 */
export function applyRunToLifetime(lifetime, stats) {
  const prev = lifetime && typeof lifetime === 'object' ? lifetime : {};
  const s = stats && typeof stats === 'object' ? stats : {};

  const getNum = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

  let runEndless = 0;
  if (typeof s.endless === 'number' && Number.isFinite(s.endless)) {
    runEndless = Math.max(0, s.endless);
  } else if (s.endless) {
    runEndless = getNum(s.wave);
  } else if (typeof s.endlessBest === 'number' && Number.isFinite(s.endlessBest)) {
    runEndless = Math.max(0, s.endlessBest);
  }

  const prevEndless = getNum(prev.endlessBest);

  return {
    kills: getNum(prev.kills) + getNum(s.kills),
    bosses: getNum(prev.bosses) + getNum(s.bossKills),
    towers: getNum(prev.towers) + getNum(s.towersBuilt),
    merges: getNum(prev.merges) + getNum(s.merges),
    runs: getNum(prev.runs) + 1,
    wins: getNum(prev.wins) + (s.won ? 1 : 0),
    endlessBest: Math.max(prevEndless, runEndless),
  };
}

/**
 * Нормализует сырые данные достижений и статистики в валидную структуру состояния.
 * @param {*} raw - сырые сохранённые данные (null, массив строк, объект)
 * @returns {{ v: number, ids: string[], counters: { kills: number, bosses: number, towers: number, merges: number, runs: number, wins: number, endlessBest: number }, best: { kills: number, wave: number, maxCombo: number, essenceEarned: number } }}
 */
export function normalizeUnlocked(raw) {
  const getNum = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

  const createDefault = () => ({
    v: 1,
    ids: [],
    counters: {
      kills: 0,
      bosses: 0,
      towers: 0,
      merges: 0,
      runs: 0,
      wins: 0,
      endlessBest: 0,
    },
    best: {
      kills: 0,
      wave: 0,
      maxCombo: 0,
      essenceEarned: 0,
    },
  });

  if (raw == null || typeof raw !== 'object') {
    return createDefault();
  }

  // Поддержка легаси-формата (простой массив строковых идентификаторов)
  if (Array.isArray(raw)) {
    const ids = [...new Set(raw.filter((id) => typeof id === 'string' && KNOWN_ACHIEVEMENT_IDS.has(id)))];
    const res = createDefault();
    res.ids = ids;
    return res;
  }

  // Нормализация объекта состояния
  const rawIds = Array.isArray(raw.ids) ? raw.ids : [];
  const ids = [...new Set(rawIds.filter((id) => typeof id === 'string' && KNOWN_ACHIEVEMENT_IDS.has(id)))];

  const rawCounters = (raw.counters && typeof raw.counters === 'object')
    ? raw.counters
    : ((raw.lifetime && typeof raw.lifetime === 'object') ? raw.lifetime : {});
  const rawBest = (raw.best && typeof raw.best === 'object') ? raw.best : {};

  return {
    v: 1,
    ids,
    counters: {
      kills: getNum(rawCounters.kills),
      bosses: getNum(rawCounters.bosses),
      towers: getNum(rawCounters.towers),
      merges: getNum(rawCounters.merges),
      runs: getNum(rawCounters.runs),
      wins: getNum(rawCounters.wins),
      endlessBest: getNum(rawCounters.endlessBest),
    },
    best: {
      kills: getNum(rawBest.kills),
      wave: getNum(rawBest.wave),
      maxCombo: getNum(rawBest.maxCombo),
      essenceEarned: getNum(rawBest.essenceEarned),
    },
  };
}

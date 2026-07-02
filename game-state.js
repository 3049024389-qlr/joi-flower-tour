// ===================================================
// 共享游戏状态
// ===================================================

export const AppState = {
  START: 'start',
  PLAYING: 'playing',
  RESULT: 'result',
};

export let currentAppState = AppState.START;
export function setAppState(s) { currentAppState = s; }

// ===================================================
// 记分系统（从main.js迁移）
// ===================================================
export const Score = {
  total: 0,
  perfectStreak: 0,
  chickenMultiplier: 1,
  hasDogBonus: false,

  reset() {
    this.total = 0;
    this.perfectStreak = 0;
    this.chickenMultiplier = 1;
    this.hasDogBonus = false;
  },

  add(points) {
    const multiplier = this.chickenMultiplier;
    const final = Math.round(points * multiplier);
    this.total += final;
    this.chickenMultiplier = 1;
    return { final, multiplier };
  },

  onPerfect() {
    this.perfectStreak++;
    return this.perfectStreak;
  },

  resetStreak() {
    this.perfectStreak = 0;
  },
};

// ===================================================
// 统计数据（结算页面用）
// ===================================================
export const Stats = {
  totalPerfect: 0,
  maxCombo: 0,
  chickenCount: 0,
  eggCount: 0,
  basketCount: 0,
  margaritaCount: 0,   // 雏菊平台
  calendulaCount: 0,   // 万寿菊平台
  grassCount: 0,
  dogCount: 0,
  totalJumps: 0,

  reset() {
    this.totalPerfect = 0;
    this.maxCombo = 0;
    this.chickenCount = 0;
    this.eggCount = 0;
    this.basketCount = 0;
    this.margaritaCount = 0;
    this.calendulaCount = 0;
    this.grassCount = 0;
    this.dogCount = 0;
    this.totalJumps = 0;
  },

  onPerfect(streak) {
    this.totalPerfect++;
    if (streak > this.maxCombo) this.maxCombo = streak;
  },

  onLand(extras, isSpecial, hasGrass) {
    this.totalJumps++;
    if (isSpecial) {
      if (extras.flowerType === 'margarita') this.margaritaCount++;
      else if (extras.flowerType === 'calendula') this.calendulaCount++;
    }
    if (hasGrass) this.grassCount++;
    if (extras.eggCount)     this.eggCount     += extras.eggCount;
    if (extras.chickenCount) this.chickenCount  += extras.chickenCount;
    if (extras.basketCount)  this.basketCount   += extras.basketCount;
    if (extras.hasDog)       this.dogCount++;
  },
};

// ===================================================
// 种子管理
// ===================================================
export let gameSeed = Date.now();
export function setGameSeed(s) { gameSeed = s; }

export function seedFromString(str) {
  // 纯数字直接用，否则hash
  if (/^\d+$/.test(str.trim())) return parseInt(str.trim());
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
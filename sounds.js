// ===================================================
// 音效管理模块 sounds.js
// ===================================================

const SOUND_PATH = './sounds/';

// ===== 音效定义 =====
const SOUNDS = {
  // 背景音乐（循环）
  bgGame:    { file: 'mixkit-forever-love-38.mp3',                         loop: true,  volume: 0.4  },
  bgStart:   { file: 'mixkit-romantic-getaway-88.mp3',                     loop: true,  volume: 0.4  },
  bgResult:  { file: 'mixkit-miss-you-592.mp3',                            loop: true,  volume: 0.35 },
  bgStats:   { file: 'mixkit-i-love-you-mommy-831.mp3',                    loop: true,  volume: 0.35 },

  // 落地
  landNormal:  { file: 'mixkit-heavy-grass-step-1922.wav',                 loop: false, volume: 0.6  },
  landGrass:   { file: 'mixkit-funny-cartoon-melody-2881.wav',             loop: false, volume: 0.5  },
  landFlower:  { file: 'mixkit-liquid-bubble-3000.wav',                    loop: false, volume: 0.6  },
  landPerfect: { file: 'mixkit-fairy-arcade-sparkle-866.wav',              loop: false, volume: 0.7  },
  landCombo:   { file: 'mixkit-fantasy-game-success-notification-270.wav', loop: false, volume: 0.65 },
  landTeeter:  { file: 'mixkit-kids-cartoon-close-bells-2256.wav',         loop: false, volume: 0.6  },

  // 道具
  itemScore:   { file: 'mixkit-cartoon-positive-sound-2255.wav',           loop: false, volume: 0.55 },
  chicken:     { file: 'mixkit-chickens-clucking-short-1772.wav',          loop: false, volume: 0.6  },
  dogAppear:   { file: 'mixkit-dog-barking-twice-1.wav',                   loop: false, volume: 0.6  },
  dogBounce:   { file: 'mixkit-happy-puppy-barks-741.wav',                 loop: false, volume: 0.5  },

  // 环境（叠加在游戏背景下）
  birds:       { file: 'mixkit-morning-birds-2472.mp3',                    loop: true,  volume: 0.15 },
};

// ===== 内部状态 =====
const audioCache = {};
let currentBg = null;
let muted = false;
let birdsPlaying = false;

// ===== 预加载 =====
export function preloadSounds() {
  Object.entries(SOUNDS).forEach(([key, cfg]) => {
    const audio = new Audio(SOUND_PATH + cfg.file);
    audio.loop    = cfg.loop;
    audio.volume  = cfg.volume;
    audio.preload = 'auto';
    audioCache[key] = audio;
  });
  console.log('音效预加载完成，共', Object.keys(SOUNDS).length, '个');
}

// ===== 播放单次音效 =====
export function playSound(key) {
  if (muted) return;
  const audio = audioCache[key];
  if (!audio) { console.warn('音效不存在：', key); return; }
  // 克隆节点以支持快速重复触发
  const clone = audio.cloneNode();
  clone.volume = audio.volume;
  clone.play().catch(() => {});
}

// ===== 背景音乐 =====
export function playBg(key) {
  if (currentBg === key) return;
  stopBg();
  currentBg = key;
  if (muted) return;
  const audio = audioCache[key];
  if (!audio) return;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

export function stopBg() {
  if (!currentBg) return;
  const a = audioCache[currentBg];
  if (a) { a.pause(); a.currentTime = 0; }
  currentBg = null;
}

export function pauseBg() {
  if (!currentBg) return;
  audioCache[currentBg]?.pause();
}

export function resumeBg() {
  if (!currentBg || muted) return;
  audioCache[currentBg]?.play().catch(() => {});
}

// ===== 鸟鸣叠加 =====
export function startBirds() {
  if (birdsPlaying || muted) return;
  birdsPlaying = true;
  audioCache['birds']?.play().catch(() => {});
}

export function stopBirds() {
  birdsPlaying = false;
  const a = audioCache['birds'];
  if (a) { a.pause(); a.currentTime = 0; }
}

// ===== 静音切换 =====
export function toggleMute() {
  muted = !muted;
  if (muted) {
    Object.values(audioCache).forEach(a => { if (!a.paused) a.pause(); });
  } else {
    resumeBg();
    if (birdsPlaying) audioCache['birds']?.play().catch(() => {});
  }
  return muted;
}

export function isMuted() { return muted; }

// ===== 音量 =====
export function setBgVolume(vol) {
  const v = Math.max(0, Math.min(1, vol));
  ['bgGame', 'bgStart', 'bgResult', 'bgStats', 'birds'].forEach(key => {
    if (audioCache[key]) audioCache[key].volume = v;
  });
}

// ===== 落地音效便捷函数 =====
// main.js在各落地分支调用这一个函数即可
export function playSoundLand({ isSpecial, hasGrass, isPerfect, streak, isTeeter }) {
  if (isTeeter) {
    playSound('landTeeter');
    return;
  }
  if (isPerfect) {
    playSound('landPerfect');
    if (streak >= 3) setTimeout(() => playSound('landCombo'), 200);
    return;
  }
  if (isSpecial) { playSound('landFlower'); return; }
  if (hasGrass)  { playSound('landGrass');  return; }
  playSound('landNormal');
}
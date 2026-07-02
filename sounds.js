// ===================================================
// 音效管理模块 sounds.js
// ===================================================

const SOUND_PATH = './sounds/';

// ===== 音效定义 =====
const SOUNDS = {
  // 背景音乐（循环，仍用<audio>播放，不需要叠放触发）
  bgGame:    { file: 'mixkit-forever-love-38.mp3',                         loop: true,  volume: 0.4  },
  bgStart:   { file: 'mixkit-romantic-getaway-88.mp3',                     loop: true,  volume: 0.4  },
  bgResult:  { file: 'mixkit-miss-you-592.mp3',                            loop: true,  volume: 0.35 },
  bgStats:   { file: 'mixkit-i-love-you-mommy-831.mp3',                    loop: true,  volume: 0.35 },
  birds:     { file: 'mixkit-morning-birds-2472.mp3',                      loop: true,  volume: 0.15 },

  // 一次性打击音效（改用Web Audio API，杜绝重复解码延迟）
  landNormal:  { file: 'mixkit-heavy-grass-step-1922.wav',                 volume: 0.6  },
  landGrass:   { file: 'mixkit-funny-cartoon-melody-2881.wav',             volume: 0.5  },
  landFlower:  { file: 'mixkit-liquid-bubble-3000.wav',                    volume: 0.6  },
  landPerfect: { file: 'mixkit-fairy-arcade-sparkle-866.wav',              volume: 0.7  },
  landCombo:   { file: 'mixkit-fantasy-game-success-notification-270.wav', volume: 0.65 },
  landTeeter:  { file: 'mixkit-kids-cartoon-close-bells-2256.wav',         volume: 0.6  },
  itemScore:   { file: 'mixkit-cartoon-positive-sound-2255.wav',           volume: 0.55 },
  chicken:     { file: 'mixkit-chickens-clucking-short-1772.wav',          volume: 0.6  },
  dogAppear:   { file: 'mixkit-dog-barking-twice-1.wav',                   volume: 0.6  },
  dogBounce:   { file: 'mixkit-happy-puppy-barks-741.wav',                 volume: 0.5  },
};

// 背景/环境音（循环track）用<audio>播放的key列表
const BG_KEYS = ['bgGame', 'bgStart', 'bgResult', 'bgStats', 'birds'];
// 一次性打击音效key列表
const ONE_SHOT_KEYS = Object.keys(SOUNDS).filter((k) => !BG_KEYS.includes(k));

// ===== 内部状态 =====
const bgAudioCache = {};      // 背景/环境音：<audio>元素
const bufferCache = {};       // 一次性音效：解码后的AudioBuffer
let audioCtx = null;
let currentBg = null;
let muted = false;
let birdsPlaying = false;

// ===== Web Audio Context（懒创建，首次调用需在用户交互回调内以满足浏览器自动播放策略） =====
function getAudioContext() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

// ===== 预加载 =====
export function preloadSounds() {
  // 背景/环境音：<audio>预加载
  BG_KEYS.forEach((key) => {
    const cfg = SOUNDS[key];
    const audio = new Audio(SOUND_PATH + cfg.file);
    audio.loop = cfg.loop;
    audio.volume = cfg.volume;
    audio.preload = 'auto';
    bgAudioCache[key] = audio;
  });

  // 一次性音效：抓取并解码进内存（Web Audio API），之后播放零延迟
  const ctx = getAudioContext();
  ONE_SHOT_KEYS.forEach((key) => {
    if (bufferCache[key]) return; // 已加载过（比如preloadSounds被多次触发）
    const cfg = SOUNDS[key];
    fetch(SOUND_PATH + cfg.file)
      .then((res) => res.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data))
      .then((buffer) => { bufferCache[key] = buffer; })
      .catch((err) => console.warn('音效解码失败：', key, err));
  });

  console.log('音效预加载完成，共', Object.keys(SOUNDS).length, '个');
}

// ===== 播放一次性音效（Web Audio API，瞬时触发，可叠放） =====
export function playSound(key) {
  if (muted) return;
  const buffer = bufferCache[key];
  const cfg = SOUNDS[key];
  if (!buffer || !cfg) {
    console.warn('音效尚未就绪或不存在：', key);
    return;
  }
  const ctx = getAudioContext();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = cfg.volume;
  source.connect(gain);
  gain.connect(ctx.destination);
  source.start(0);
}

// ===== 背景音乐 =====
export function playBg(key) {
  if (currentBg === key) return;
  stopBg();
  currentBg = key;
  if (muted) return;
  const audio = bgAudioCache[key];
  if (!audio) return;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

export function stopBg() {
  if (!currentBg) return;
  const a = bgAudioCache[currentBg];
  if (a) { a.pause(); a.currentTime = 0; }
  currentBg = null;
}

export function pauseBg() {
  if (!currentBg) return;
  bgAudioCache[currentBg]?.pause();
}

export function resumeBg() {
  if (!currentBg || muted) return;
  bgAudioCache[currentBg]?.play().catch(() => {});
}

// ===== 鸟鸣叠加 =====
export function startBirds() {
  if (birdsPlaying || muted) return;
  birdsPlaying = true;
  bgAudioCache['birds']?.play().catch(() => {});
}

export function stopBirds() {
  birdsPlaying = false;
  const a = bgAudioCache['birds'];
  if (a) { a.pause(); a.currentTime = 0; }
}

// ===== 静音切换 =====
export function toggleMute() {
  muted = !muted;
  if (muted) {
    Object.values(bgAudioCache).forEach((a) => { if (!a.paused) a.pause(); });
  } else {
    resumeBg();
    if (birdsPlaying) bgAudioCache['birds']?.play().catch(() => {});
  }
  return muted;
}

export function isMuted() { return muted; }

// ===== 音量 =====
export function setBgVolume(vol) {
  const v = Math.max(0, Math.min(1, vol));
  BG_KEYS.forEach((key) => {
    if (bgAudioCache[key]) bgAudioCache[key].volume = v;
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
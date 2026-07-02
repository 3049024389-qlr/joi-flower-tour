// ===================================================
// 音效管理模块 sounds.js
// 背景音乐 + 一次性音效统一用 Web Audio API 播放
// （iOS Safari上<audio>标签和Web Audio API混用会互相抢占音频通道，
//   表现为背景音乐被音效打断/卡顿，所以两者统一到同一套系统里）
// ===================================================

const SOUND_PATH = './sounds/';

// ===== 音效定义 =====
const SOUNDS = {
  // 背景音乐（循环）
  bgGame:    { file: 'mixkit-forever-love-38.mp3',                         loop: true,  volume: 0.4  },
  bgStart:   { file: 'mixkit-romantic-getaway-88.mp3',                     loop: true,  volume: 0.4  },
  bgResult:  { file: 'mixkit-miss-you-592.mp3',                            loop: true,  volume: 0.35 },
  bgStats:   { file: 'mixkit-i-love-you-mommy-831.mp3',                    loop: true,  volume: 0.35 },
  birds:     { file: 'mixkit-morning-birds-2472.mp3',                      loop: true,  volume: 0.15 },

  // 一次性打击音效
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

const BG_KEYS = ['bgGame', 'bgStart', 'bgResult', 'bgStats', 'birds'];
const ALL_KEYS = Object.keys(SOUNDS);

// ===== 内部状态 =====
let audioCtx = null;
const bufferCache = {};       // key -> 已解码的 AudioBuffer
const decodePromises = {};    // key -> 正在进行的解码Promise（避免重复解码同一个文件）
let muted = false;

let currentBgKey = null;      // 当前"想要"播放的背景音（不代表此刻一定在响）
let currentBgSource = null;   // 正在播放的背景音source节点，null代表暂停/未播放
let currentBgGain = null;

let birdsPlaying = false;
let birdsSource = null;
let birdsGain = null;

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

// ===== 确保某个音效已解码好，返回Promise<AudioBuffer>（已解码的直接秒resolve，没解码的立刻插队解码） =====
function ensureDecoded(key) {
  if (bufferCache[key]) return Promise.resolve(bufferCache[key]);
  if (decodePromises[key]) return decodePromises[key];

  const cfg = SOUNDS[key];
  const ctx = getAudioContext();
  const p = fetch(SOUND_PATH + cfg.file)
    .then((res) => res.arrayBuffer())
    .then((data) => ctx.decodeAudioData(data))
    .then((buffer) => {
      bufferCache[key] = buffer;
      delete decodePromises[key];
      return buffer;
    })
    .catch((err) => {
      delete decodePromises[key];
      throw err;
    });
  decodePromises[key] = p;
  return p;
}

// ===== 预加载：按顺序排队解码全部音效，避免同时解码多个文件占满主线程 =====
export function preloadSounds() {
  (async () => {
    for (const key of ALL_KEYS) {
      try {
        await ensureDecoded(key);
      } catch (err) {
        console.warn('音效解码失败：', key, err);
      }
      // 让出一点时间片，避免连续解码挤占背景音乐播放
      await new Promise((r) => setTimeout(r, 30));
    }
  })();
  console.log('音效预加载已开始，共', ALL_KEYS.length, '个');
}

// ===== 播放一次性音效 =====
export function playSound(key) {
  if (muted) return;
  const cfg = SOUNDS[key];
  if (!cfg) { console.warn('音效不存在：', key); return; }

  const buffer = bufferCache[key];
  if (buffer) {
    startOneShot(key, buffer);
  } else {
    // 还没解码好（比如刚进游戏就快速触发），插队解码后立刻播放
    ensureDecoded(key).then((b) => { if (!muted) startOneShot(key, b); }).catch(() => {});
  }
}

function startOneShot(key, buffer) {
  const ctx = getAudioContext();
  const cfg = SOUNDS[key];
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = cfg.volume;
  source.connect(gain).connect(ctx.destination);
  source.start(0);
}

// ===== 背景音乐 =====
function startBgSource(key, buffer) {
  const ctx = getAudioContext();
  const cfg = SOUNDS[key];
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const gain = ctx.createGain();
  gain.gain.value = cfg.volume;
  source.connect(gain).connect(ctx.destination);
  source.start(0);
  return { source, gain };
}

export function playBg(key) {
  if (currentBgKey === key && currentBgSource) return;
  stopBg();
  currentBgKey = key;
  if (muted) return;

  const buffer = bufferCache[key];
  if (buffer) {
    const r = startBgSource(key, buffer);
    currentBgSource = r.source;
    currentBgGain = r.gain;
  } else {
    ensureDecoded(key).then((b) => {
      if (currentBgKey !== key || muted) return; // 解码期间被切换/静音了，放弃
      const r = startBgSource(key, b);
      currentBgSource = r.source;
      currentBgGain = r.gain;
    }).catch((err) => console.warn('背景音乐加载失败：', key, err));
  }
}

export function stopBg() {
  if (currentBgSource) {
    try { currentBgSource.stop(); } catch (err) {}
    currentBgSource = null;
    currentBgGain = null;
  }
  currentBgKey = null;
}

// 暂停：不记录播放位置，恢复时直接从头重新放（背景音是循环氛围音，感知不出差别）
export function pauseBg() {
  if (currentBgSource) {
    try { currentBgSource.stop(); } catch (err) {}
    currentBgSource = null;
    currentBgGain = null;
    // currentBgKey 保留，resumeBg() 时知道要重新播放哪一首
  }
}

export function resumeBg() {
  if (!currentBgKey || currentBgSource || muted) return;
  const key = currentBgKey;
  const buffer = bufferCache[key];
  if (buffer) {
    const r = startBgSource(key, buffer);
    currentBgSource = r.source;
    currentBgGain = r.gain;
  } else {
    ensureDecoded(key).then((b) => {
      if (currentBgKey !== key || currentBgSource || muted) return;
      const r = startBgSource(key, b);
      currentBgSource = r.source;
      currentBgGain = r.gain;
    }).catch(() => {});
  }
}

// ===== 鸟鸣叠加 =====
export function startBirds() {
  if (birdsPlaying || muted) return;
  birdsPlaying = true;
  const buffer = bufferCache['birds'];
  if (buffer) {
    const r = startBgSource('birds', buffer);
    birdsSource = r.source;
    birdsGain = r.gain;
  } else {
    ensureDecoded('birds').then((b) => {
      if (!birdsPlaying || muted) return;
      const r = startBgSource('birds', b);
      birdsSource = r.source;
      birdsGain = r.gain;
    }).catch(() => {});
  }
}

export function stopBirds() {
  birdsPlaying = false;
  if (birdsSource) {
    try { birdsSource.stop(); } catch (err) {}
    birdsSource = null;
    birdsGain = null;
  }
}

// ===== 静音切换 =====
export function toggleMute() {
  muted = !muted;
  if (muted) {
    if (currentBgSource) { try { currentBgSource.stop(); } catch (err) {} currentBgSource = null; currentBgGain = null; }
    if (birdsSource) { try { birdsSource.stop(); } catch (err) {} birdsSource = null; birdsGain = null; }
  } else {
    resumeBg();
    if (birdsPlaying) {
      birdsPlaying = false; // 重置标记，让startBirds()不会因为"已经在播"而提前返回
      startBirds();
    }
  }
  return muted;
}

export function isMuted() { return muted; }

// ===== 音量 =====
export function setBgVolume(vol) {
  const v = Math.max(0, Math.min(1, vol));
  BG_KEYS.forEach((key) => { if (SOUNDS[key]) SOUNDS[key].volume = v; });
  if (currentBgGain) currentBgGain.gain.value = v;
  if (birdsGain) birdsGain.gain.value = v;
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
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createStartScreen, hideStartScreen, showStartScreen } from './ui-start.js';
import { createResultScreen, showResultScreen, hideResultScreen } from './ui-result.js';
import { Stats } from './game-state.js';
import {
  preloadSounds, playSound, playBg, stopBg, startBirds, stopBirds, playSoundLand
} from './sounds.js';
import { saveRoundScore, getPersonalBest, getGlobalBest, getCurrentUser } from './firebase-services.js';

// ===================================================
// 场景基础设置
// ===================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 8, 18);

// ===== 正交相机（游戏用） =====
let currentViewSize = 5;
const aspect = window.innerWidth / window.innerHeight;
const orthoCamera = new THREE.OrthographicCamera(
  -currentViewSize * aspect, currentViewSize * aspect,
  currentViewSize, -currentViewSize, 0.1, 1000
);
const cameraOffset = new THREE.Vector3(-0.5, 0, 4);
orthoCamera.position.set(6 + cameraOffset.x, 6 + cameraOffset.y, -6 + cameraOffset.z);
orthoCamera.lookAt(cameraOffset.x, 0, cameraOffset.z);

// ===== 透视相机（开场/Stats展示用） =====
const perspCamera = new THREE.PerspectiveCamera(28, window.innerWidth / window.innerHeight, 0.1, 1000);

// 当前激活的相机
let camera = orthoCamera;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(-6, 10, -4);
scene.add(dirLight);

function createToonGradientMap() {
  const colors = new Uint8Array([60, 110, 160, 210, 255]);
  const g = new THREE.DataTexture(colors, colors.length, 1, THREE.RedFormat);
  g.needsUpdate = true;
  g.minFilter = g.magFilter = THREE.NearestFilter;
  return g;
}
const toonGradientMap = createToonGradientMap();

// ===================================================
// 种子随机数
// ===================================================
class SeededRandom {
  constructor(seed) { this.seed = seed; }
  next() {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
}
const urlSeed = new URLSearchParams(window.location.search).get('seed');
let gameSeed = urlSeed ? parseInt(urlSeed) : Date.now();
const rng = new SeededRandom(gameSeed);

// ===================================================
// 平台配置
// ===================================================
const PLATFORM_CONFIG = {
  blockWidth: 1.2,
  blockHeight: 0.9,
  blockDepth: 1.2,
  minDistance: 2.0,
  maxDistance: 3.5,
  dirX: 0.2,
  dirZ: 1.0,
  maxPlatforms: 8,
  grassChance: 0.2,
  specialInterval: 5,
};

const GROUND_Y = -PLATFORM_CONFIG.blockHeight * 2.5;
const platforms = [];
const platformColors = [0x5B8C5A, 0x7BAD7E, 0x9DC08B, 0xC5A880, 0xB07D62];
let platformCount = 0;

// ===================================================
// 模型缓存
// ===================================================
const modelCache = {};
const gltfLoader = new GLTFLoader();

function loadModel(path, callback) {
  if (modelCache[path]) { callback(modelCache[path].clone()); return; }
  gltfLoader.load(path, (gltf) => {
    modelCache[path] = gltf.scene;
    callback(gltf.scene.clone());
  }, undefined, (err) => console.warn('模型加载失败：', path, err));
}

// ===================================================
// 破纪录检测状态
// ===================================================
const RECORD_APPROACH_MARGIN = 30; // 距离纪录多少分以内算"接近"
let personalBestScore = null; // 当前用户历史最佳一局分数（未登录为null）
let globalBestScore = null;   // 全局最高分（世界记录）
let brokePersonalFlag = false;
let brokeGlobalFlag = false;
let scoreRecordState = 'normal'; // 'normal' | 'personal' | 'global'

function refreshRecordBaselines() {
  getGlobalBest().then((v) => { globalBestScore = v; }).catch(() => {});
  if (getCurrentUser()) {
    getPersonalBest().then((v) => { personalBestScore = v; }).catch(() => {});
  } else {
    personalBestScore = null;
  }
}

function setScoreRecordState(level) {
  // 'global' 优先级高于 'personal'，一旦到达就不会再降级
  if (scoreRecordState === 'global') return;
  scoreRecordState = level;
  const el = document.getElementById('score-display');
  if (!el) return;
  if (level === 'personal') {
    el.style.color = '#FFD700';
    el.style.fontWeight = '700';
  } else if (level === 'global') {
    el.style.color = '#FF8C00';
    el.style.fontWeight = '700';
  }
}

function resetScoreRecordState() {
  scoreRecordState = 'normal';
  brokePersonalFlag = false;
  brokeGlobalFlag = false;
  const el = document.getElementById('score-display');
  if (el) {
    el.style.color = 'white';
    el.style.fontWeight = 'normal';
  }
}

function checkRecordThresholds() {
  const total = Score.total;

  // 世界记录（任何人都能比，不需要登录）
  if (globalBestScore != null) {
    if (total > globalBestScore) {
      if (!brokeGlobalFlag) {
        brokeGlobalFlag = true;
        showFloatingText('NEW WORLD RECORD!', 'record-global');
        setScoreRecordState('global');
      }
    }
  }

  // 个人最佳（仅登录用户）
  if (getCurrentUser() && personalBestScore != null && scoreRecordState !== 'global') {
    if (total > personalBestScore) {
      if (!brokePersonalFlag) {
        brokePersonalFlag = true;
        showFloatingText('NEW PERSONAL BEST!', 'record-personal');
        setScoreRecordState('personal');
      }
    } else if (personalBestScore - total <= RECORD_APPROACH_MARGIN) {
      showFloatingText('approaching your best...', 'record-hint');
    }
  }
}

// ===================================================
// 记分系统
// ===================================================
const Score = {
  total: 0,
  perfectStreak: 0,
  chickenMultiplier: 1,
  hasDogBonus: false,

  add(points) {
    const multiplier = this.chickenMultiplier;
    const final = Math.round(points * multiplier);
    this.total += final;
    this.chickenMultiplier = 1;
    hideChickenUI();
    updateScoreUI();
    if (multiplier > 1) showFloatingText(`x${multiplier} = +${final}`, 'chicken');
    return final;
  },
  onPerfect()   { this.perfectStreak++; return this.perfectStreak; },
  resetStreak() { this.perfectStreak = 0; }
};

// ===================================================
// 平台道具
// ===================================================
function generatePlatformExtras(isSpecial, isFirst, hasGrass) {
  const extras = { isSpecial, chickenCount: 0, eggCount: 0, basketCount: 0, hasDog: false,
    flowerType: null }; // flowerType: 'margarita' | 'calendula'
  if (isSpecial || isFirst || hasGrass) return extras;
  const r = rng.next();
  let itemCount = 0;
  if (r < 0.02) itemCount = 3;
  else if (r < 0.11) itemCount = 2;
  else if (r < 0.23) itemCount = 1;
  for (let i = 0; i < itemCount; i++) {
    const type = rng.next();
    if (type < 0.50) extras.eggCount++;
    else if (type < 0.75) extras.chickenCount++;
    else extras.basketCount++;
  }
  return extras;
}

function calcExtrasScore(extras, isPerfect) {
  let score = 0;
  const messages = [];
  if (extras.eggCount > 0) {
    const eggScore = extras.basketCount > 0 ? extras.eggCount * 12 : extras.eggCount * 6;
    score += eggScore;
    messages.push(`EGG x${extras.eggCount} +${eggScore}`);
  }
  if (extras.basketCount > 0 && extras.eggCount === 0) messages.push(`BASKET x${extras.basketCount}`);
  if (extras.hasDog) {
    const dogScore = isPerfect ? 50 : 20;
    score += dogScore;
    messages.push(`WOOF! +${dogScore}`);
    playAnimation('StandingGreeting');
  }
  if (messages.length > 0) showFloatingText(messages.join(' / '), 'egg');
  if (extras.eggCount > 0 || extras.basketCount > 0) playSound('itemScore');
  return score;
}

function applyChickenEffect(extras) {
  if (extras.chickenCount > 0) {
    Score.chickenMultiplier = Math.pow(2, extras.chickenCount);
    showChickenUI(Score.chickenMultiplier);
    showFloatingText(`CHICKEN x${extras.chickenCount}`, 'chicken');
    playSound('chicken');
  }
}

// ===================================================
// 平台生成
// ===================================================
function createPlatform(x, z, index) {
  const isSpecial = index > 0 && index % PLATFORM_CONFIG.specialInterval === 0;
  const isFirst = index === 0;
  const needsDog = Score.hasDogBonus;
  if (needsDog) Score.hasDogBonus = false;

  const willHaveGrass = !isSpecial && !isFirst && rng.next() < PLATFORM_CONFIG.grassChance;
  const extras = generatePlatformExtras(isSpecial, isFirst, willHaveGrass);
  if (needsDog) extras.hasDog = true;

  const group = new THREE.Group();
  group.position.set(x, 0, z);
  scene.add(group);

  const geo = new THREE.BoxGeometry(
    PLATFORM_CONFIG.blockWidth, PLATFORM_CONFIG.blockHeight, PLATFORM_CONFIG.blockDepth
  );
  const color = isSpecial
    ? 0x4a7c59
    : platformColors[Math.floor(rng.next() * platformColors.length)];
  const block = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ color, gradientMap: toonGradientMap }));
  if (isSpecial) block.visible = false;
  group.add(block);

  // 草坪
  if (willHaveGrass) {
    loadModel('./models/InktobVR Day02 Little Flowers.glb', (m) => {
      m.scale.setScalar(0.34);
      m.position.y = PLATFORM_CONFIG.blockHeight / 2 + 0.12;
      group.userData.grassModel = m;
      group.add(m);
    });
  }

  // 特殊平台花朵
  if (isSpecial) {
    const useMargarita = rng.next() > 0.5;
    extras.flowerType = useMargarita ? 'margarita' : 'calendula';
    const flowerPath = useMargarita ? './models/margarita_flower.glb' : './models/calendula_flower.glb';
    const flowerScale = useMargarita ? 1.14 * 1.5 : 1.89 * 1.5;
    const flowerOrigH  = useMargarita ? 1.763 : 1.197;
    loadModel(flowerPath, (flower) => {
      flower.scale.setScalar(flowerScale);
      flower.position.y = PLATFORM_CONFIG.blockHeight / 2 - flowerScale * flowerOrigH + 0.1;
      group.userData.flowerModel = flower;
      group.userData.flowerScaledHeight = flowerScale * flowerOrigH;
      group.add(flower);
    });
  }

  // 道具位置
  const hw = PLATFORM_CONFIG.blockWidth * 0.22;
  const hd = PLATFORM_CONFIG.blockDepth * 0.22;
  const chickenPos   = [hw, hd];
  const eggPositions = [[-hw, hd], [-hw * 0.5, hd * 0.5], [-hw, hd * 0.5]];
  const basketPos    = [hw, -hd];
  let eggIdx = 0;

  if (!isSpecial && extras.chickenCount > 0) {
    for (let i = 0; i < extras.chickenCount; i++) {
      loadModel('./models/chicken.glb', (m) => {
        m.scale.setScalar(0.67 * 1.2 * 0.85);
        m.position.set(chickenPos[0], PLATFORM_CONFIG.blockHeight / 2 + 0.05, chickenPos[1]);
        m.rotation.y = Math.PI * 0.75;
        group.add(m);
      });
    }
  }
  if (!isSpecial && extras.eggCount > 0) {
    for (let i = 0; i < extras.eggCount; i++) {
      const ep = eggPositions[eggIdx++ % eggPositions.length];
      loadModel('./models/lowpoly_egg.glb', (m) => {
        m.scale.setScalar(0.15 * 1.5 * 0.85 * 1.2);
        m.position.set(ep[0], PLATFORM_CONFIG.blockHeight / 2 + 0.05, ep[1]);
        group.add(m);
      });
    }
  }
  if (!isSpecial && extras.basketCount > 0) {
    for (let i = 0; i < extras.basketCount; i++) {
      loadModel('./models/low_poly_basket.glb', (m) => {
        m.scale.setScalar(0.28 * 1.2 * 0.85);
        m.position.set(basketPos[0], PLATFORM_CONFIG.blockHeight / 2 + 0.05, basketPos[1]);
        group.add(m);
      });
    }
  }

  // 狗狗
  if (extras.hasDog) {
    const cx = PLATFORM_CONFIG.blockWidth * 0.22;
    const cz = PLATFORM_CONFIG.blockDepth * 0.22;
    loadModel('./models/luna_the_lowpoly_dog.glb', (m) => {
      m.scale.setScalar(0.002 * 1.2);
      const targetY = PLATFORM_CONFIG.blockHeight / 2 + 0.01;
      m.position.set(cx, targetY - 0.8, -cz);
      m.rotation.y = 0;
      group.add(m);
      playSound('dogAppear');

      // easeOutBack弹出动画
      const t0 = performance.now();
      const dur = 0.5;
      (function appear() {
        const t = Math.min((performance.now() - t0) / 1000 / dur, 1);
        const c1 = 1.70158, c3 = c1 + 1;
        const ease = 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
        m.position.y = targetY - 0.8 + 0.8 * ease;
        if (t < 1) requestAnimationFrame(appear);
        else {
          m.position.y = targetY;
          dogModels.push({ model: m, baseY: targetY, bouncing: false, bounceVel: 0 });
        }
      })();
      createRipple(x, z);
    });
  }

  platforms.push({
    group, block, x, z,
    width: PLATFORM_CONFIG.blockWidth,
    depth: PLATFORM_CONFIG.blockDepth,
    extras, isSpecial,
    squeezeScale: 1.0,
    squeezeVelocity: 0,
  });
  platformCount++;
  if (platforms.length > PLATFORM_CONFIG.maxPlatforms) {
    scene.remove(platforms.shift().group);
  }
}

function spawnNextPlatform() {
  const last = platforms[platforms.length - 1] || { x: 0, z: 0 };
  const dist = PLATFORM_CONFIG.minDistance +
    rng.next() * (PLATFORM_CONFIG.maxDistance - PLATFORM_CONFIG.minDistance);
  createPlatform(
    last.x + PLATFORM_CONFIG.dirX * dist,
    last.z + PLATFORM_CONFIG.dirZ * dist,
    platformCount
  );
}

createPlatform(0, 0, 0);
for (let i = 0; i < 6; i++) spawnNextPlatform();

// ===================================================
// 平台挤压
// ===================================================
const SQUEEZE = { maxSquish: 0.85, chargeSpeed: 0.8, springK: 20, damping: 5 };

function getCurrentPlatform() {
  for (let i = platforms.length - 1; i >= 0; i--) {
    if (platforms[i].x === currentPlatformX && platforms[i].z === currentPlatformZ)
      return platforms[i];
  }
  return platforms[platforms.length - 1] || null;
}

function updatePlatformSqueeze(delta) {
  const p = getCurrentPlatform();
  if (!p) return;
  if (isCharging) {
    const ratio = Math.min((performance.now() - chargeStartTime) / 1000 / JUMP_CONFIG.maxChargeTime, 1);
    const target = 1.0 - (1.0 - SQUEEZE.maxSquish) * ratio;
    p.squeezeScale += (target - p.squeezeScale) * SQUEEZE.chargeSpeed * delta * 10;
  } else if (gameState === GameState.JUMPING || gameState === GameState.IDLE) {
    const d = p.squeezeScale - 1.0;
    p.squeezeVelocity += (-SQUEEZE.springK * d - SQUEEZE.damping * p.squeezeVelocity) * delta;
    p.squeezeScale += p.squeezeVelocity * delta;
  }
  p.block.scale.y = p.squeezeScale;
  p.block.position.y = -(1 - p.squeezeScale) * PLATFORM_CONFIG.blockHeight / 2;
  const topY = p.group.position.y + p.block.position.y + p.squeezeScale * PLATFORM_CONFIG.blockHeight / 2;
  if (p.group.userData.grassModel)
    p.group.userData.grassModel.position.y = p.block.position.y + p.squeezeScale * PLATFORM_CONFIG.blockHeight / 2 + 0.12;
  if (p.group.userData.flowerModel)
    p.group.userData.flowerModel.position.y = p.block.position.y + p.squeezeScale * PLATFORM_CONFIG.blockHeight / 2 - (p.group.userData.flowerScaledHeight || 0);
  if (joiModel &&
      (isCharging || gameState === GameState.IDLE) &&
      gameState !== GameState.FALLING &&
      gameState !== GameState.DEAD &&
      gameState !== GameState.INTRO) {
    joiModel.position.y = topY + joiBottomOffset;
  }
}

// ===================================================
// 跳跃配置
// ===================================================
const JUMP_CONFIG = {
  maxChargeTime: 1.5,
  minJumpDistance: 1.5,
  maxJumpDistance: 4.0,
  jumpHeight: 2.0,
  jumpDuration: 0.6,
  // Teeter：外圈25%
  // 平台半宽0.6，外圈25% = 0.6 * 0.25 = 0.15，边界 = 0.6 - 0.15 = 0.45
  edgeThreshold: 0.15,
  perfectRadius: 0.1,
  guideJumps: 5,
};

// ===================================================
// 游戏状态
// ===================================================
const GameState = {
  INTRO:    'intro',    // 开场动画期间，禁止操作
  IDLE:     'idle',
  CHARGING: 'charging',
  JUMPING:  'jumping',
  LANDING:  'landing',
  FALLING:  'falling',
  DEAD:     'dead',
};

let gameState = GameState.IDLE;
let chargeStartTime = 0;
let currentPlatformX = 0;
let currentPlatformZ = 0;
let jumpCount = 0;
let isCharging = false;

// Teeter急救状态
let teeterRescueCount = 0;     // 窗口内已按下次数
let teeterRescueOpen = false;  // 窗口是否开放
let teeterCurrentPlatform = null;

// ===================================================
// 下落物理
// ===================================================
const FALL_CONFIG = { gravity: -5, bounceRestitution: 0.4 };
let fallVelocityY = 0;
let hasBounced = false;
let fallFromPlatform = null;

// ===================================================
// 同心圆扩散
// ===================================================
const ripples = [];
function createRipple(x, z) {
  for (let i = 0; i < 3; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.01, 0.05, 32), mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, PLATFORM_CONFIG.blockHeight / 2 + 0.02, z);
    scene.add(ring);
    ripples.push({ mesh: ring, delay: i * 0.15, age: -i * 0.15, maxAge: 0.6, maxRadius: 0.6, thickness: 0.05 });
  }
}
function updateRipples(delta) {
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];
    r.age += delta;
    if (r.age < 0) continue;
    const t = r.age / r.maxAge;
    if (t >= 1) { scene.remove(r.mesh); r.mesh.geometry.dispose(); ripples.splice(i, 1); continue; }
    r.mesh.geometry.dispose();
    const rad = t * r.maxRadius;
    r.mesh.geometry = new THREE.RingGeometry(rad, rad + r.thickness, 32);
    r.mesh.material.opacity = 0.9 * (1 - t);
  }
}

// ===================================================
// 预测圆圈和抛物线
// ===================================================
const predictionRingMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
const predictionRing = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.25, 32), predictionRingMat);
predictionRing.rotation.x = -Math.PI / 2;
predictionRing.visible = false;
scene.add(predictionRing);

const predictionLineGeo = new THREE.BufferGeometry();
const predictionLine = new THREE.Line(predictionLineGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 }));
predictionLine.visible = false;
scene.add(predictionLine);

function calcJumpDistance(chargeTime) {
  const t = Math.min(chargeTime, JUMP_CONFIG.maxChargeTime) / JUMP_CONFIG.maxChargeTime;
  return JUMP_CONFIG.minJumpDistance + t * (JUMP_CONFIG.maxJumpDistance - JUMP_CONFIG.minJumpDistance);
}
function calcLandingPos(startPos, distance) {
  const len = Math.sqrt(PLATFORM_CONFIG.dirX ** 2 + PLATFORM_CONFIG.dirZ ** 2);
  return new THREE.Vector3(
    startPos.x + (PLATFORM_CONFIG.dirX / len) * distance,
    startPos.y,
    startPos.z + (PLATFORM_CONFIG.dirZ / len) * distance
  );
}
function updatePrediction(chargeTime, startPos) {
  const distance = calcJumpDistance(chargeTime);
  const landPos = calcLandingPos(startPos, distance);
  predictionRing.position.set(landPos.x, PLATFORM_CONFIG.blockHeight / 2 + 0.01, landPos.z);
  predictionRing.visible = true;
  if (jumpCount < JUMP_CONFIG.guideJumps) {
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      pts.push(new THREE.Vector3(
        startPos.x + (landPos.x - startPos.x) * t,
        startPos.y + currentJumpHeight * 4 * t * (1 - t),
        startPos.z + (landPos.z - startPos.z) * t
      ));
    }
    predictionLineGeo.setFromPoints(pts);
    predictionLine.visible = true;
  } else {
    predictionLine.visible = false;
  }
}
function hidePrediction() { predictionLine.visible = false; }

// ===================================================
// UI：游戏内HUD
// ===================================================
function createUI() {
  const ui = document.createElement('div');
  ui.id = 'game-ui';
  ui.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;font-family:"Noto Sans SC",sans-serif;';
  ui.innerHTML = `
    <div id="score-display" style="position:absolute;top:24px;left:50%;transform:translateX(-50%);
      font-family:'Press Start 2P',monospace;font-size:36px;color:white;
      text-shadow:2px 2px 0 rgba(0,0,0,0.25);letter-spacing:2px;">0</div>

    <div id="streak-display" style="position:absolute;top:80px;left:50%;transform:translateX(-50%);
      font-family:'Press Start 2P',monospace;font-size:13px;color:#FFD700;
      text-shadow:1px 1px 0 rgba(0,0,0,0.3);opacity:0;transition:opacity 0.3s;white-space:nowrap;"></div>

    <div id="chicken-display" style="position:absolute;top:24px;right:20px;
      font-family:'Press Start 2P',monospace;font-size:11px;color:#FF6B6B;
      text-shadow:1px 1px 0 rgba(0,0,0,0.3);line-height:1.6;opacity:0;transition:opacity 0.3s;"></div>

    <div id="dog-countdown" style="position:absolute;top:80px;right:20px;
      font-family:'Noto Sans SC',sans-serif;font-size:14px;color:#C39BD3;
      text-shadow:1px 1px 3px rgba(0,0,0,0.4);opacity:0;transition:opacity 0.3s;text-align:right;"></div>

    <div id="seed-display" style="position:absolute;top:20px;left:20px;
      font-family:'Noto Sans SC',sans-serif;font-size:11px;color:rgba(255,255,255,0.45);"></div>

    <div id="float-container" style="position:absolute;top:0;left:0;width:100%;height:100%;"></div>

    <div id="score-rules" style="position:absolute;bottom:20px;left:20px;
      font-family:'Noto Sans SC',sans-serif;font-size:13px;color:white;
      text-shadow:1px 1px 2px rgba(0,0,0,0.4);line-height:2.2;pointer-events:none;">
      <div style="font-size:14px;font-weight:700;margin-bottom:4px;">SCORE RULES</div>
      <div><img src="./icons/lowpoly_egg-icon.png" style="width:16px;vertical-align:middle;margin-right:6px;">Egg +6 &nbsp; <img src="./icons/low_poly_basket-icon.png" style="width:16px;vertical-align:middle;margin-right:6px;">Basket = egg x2</div>
      <div><img src="./icons/chicken-icon.png" style="width:16px;vertical-align:middle;margin-right:6px;">Chicken = next platform x2</div>
      <div><img src="./icons/margarita_flower-icon.png" style="width:16px;vertical-align:middle;margin-right:6px;"><img src="./icons/calendula_flower-icon.png" style="width:16px;vertical-align:middle;margin-right:6px;">Flower platform +5</div>
      <div><img src="./icons/luna_the_lowpoly_dog-icon.png" style="width:16px;vertical-align:middle;margin-right:6px;">Dog +20 / perfect +50</div>
      <div style="margin-top:2px;color:rgba(255,255,255,0.55);font-size:12px;">10 perfect combo → dog appears</div>
    </div>

    <button id="emergency-btn" style="
      display:none;position:fixed;pointer-events:all;
      width:72px;height:72px;border-radius:50%;border:none;
      background:rgba(255,80,80,0.92);color:white;
      font-family:'Press Start 2P',monospace;font-size:7px;
      box-shadow:0 4px 16px rgba(255,80,80,0.5);
      cursor:pointer;line-height:1.4;
      animation:emergencyPulse 0.4s ease-in-out infinite alternate;">
      EMER-<br>GENCY!
    </button>
  `;
  document.body.appendChild(ui);
}
createUI();

// Emergency按钮CSS动画
const style = document.createElement('style');
style.textContent = `
  @keyframes floatUp {
    0%   { opacity:1; transform:translateX(-50%) translateY(0); }
    100% { opacity:0; transform:translateX(-50%) translateY(-80px); }
  }
  @keyframes emergencyPulse {
    from { transform: scale(1); box-shadow: 0 4px 16px rgba(255,80,80,0.5); }
    to   { transform: scale(1.12); box-shadow: 0 6px 24px rgba(255,80,80,0.8); }
  }
`;
document.head.appendChild(style);

function updateScoreUI() {
  document.getElementById('score-display').textContent = Score.total;
  checkRecordThresholds();
}
function showStreakUI(streak) {
  const el = document.getElementById('streak-display');
  if (streak >= 2) {
    el.textContent = `${streak} COMBO!`;
    el.style.opacity = '1';
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.style.opacity = '0'; }, 1800);
  } else {
    el.style.opacity = '0';
  }
}
function showChickenUI(multiplier) {
  const el = document.getElementById('chicken-display');
  el.innerHTML = `WOO!<br>x${multiplier} NEXT`;
  el.style.opacity = '1';
}
function hideChickenUI() {
  document.getElementById('chicken-display').style.opacity = '0';
}
function updateDogCountdown(streak) {
  const el = document.getElementById('dog-countdown');
  const rem = 10 - streak;
  if (streak > 0 && streak < 10) {
    el.textContent = `🐕 ${rem} more perfect${rem > 1 ? 's' : ''} for dog`;
    el.style.opacity = '1';
  } else {
    el.style.opacity = '0';
  }
}
function showFloatingText(text, type) {
  const container = document.getElementById('float-container');
  const old = container.querySelector(`[data-type="${type}"]`);
  if (old) old.remove();
  const colors   = { perfect:'#FFD700', combo:'#FFD700', bonus:'#98FB98', egg:'#FFA500', chicken:'#FF6B6B', dog:'#C39BD3', normal:'#fff',
    'record-hint':'#FFEE99', 'record-personal':'#FFD700', 'record-global':'#FF8C00' };
  const tops     = { perfect:'68%', combo:'74%', bonus:'86%', normal:'74%', egg:'80%', chicken:'80%', dog:'62%',
    'record-hint':'40%', 'record-personal':'40%', 'record-global':'40%' };
  const sizes    = { perfect:'18px', combo:'13px', bonus:'13px', normal:'13px', egg:'13px', chicken:'13px', dog:'16px',
    'record-hint':'12px', 'record-personal':'20px', 'record-global':'20px' };
  const el = document.createElement('div');
  el.dataset.type = type;
  el.style.cssText = `position:absolute;left:50%;top:${tops[type]||'74%'};transform:translateX(-50%);
    font-family:'Press Start 2P',monospace;font-size:${sizes[type]||'13px'};
    color:${colors[type]||'#fff'};text-shadow:1px 1px 0 rgba(0,0,0,0.35);
    pointer-events:none;white-space:nowrap;animation:floatUp 1.4s ease-out forwards;`;
  el.textContent = text;
  container.appendChild(el);
  setTimeout(() => el.remove(), 1400);
}

// ===== Emergency按钮 =====
const emergencyBtn = document.getElementById('emergency-btn');
const isMobile = 'ontouchstart' in window;

function showEmergencyBtn() {
  if (!joiModel) return;
  // 将Joi的3D坐标投影到屏幕坐标
  const pos = joiModel.position.clone().project(camera);
  const x = (pos.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-pos.y * 0.5 + 0.5) * window.innerHeight;
  emergencyBtn.style.left = `${x + 80}px`;
  emergencyBtn.style.top  = `${y - 36}px`;
  emergencyBtn.style.display = 'block';
}
function hideEmergencyBtn() {
  emergencyBtn.style.display = 'none';
}
emergencyBtn.addEventListener('click', () => { onTeeterRescue(); });
emergencyBtn.addEventListener('touchstart', (e) => { e.preventDefault(); onTeeterRescue(); });

// ===================================================
// Joi动画系统
// ===================================================
let joiModel = null;
let mixer = null;
const animations = {};
let currentActionName = null;

const ONE_TIME_ACTIONS = [
  'StandingToCrouch','CrouchToStanding','StandingJumpTwist',
  'Landing','Teeter','FallingDown','StandingGreeting','Thankful','RumbaDancingrelax'
];

function playAnimation(name, fadeDuration = 0.2) {
  if (!animations[name]) { console.warn('动作不存在：', name); return; }
  if (currentActionName === name) return;
  const newAction = animations[name];
  if (currentActionName && animations[currentActionName]) {
    newAction.reset().play();
    animations[currentActionName].crossFadeTo(newAction, fadeDuration, true);
  } else {
    newAction.reset().play();
  }
  currentActionName = name;
}

function setupAnimationFinishListener() {
  mixer.addEventListener('finished', (e) => {
    const name = e.action.getClip().name;
    switch (name) {
      case 'StandingToCrouch':
        playAnimation('CrouchIdle01');
        break;
      case 'CrouchToStanding':
        playAnimation('StandingIdle');
        if (gameState !== GameState.DEAD && gameState !== GameState.INTRO)
          gameState = GameState.IDLE;
        break;
      case 'StandingJumpTwist':
        if (gameState === GameState.LANDING) { playAnimation('StandingIdle'); gameState = GameState.IDLE; }
        break;
      case 'Teeter':
        hideEmergencyBtn();
        teeterRescueOpen = false;
        // 稳住概率 = 30% + 每次按键+15%，上限90%
        const prob = Math.min(0.30 + teeterRescueCount * 0.15, 0.90);
        if (Math.random() < prob) {
          onTeeterSuccess();
        } else {
          startFalling(true);
        }
        teeterRescueCount = 0;
        break;
      case 'StandingGreeting':
        playAnimation('StandingIdle');
        if (gameState === GameState.INTRO) {
          gameState = GameState.IDLE;
          // 移除开场补光
          const gl = scene.getObjectByName('greetingLight');
          if (gl) scene.remove(gl);
          // 恢复FOV
          perspCamera.fov = 28;
          perspCamera.updateProjectionMatrix();
          cameraTargetPos = new THREE.Vector3(
            joiModel.position.x + 6 + cameraOffset.x,
            6 + cameraOffset.y,
            joiModel.position.z - 6 + cameraOffset.z
          );
          cameraLookTarget = null;
          camera = orthoCamera;
          playBg('bgGame');
          startBirds();
        }
        break;
      case 'Thankful':
      case 'RumbaDancingrelax':
        // Stats页面动作播完回StandingIdle
        if (gameState === GameState.DEAD) playAnimation('StandingIdle');
        break;
      case 'FallingDown':
        break;
    }
  });
}

// ===================================================
// Teeter急救
// ===================================================
function onTeeterRescue() {
  if (!teeterRescueOpen) return;
  teeterRescueCount++;
  // 视觉反馈：按钮闪一下
  emergencyBtn.style.background = 'rgba(255,200,0,0.95)';
  setTimeout(() => { emergencyBtn.style.background = 'rgba(255,80,80,0.92)'; }, 150);
  showFloatingText(`RESCUE x${teeterRescueCount}`, 'bonus');
}

function onTeeterSuccess() {
  playAnimation('StandingIdle', 0.5);
  gameState = GameState.IDLE;
  const p = teeterCurrentPlatform;
  if (p) {
    const bonus = 5;
    Score.total += bonus;
    updateScoreUI();
    showFloatingText(`TEETER! +${bonus}`, 'perfect');
    playSoundLand({ isTeeter: true });
    spawnNextPlatform();
    jumpCount++;
    Stats.onLand(p.extras, p.isSpecial, !!p.group.userData.grassModel);
  }
  teeterCurrentPlatform = null;
}

// ===================================================
// 落地判定
// ===================================================
function checkLanding(landPos) {
  for (let i = 0; i < platforms.length; i++) {
    const p = platforms[i];
    const halfW = p.width / 2;
    const halfD = p.depth / 2;
    if (Math.abs(landPos.x - p.x) > halfW || Math.abs(landPos.z - p.z) > halfD) continue;

    const distX = Math.abs(landPos.x - p.x);
    const distZ = Math.abs(landPos.z - p.z);
    // Teeter：外圈25%（edgeThreshold = halfW * 0.25 = 0.15）
    const edgeX = distX > halfW - JUMP_CONFIG.edgeThreshold;
    const edgeZ = distZ > halfD - JUMP_CONFIG.edgeThreshold;
    const distFromCenter = Math.sqrt((landPos.x - p.x) ** 2 + (landPos.z - p.z) ** 2);
    const isPerfect = distFromCenter < halfW * JUMP_CONFIG.perfectRadius * 2;

    currentPlatformX = p.x;
    currentPlatformZ = p.z;
    p.squeezeScale = 0.85;
    p.squeezeVelocity = 0.5;

    if (edgeX || edgeZ) {
      // ===== Teeter边缘 =====
      teeterCurrentPlatform = p;
      teeterRescueCount = 0;
      teeterRescueOpen = true;

      // 显示Emergency按钮（手机/PC都显示）
      showEmergencyBtn();
      // PC端：任意键均可触发救援
      const onKey = () => { onTeeterRescue(); };
      window.addEventListener('keydown', onKey);
      // Teeter动画结束时自动移除键盘监听
      setTimeout(() => { window.removeEventListener('keydown', onKey); },
        (animations['Teeter']?.getClip().duration || 1.5) * 1000);

      let baseScore = 1;
      if (p.isSpecial) baseScore += 5;
      baseScore += calcExtrasScore(p.extras, false);
      Score.add(baseScore);
      applyChickenEffect(p.extras);
      Score.resetStreak();
      Stats.onLand(p.extras, p.isSpecial, !!p.group.userData.grassModel);
      updateDogCountdown(0);
      showFloatingText('+1', 'normal');
      if (p.isSpecial) showFloatingText('BONUS! +5', 'bonus');
      playSoundLand({ isTeeter: true });
      playAnimation('Teeter');
      gameState = GameState.LANDING;

    } else if (isPerfect) {
      // ===== 完美命中 =====
      const streak = Score.onPerfect();
      Stats.onPerfect(streak);
      Stats.onLand(p.extras, p.isSpecial, !!p.group.userData.grassModel);
      let baseScore = streak >= 2 ? (streak + 1) : 2;
      if (p.isSpecial) baseScore += 5;
      if (p.extras.hasDog) baseScore += 50;
      baseScore += calcExtrasScore(p.extras, true);

      Score.add(baseScore);
      applyChickenEffect(p.extras);
      showFloatingText('PERFECT! +' + (streak >= 2 ? (streak + 1) : 2), 'perfect');
      if (p.isSpecial) showFloatingText('BONUS! +5', 'bonus');
      if (p.extras.hasDog) showFloatingText('DOG BONUS +50', 'dog');
      showStreakUI(streak);
      createRipple(p.x, p.z);
      playSoundLand({ isSpecial: p.isSpecial, hasGrass: !!p.group.userData.grassModel, isPerfect: true, streak });
      updateDogCountdown(streak);
      triggerDogBounce(p);

      // 连续完美10次触发狗狗
      if (streak >= 10) {
        Score.hasDogBonus = false;
        Score.perfectStreak = 0;
        showFloatingText('DOG IS COMING!', 'dog');
        updateDogCountdown(0);
        const ci = platforms.findIndex(p2 => p2.x === currentPlatformX && p2.z === currentPlatformZ);
        const np = platforms[ci + 1];
        if (np) {
          np.extras.hasDog = true;
          const cx2 = PLATFORM_CONFIG.blockWidth * 0.22;
          const cz2 = PLATFORM_CONFIG.blockDepth * 0.22;
          loadModel('./models/luna_the_lowpoly_dog.glb', (m) => {
            m.scale.setScalar(0.002 * 1.2);
            const ty = PLATFORM_CONFIG.blockHeight / 2 + 0.01;
            m.position.set(cx2, ty - 0.8, -cz2);
            m.rotation.y = 0;
            np.group.add(m);
            playSound('dogAppear');
            const t0 = performance.now();
            (function appear() {
              const t = Math.min((performance.now() - t0) / 500, 1);
              const c1 = 1.70158, c3 = c1 + 1;
              const ease = 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
              m.position.y = ty - 0.8 + 0.8 * ease;
              if (t < 1) requestAnimationFrame(appear);
              else { m.position.y = ty; dogModels.push({ model: m, baseY: ty, bouncing: false, bounceVel: 0 }); }
            })();
            createRipple(np.x, np.z);
          });
        }
      }

      playAnimation('StandingIdle');
      gameState = GameState.IDLE;
      spawnNextPlatform();
      jumpCount++;

    } else {
      // ===== 普通落地 =====
      let baseScore = 1;
      if (p.isSpecial) baseScore += 5;
      if (p.extras.hasDog) baseScore += 20;
      baseScore += calcExtrasScore(p.extras, false);
      Score.add(baseScore);
      applyChickenEffect(p.extras);
      Score.resetStreak();
      Stats.onLand(p.extras, p.isSpecial, !!p.group.userData.grassModel);
      updateDogCountdown(0);
      showFloatingText('+1', 'normal');
      if (p.isSpecial) showFloatingText('BONUS! +5', 'bonus');
      if (p.extras.hasDog) showFloatingText('DOG BONUS +20', 'dog');
      playSoundLand({ isSpecial: p.isSpecial, hasGrass: !!p.group.userData.grassModel, isPerfect: false, streak: 0 });
      triggerDogBounce(p);
      playAnimation('StandingIdle');
      gameState = GameState.IDLE;
      spawnNextPlatform();
      jumpCount++;
    }
    return true;
  }
  startFalling(false);
  return false;
}

// ===================================================
// 下落物理
// ===================================================
function startFalling(fromEdge = false) {
  gameState = GameState.FALLING;
  fallVelocityY = 0;
  hasBounced = false;
  fallFromPlatform = fromEdge ? getCurrentPlatform() : null;
  playAnimation('FallingDown');
  triggerDeathCamera();
}

function triggerDeathCamera() {
  if (!joiModel) return;
  cameraTargetPos = new THREE.Vector3(
    joiModel.position.x + 4 + cameraOffset.x, 3,
    joiModel.position.z - 4 + cameraOffset.z
  );
  cameraLookTarget = joiModel.position.clone();
}

function updateFalling(delta) {
  if (!joiModel) return;
  fallVelocityY += FALL_CONFIG.gravity * delta;
  joiModel.position.y += fallVelocityY * delta;
  if (!hasBounced && fallFromPlatform) {
    if (joiModel.position.y > GROUND_Y && joiModel.position.y < PLATFORM_CONFIG.blockHeight / 2) {
      fallVelocityY = Math.abs(fallVelocityY) * FALL_CONFIG.bounceRestitution;
      hasBounced = true;
    }
  }
  if (joiModel.position.y <= GROUND_Y) {
    joiModel.position.y = GROUND_Y;
    fallVelocityY = 0;
    gameState = GameState.DEAD;
    showGameOver();
  }
  if (cameraLookTarget) cameraLookTarget.copy(joiModel.position);
}

function showGameOver() {
  // 守卫：只在游戏真正进行时才显示结算
  if (!isGameActive) return;
  stopBirds();
  stopBg();
  playBg('bgResult');
  saveRoundScore({
    score: Score.total,
    maxCombo: Stats.maxCombo,
    margaritaCount: Stats.margaritaCount,
    calendulaCount: Stats.calendulaCount,
    grassCount: Stats.grassCount,
    eggCount: Stats.eggCount,
    chickenCount: Stats.chickenCount,
    basketCount: Stats.basketCount,
    dogCount: Stats.dogCount,
  }).catch((err) => console.warn('保存分数失败：', err));
  setTimeout(() => { showResultScreen(Score.total); }, 1200);
}

// ===================================================
// 跳跃飞行
// ===================================================
let jumpProgress = 0;
let jumpStartPos = new THREE.Vector3();
let jumpEndPos   = new THREE.Vector3();
let isJumping = false;
let currentJumpDuration = 0.6;
let currentJumpHeight   = 2.0;
let joiBottomOffset = 0;
let isGameActive = false; // 防止开始页面误触发结算

const dogModels = [];

function startJump(distance) {
  if (!joiModel) return;
  if (animations['CrouchIdle01']) animations['CrouchIdle01'].stop();
  jumpStartPos.copy(joiModel.position);
  jumpEndPos = calcLandingPos(jumpStartPos, distance);
  jumpEndPos.y = PLATFORM_CONFIG.blockHeight / 2 + joiBottomOffset;
  const ratio = (distance - JUMP_CONFIG.minJumpDistance) / (JUMP_CONFIG.maxJumpDistance - JUMP_CONFIG.minJumpDistance);
  currentJumpDuration = 0.4 + ratio * 0.5;
  currentJumpHeight   = 1.0 + ratio * 2.0;
  jumpProgress = 0;
  isJumping = true;
  gameState = GameState.JUMPING;
  playAnimation('StandingJumpTwist');
  hidePrediction();
}

// ===================================================
// 狗狗弹跳
// ===================================================
function triggerDogBounce(platform) {
  const dog = dogModels.find(d => platform.group.children.includes(d.model));
  if (!dog) return;
  dog.bouncing = true;
  dog.bounceVel = 0.15;
  playSound('dogBounce');
}

// ===================================================
// 相机控制变量
// ===================================================
let cameraTargetPos  = null;
let cameraLookTarget = null;

// ===================================================
// 输入事件
// ===================================================
function onMouseDown(e) {
  if (gameState !== GameState.IDLE) return;
  isCharging = true;
  chargeStartTime = performance.now();
  gameState = GameState.CHARGING;
  playAnimation('StandingToCrouch');
}
function onMouseMove(e) {
  if (!isCharging) return;
  const margin = 10;
  if (e.clientX < margin || e.clientX > window.innerWidth - margin ||
      e.clientY < margin || e.clientY > window.innerHeight - margin) { cancelCharge(); return; }
}
function onMouseUp(e) {
  if (!isCharging) return;
  isCharging = false;
  const ct = (performance.now() - chargeStartTime) / 1000;
  if (ct < 0.1) { cancelCharge(); return; }
  startJump(calcJumpDistance(ct));
}
function cancelCharge() {
  if (!isCharging && gameState !== GameState.CHARGING) return;
  isCharging = false;
  hidePrediction();
  playAnimation('CrouchToStanding');
  gameState = GameState.LANDING;
}

window.addEventListener('mousedown', onMouseDown);
window.addEventListener('mousemove', onMouseMove);
window.addEventListener('mouseup', onMouseUp);
window.addEventListener('touchstart', (e) => {
  if (e.target !== renderer.domElement) return; // 点在UI按钮/弹窗上，不拦截，交给按钮自己的click逻辑
  e.preventDefault();
  onMouseDown(e.touches[0]);
}, { passive: false });
window.addEventListener('touchmove', (e) => {
  if (e.target !== renderer.domElement) return;
  e.preventDefault();
  onMouseMove(e.touches[0]);
}, { passive: false });
window.addEventListener('touchend', (e) => {
  if (e.target !== renderer.domElement) return;
  onMouseUp(e.changedTouches[0]);
});

// ===================================================
// 窗口自适应（含手机竖屏适配）
// ===================================================
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  const asp = w / h;
  renderer.setSize(w, h);

  // 竖屏时增大viewSize防止裁剪
  currentViewSize = asp < 1 ? 5 / asp : 5;
  orthoCamera.left   = -currentViewSize * asp;
  orthoCamera.right  =  currentViewSize * asp;
  orthoCamera.top    =  currentViewSize;
  orthoCamera.bottom = -currentViewSize;
  orthoCamera.updateProjectionMatrix();

  perspCamera.aspect = asp;
  perspCamera.updateProjectionMatrix();

  renderer.setSize(w, h);
}
window.addEventListener('resize', onResize);

// ===================================================
// 加载Joi
// ===================================================
gltfLoader.load('./models/Joi_character.glb', (gltf) => {
  joiModel = gltf.scene;
  const joiBox = new THREE.Box3().setFromObject(joiModel);
  joiBottomOffset = 0;
  joiModel.position.set(0, PLATFORM_CONFIG.blockHeight / 2, 0);
  scene.add(joiModel);

  joiModel.traverse((child) => {
    if (child.isMesh) {
      const old = child.material;
      child.material = new THREE.MeshToonMaterial({
        color: old.color || 0xffffff,
        map: old.map || null,
        gradientMap: toonGradientMap,
      });
    }
  });

  mixer = new THREE.AnimationMixer(joiModel);
  gltf.animations.forEach((clip) => {
    const action = mixer.clipAction(clip);
    if (ONE_TIME_ACTIONS.includes(clip.name)) {
      action.setLoop(THREE.LoopOnce);
      action.clampWhenFinished = true;
    }
    animations[clip.name] = action;
  });

  setupAnimationFinishListener();
  playAnimation('StandingIdle');
  console.log('Joi加载成功');
});

// ===================================================
// Stats空格/触摸逻辑
// ===================================================
let statsInteractCount = 0;

function onStatsDance() {
  statsInteractCount++;
  const clipName = statsInteractCount === 1
    ? 'Thankful'
    : (Math.random() < 0.5 ? 'RumbaDancingrelax' : 'Thankful');
  if (!animations[clipName]) return;
  const action = animations[clipName];
  // 统一单次播放，播完后finished事件切回StandingIdle
 action.setLoop(THREE.LoopRepeat, 2);
  action.clampWhenFinished = true;
  Object.values(animations).forEach(a => a.stop());
  action.reset().play();
  currentActionName = clipName;
}

function onStatsKeyDown(e) { if (e.code === 'Space') onStatsDance(); }
function onStatsLeftTap(e) {
  // 手机端：点击左半屏触发
  const x = e.touches ? e.touches[0].clientX : e.clientX;
  if (x < window.innerWidth / 2) onStatsDance();
}

// ===================================================
// 游戏重置
// ===================================================
function resetGame(seed) {
  isGameActive = false;
  hideResultScreen();

  Score.total = 0;
  Score.perfectStreak = 0;
  Score.chickenMultiplier = 1;
  Score.hasDogBonus = false;
  Stats.reset();
  resetScoreRecordState();
  refreshRecordBaselines();
  updateScoreUI();

  gameState = GameState.IDLE;
  isCharging = false;
  isJumping = false;
  jumpCount = 0;
  currentPlatformX = 0;
  currentPlatformZ = 0;
  fallVelocityY = 0;
  cameraTargetPos = null;
  cameraLookTarget = null;
  dogModels.length = 0;
  teeterRescueCount = 0;
  teeterRescueOpen = false;
  teeterCurrentPlatform = null;
  hideEmergencyBtn();

  platforms.forEach(p => scene.remove(p.group));
  platforms.length = 0;
  platformCount = 0;

  gameSeed = seed;
  rng.seed = seed;
  document.getElementById('seed-display').textContent = `SEED: ${seed}`;
  createPlatform(0, 0, 0);
  for (let i = 0; i < 6; i++) spawnNextPlatform();

  // 切回正交相机，重置到游戏视角
  camera = orthoCamera;
  orthoCamera.position.set(6 + cameraOffset.x, 6 + cameraOffset.y, -6 + cameraOffset.z);
  orthoCamera.lookAt(cameraOffset.x, 0, cameraOffset.z);

  if (joiModel) {
    joiModel.position.set(0, PLATFORM_CONFIG.blockHeight / 2, 0);
    Object.values(animations).forEach(a => a.stop());
    playAnimation('StandingIdle');
  }
}

// ===================================================
// 动画循环
// ===================================================
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  if (mixer) mixer.update(delta);

  // 跳跃飞行
  if (isJumping && joiModel) {
    jumpProgress += delta / currentJumpDuration;
    if (jumpProgress >= 1) {
      jumpProgress = 1;
      isJumping = false;
      joiModel.position.copy(jumpEndPos);
      checkLanding(jumpEndPos);
    } else {
      const t = jumpProgress;
      joiModel.position.x = jumpStartPos.x + (jumpEndPos.x - jumpStartPos.x) * t;
      joiModel.position.z = jumpStartPos.z + (jumpEndPos.z - jumpStartPos.z) * t;
      joiModel.position.y = jumpStartPos.y + currentJumpHeight * 4 * t * (1 - t);
      cameraTargetPos = new THREE.Vector3(
        joiModel.position.x + 6 + cameraOffset.x,
        6 + cameraOffset.y,
        joiModel.position.z - 6 + cameraOffset.z
      );
    }
  }

  // 狗狗弹跳物理（弹簧）
  for (const dog of dogModels) {
    if (!dog.bouncing) continue;
    const disp = dog.model.position.y - dog.baseY;
    dog.bounceVel += (-18 * disp - 5 * dog.bounceVel) * delta;
    dog.model.position.y += dog.bounceVel * delta;
    if (Math.abs(dog.bounceVel) < 0.01 && Math.abs(disp) < 0.005) {
      dog.model.position.y = dog.baseY;
      dog.bouncing = false;
    }
  }

  // 下落物理
  if (gameState === GameState.FALLING) updateFalling(delta);

  // 平台挤压
  updatePlatformSqueeze(delta);

  // 同心圆
  updateRipples(delta);

  // 落点圆圈
  if (joiModel && gameState !== GameState.JUMPING &&
      gameState !== GameState.FALLING && gameState !== GameState.DEAD &&
      gameState !== GameState.INTRO) {
    if (isCharging) {
      updatePrediction((performance.now() - chargeStartTime) / 1000, joiModel.position);
    } else {
      predictionRing.position.set(joiModel.position.x, PLATFORM_CONFIG.blockHeight / 2 + 0.01, joiModel.position.z);
      predictionRing.visible = true;
      predictionLine.visible = false;
    }
  } else {
    predictionRing.visible = false;
    predictionLine.visible = false;
  }

  // 相机平滑跟随
  if (cameraTargetPos) {
    camera.position.lerp(cameraTargetPos, 0.02);
    if (cameraLookTarget) {
      camera.lookAt(cameraLookTarget);
    } else {
      const lx = camera.position.x - 6;
      const lz = camera.position.z + 6;
      camera.lookAt(lx + cameraOffset.x, 0, lz + cameraOffset.z);
    }
    if (camera.position.distanceTo(cameraTargetPos) < 0.01 && !cameraLookTarget) cameraTargetPos = null;
  }

  // Emergency按钮跟随Joi（Teeter期间）
  if (teeterRescueOpen && joiModel) {
    const pos = joiModel.position.clone().project(camera);
    const x = (pos.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-pos.y * 0.5 + 0.5) * window.innerHeight;
    emergencyBtn.style.left = `${x + 80}px`;
    emergencyBtn.style.top  = `${y - 36}px`;
  }

  renderer.render(scene, camera);
}
animate();

// ===================================================
// 预加载音效（需要用户交互）
// ===================================================
document.addEventListener('click', () => { preloadSounds(); }, { once: true });
document.addEventListener('touchstart', () => { preloadSounds(); }, { once: true });

// ===================================================
// 初始化结算页面
// ===================================================
createResultScreen({
  onRestart: (seed) => {
    stopBg();
    window.removeEventListener('keydown', onStatsKeyDown);
    window.removeEventListener('click', onStatsLeftTap);
    window.removeEventListener('touchstart', onStatsLeftTap);
    resetGame(seed);
    startIntroSequence();
  },
  onMenu: () => {
    stopBg();
    stopBirds();
    window.removeEventListener('keydown', onStatsKeyDown);
    window.removeEventListener('click', onStatsLeftTap);
    window.removeEventListener('touchstart', onStatsLeftTap);
    resetGame(gameSeed);
    showStartScreen();
    playBg('bgStart');
  },
  onShowStats: () => {
    stopBg();
    playBg('bgStats');
    statsInteractCount = 0;
    platforms.forEach(p => { p.group.visible = false; });
    ripples.forEach(r => { r.mesh.visible = false; });
    predictionRing.visible = false;
    predictionLine.visible = false;

    // 隐藏积分规则面板
    const rules = document.getElementById('score-rules');
    if (rules) rules.style.display = 'none';

    if (joiModel) {
      Object.values(animations).forEach(a => a.stop());
      if (animations['CrouchToStanding']) {
        animations['CrouchToStanding'].setLoop(THREE.LoopOnce);
        animations['CrouchToStanding'].clampWhenFinished = true;
        animations['CrouchToStanding'].reset().play();
        currentActionName = 'CrouchToStanding';
      } else {
        playAnimation('StandingIdle');
      }

      // 透视相机：Joi偏左（相机向右偏移），距离拉远
      perspCamera.fov = 28;
      perspCamera.updateProjectionMatrix();
      camera = perspCamera;
      perspCamera.position.set(
        joiModel.position.x,
        joiModel.position.y + 1.6,
        joiModel.position.z + 5.0
      );
      perspCamera.lookAt(
        joiModel.position.x + 0.6,
        joiModel.position.y + 0.8,
        joiModel.position.z
      );
      cameraTargetPos  = null;
      cameraLookTarget = null;

      // Stats补光（和greeting相同方向）
      const statsLight = new THREE.DirectionalLight(0xffffff, 1.2);
      statsLight.position.set(0, 3, 6);
      statsLight.name = 'statsLight';
      scene.add(statsLight);
    }

    window.addEventListener('keydown', onStatsKeyDown);
    if (isMobile) {
      window.addEventListener('touchstart', onStatsLeftTap);
    } else {
      window.addEventListener('click', onStatsLeftTap);
    }
  },
  onHideStats: () => {
    stopBg();
    playBg('bgResult');
    platforms.forEach(p => { p.group.visible = true; });
    window.removeEventListener('keydown', onStatsKeyDown);
    window.removeEventListener('click', onStatsLeftTap);
    window.removeEventListener('touchstart', onStatsLeftTap);

    // 恢复积分规则面板
    const rules = document.getElementById('score-rules');
    if (rules) rules.style.display = '';

    // 移除Stats补光
    const sl = scene.getObjectByName('statsLight');
    if (sl) scene.remove(sl);

    camera = orthoCamera;
    if (animations['FallingDown']) {
      Object.values(animations).forEach(a => a.stop());
      animations['FallingDown'].reset().play();
      currentActionName = 'FallingDown';
    }
    cameraLookTarget = null;
    cameraTargetPos  = null;
  },
});

// ===================================================
// 开场动画序列
// ===================================================
function startIntroSequence() {
  if (!joiModel) {
    // Joi还没加载，等加载完后会自动播StandingIdle，直接开始
    isGameActive = true;
    return;
  }
  gameState = GameState.INTRO;
  isGameActive = false;

  // 开场补光
  const greetingLight = new THREE.DirectionalLight(0xffffff, 1.2);
  greetingLight.position.set(0, 3, 6);
  greetingLight.name = 'greetingLight';
  scene.add(greetingLight);

  perspCamera.fov = 20;
  perspCamera.updateProjectionMatrix();
  camera = perspCamera;
  perspCamera.position.set(
    joiModel.position.x,
    joiModel.position.y + 4.8,
    joiModel.position.z + 8.5
  );
  perspCamera.lookAt(joiModel.position.x, joiModel.position.y + 1.4, joiModel.position.z);
  cameraTargetPos  = null;
  cameraLookTarget = null;

  // 播放StandingGreeting
  Object.values(animations).forEach(a => a.stop());
  if (animations['StandingGreeting']) {
    animations['StandingGreeting'].reset().play();
    currentActionName = 'StandingGreeting';
  }

  setTimeout(() => { isGameActive = true; }, 3000);
}

// ===================================================
// 初始化开始页面
// ===================================================
createStartScreen((seed) => {
  hideStartScreen();
  stopBg();
  resetGame(seed);
  startIntroSequence();
});

// 开始页面背景音乐（需要用户先交互）
document.addEventListener('click', () => {
  if (!document.getElementById('start-screen')?.classList.contains('hidden')) {
    playBg('bgStart');
  }
}, { once: true });
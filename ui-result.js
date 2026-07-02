// ===================================================
// 结算页面 ui-result.js
// ===================================================
import { Stats, gameSeed, setGameSeed } from './game-state.js';
import { fetchLeaderboard, getUserBestRank, getCurrentUser } from './firebase-services.js';

let _onRestart = null;
let _onMenu = null;

function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    /* ---- GAME OVER 层 ---- */
    #result-screen {
      position: fixed; inset: 0;
      display: flex; align-items: center; justify-content: center;
      z-index: 200; pointer-events: none;
    }
    #result-screen.hidden { display: none; }

    #result-card {
      pointer-events: all;
      background: rgba(255,255,255,0.88);
      backdrop-filter: blur(12px);
      border-radius: 24px;
      padding: 36px 44px;
      width: min(380px, 88vw);
      box-shadow: 0 8px 40px rgba(0,0,0,0.13);
      display: flex; flex-direction: column;
      align-items: center; gap: 18px;
      font-family: 'Noto Sans SC', sans-serif;
    }

    #result-title {
      font-family: 'Press Start 2P', monospace;
      font-size: 15px; color: #5B8C5A; letter-spacing: 2px;
    }
    #result-score {
      font-family: 'Press Start 2P', monospace;
      font-size: 52px; color: #2a2a2a; letter-spacing: 3px; line-height: 1;
    }
    #result-score-label {
      font-size: 11px; color: #bbb;
      letter-spacing: 2px; margin-top: -10px;
      font-family: 'Press Start 2P', monospace;
    }

    #result-buttons { display: flex; gap: 10px; width: 100%; }
    .res-btn {
      flex: 1;
      font-family: 'Press Start 2P', monospace;
      font-size: 9px; border: none; border-radius: 14px;
      padding: 14px 6px; cursor: pointer;
      display: flex; flex-direction: column;
      align-items: center; gap: 7px;
      transition: transform 0.1s, opacity 0.1s;
      letter-spacing: 0.5px;
      touch-action: manipulation;
    }
    .res-btn:active { transform: scale(0.95); }
    #rb-restart { background: #5B8C5A; color: white; }
    #rb-restart:hover { opacity: 0.88; }
    #rb-menu, #rb-stats {
      background: transparent; color: #5B8C5A;
      border: 1.5px solid #5B8C5A;
    }
    #rb-menu:hover, #rb-stats:hover { background: rgba(91,140,90,0.08); }

    /* ---- RESTART 对话框 ---- */
    #restart-dialog {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.32);
      display: flex; align-items: center; justify-content: center;
      z-index: 400;
    }
    #restart-dialog.hidden { display: none; }
    #rd-inner {
      background: white; border-radius: 22px;
      padding: 30px 34px;
      display: flex; flex-direction: column;
      align-items: center; gap: 14px;
      width: min(300px, 86vw);
    }
    #rd-title {
      font-family: 'Press Start 2P', monospace;
      font-size: 11px; color: #3a3a3a;
      letter-spacing: 1px; text-align: center;
    }
    .rd-opt {
      width: 100%;
      font-family: 'Press Start 2P', monospace;
      font-size: 9px; border: none;
      border-radius: 12px; padding: 13px 16px;
      cursor: pointer; display: flex;
      align-items: flex-start; gap: 10px;
      transition: transform 0.1s; line-height: 1.6;
      touch-action: manipulation;
    }
    .rd-opt:active { transform: scale(0.97); }
    .rd-opt.primary { background: #5B8C5A; color: white; }
    .rd-opt.secondary {
      background: transparent; color: #5B8C5A;
      border: 1.5px solid #5B8C5A;
    }
    #rd-alt {
      font-size: 11px; color: #bbb; cursor: pointer;
      text-decoration: underline;
      font-family: 'Noto Sans SC', sans-serif;
      touch-action: manipulation;
    }
    #rd-alt:hover { color: #5B8C5A; }
    #rd-cancel {
      font-size: 11px; color: #ccc; cursor: pointer;
      font-family: 'Noto Sans SC', sans-serif;
      touch-action: manipulation;
    }
    #rd-cancel:hover { color: #999; }

    /* ---- STATS 全屏 ---- */
    #stats-screen {
      position: fixed; inset: 0;
      z-index: 300; display: flex;
      font-family: 'Noto Sans SC', sans-serif;
    }
    #stats-screen.hidden { display: none; }

    #stats-left { flex: 1; position: relative; }
    #stats-left-label {
      position: absolute; bottom: 40px; left: 0; right: 0;
      text-align: center;
      font-family: 'Press Start 2P', monospace;
      font-size: 10px; color: rgba(255,255,255,0.6);
      letter-spacing: 2px;
    }

    /* 右侧面板：无白底，渐变遮罩 */
    #stats-right {
      width: 300px;
      display: flex; flex-direction: column;
      padding: 36px 24px 28px;
      gap: 12px; overflow-y: auto;
      background: linear-gradient(to right, transparent, rgba(135,206,235,0.75) 20%);
    }

    /* 手机端收窄 */
    @media (max-width: 480px) {
      #stats-right {
        width: 150px;
        padding: 28px 12px 20px;
        gap: 8px;
      }
      .stats-item-cell { padding: 6px 8px; gap: 6px; }
      .stats-item-cell img { width: 16px; height: 16px; }
      .stats-item-name { font-size: 9px; }
      .stats-item-cell span:last-child { font-size: 10px; }
      #stats-highlight { padding: 12px 10px; gap: 8px; }
      .highlight-value { font-size: 22px; }
      .highlight-label { font-size: 8px; }
      #stats-intro { font-size: 10px; }
      #stats-items-title { font-size: 8px; }
    }

    /* 总分/最高连击高亮区 */
    #stats-highlight {
      display: flex; gap: 12px;
      background: rgba(255,255,255,0.18);
      border-radius: 14px; padding: 16px 12px;
      backdrop-filter: blur(4px);
      margin-bottom: 4px;
    }
    .highlight-block {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; gap: 4px;
    }
    .highlight-value {
      font-family: 'Press Start 2P', monospace;
      font-size: 28px; color: white;
      text-shadow: 1px 1px 4px rgba(0,0,0,0.3);
      line-height: 1;
    }
    .highlight-label {
      font-size: 9px; color: rgba(255,255,255,0.7);
      letter-spacing: 1px; text-align: center;
      font-family: 'Press Start 2P', monospace;
    }
    .highlight-divider {
      width: 1px; background: rgba(255,255,255,0.25);
      align-self: stretch; margin: 4px 0;
    }

    #stats-intro {
      font-size: 11px; color: rgba(255,255,255,0.85);
      line-height: 1.6; font-style: italic;
    }
    #stats-items-title {
      font-size: 9px; color: rgba(255,255,255,0.55);
      letter-spacing: 2px;
      font-family: 'Press Start 2P', monospace;
    }

    /* 道具列表 */
    #stats-items-grid {
      display: flex; flex-direction: column; gap: 6px;
    }
    .stats-item-cell {
      display: flex; align-items: center; gap: 10px;
      background: rgba(255,255,255,0.15);
      border-radius: 10px; padding: 8px 12px;
      backdrop-filter: blur(4px);
    }
    .stats-item-cell img {
      width: 22px; height: 22px;
      object-fit: contain; flex-shrink: 0;
    }
    .stats-item-name {
      font-size: 11px; color: rgba(255,255,255,0.8); flex: 1;
    }
    .stats-item-cell span:last-child {
      font-family: 'Press Start 2P', monospace;
      font-size: 13px; color: white;
      text-shadow: 1px 1px 3px rgba(0,0,0,0.3);
    }

    #stats-ranking {
      background: rgba(255,255,255,0.14);
      border-radius: 10px; padding: 12px;
      display: flex; align-items: center; justify-content: space-between;
      cursor: pointer;
      transition: background 0.15s;
      touch-action: manipulation;
    }
    #stats-ranking:hover { background: rgba(255,255,255,0.22); }
    #stats-ranking-title {
      color: white;
      font-size: 10px; letter-spacing: 1px;
      font-family: 'Press Start 2P', monospace;
    }
    #stats-ranking-arrow {
      color: rgba(255,255,255,0.6);
      font-size: 14px;
    }

    #stats-btns {
      display: flex; gap: 8px; margin-top: auto; padding-top: 4px;
    }
    .stats-btn {
      flex: 1;
      font-family: 'Press Start 2P', monospace;
      font-size: 8px; border: none;
      border-radius: 10px; padding: 10px 4px;
      cursor: pointer; text-align: center;
      transition: transform 0.1s;
      touch-action: manipulation;
    }
    .stats-btn:active { transform: scale(0.96); }
    #sb-back {
      background: rgba(255,255,255,0.2);
      color: white; border: 1.5px solid rgba(255,255,255,0.4);
    }
    #sb-back:hover { background: rgba(255,255,255,0.3); }
    #sb-restart2 { background: white; color: #5B8C5A; }
    #sb-restart2:hover { opacity: 0.9; }

    /* ---- 独立排行榜全屏页面 ---- */
    #lb-screen {
      position: fixed; inset: 0;
      z-index: 350;
      background: linear-gradient(160deg, #87CEEB, #5B8C5A);
      display: flex; flex-direction: column;
      align-items: center;
      padding: 32px 20px 24px;
      font-family: 'Noto Sans SC', sans-serif;
    }
    #lb-screen.hidden { display: none; }
    #lb-title {
      font-family: 'Press Start 2P', monospace;
      font-size: 16px; color: white;
      text-shadow: 2px 2px 0 rgba(0,0,0,0.18);
      letter-spacing: 1px;
      margin-bottom: 18px;
      text-align: center;
    }
    #lb-body {
      width: min(560px, 94vw);
      flex: 1; overflow-y: auto;
      background: rgba(255,255,255,0.14);
      border-radius: 16px;
      padding: 14px;
      display: flex; flex-direction: column; gap: 6px;
    }
    .lb-row {
      display: flex; align-items: center; gap: 10px;
      background: rgba(255,255,255,0.10);
      border-radius: 10px;
      padding: 8px 12px;
    }
    .lb-row.you {
      background: rgba(255,255,255,0.32);
      box-shadow: 0 0 0 1.5px rgba(255,255,255,0.6) inset;
    }
    .lb-rank {
      font-family: 'Press Start 2P', monospace;
      font-size: 11px; color: rgba(255,255,255,0.6);
      width: 30px; flex-shrink: 0;
    }
    .lb-avatar {
      width: 26px; height: 26px; border-radius: 50%;
      flex-shrink: 0; background: rgba(255,255,255,0.3);
    }
    .lb-mid { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .lb-name {
      color: white; font-size: 12px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .lb-sub {
      display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
      font-size: 9px; color: rgba(255,255,255,0.65);
    }
    .lb-sub img { width: 12px; height: 12px; vertical-align: middle; margin-right: 2px; }
    .lb-sub span.lb-sub-item { display: inline-flex; align-items: center; }
    .lb-score {
      font-family: 'Press Start 2P', monospace;
      font-size: 15px; color: white;
      text-shadow: 1px 1px 2px rgba(0,0,0,0.25);
      flex-shrink: 0;
    }
    #lb-pinned {
      width: min(560px, 94vw);
      margin-top: 8px;
      text-align: center;
      font-size: 11px; color: rgba(255,255,255,0.9);
      background: rgba(255,255,255,0.14);
      border-radius: 10px; padding: 8px;
      display: none;
    }
    #lb-empty, #lb-loading {
      text-align: center; color: rgba(255,255,255,0.6);
      font-size: 12px; padding: 20px 0;
    }
    #lb-back {
      margin-top: 16px;
      font-family: 'Press Start 2P', monospace;
      font-size: 10px; border: none; border-radius: 12px;
      background: white; color: #5B8C5A;
      padding: 12px 28px; cursor: pointer;
      touch-action: manipulation;
    }
    #lb-back:hover { opacity: 0.9; }
  `;
  document.head.appendChild(style);
}

// ===== GAME OVER 卡片 =====
function buildGameOverCard() {
  const screen = document.createElement('div');
  screen.id = 'result-screen';
  screen.classList.add('hidden');
  screen.innerHTML = `
    <div id="result-card">
      <div id="result-title">GAME OVER</div>
      <div id="result-score">0</div>
      <div id="result-score-label">FINAL SCORE</div>
      <div id="result-buttons">
        <button class="res-btn" id="rb-restart">RESTART</button>
        <button class="res-btn" id="rb-menu">MENU</button>
        <button class="res-btn" id="rb-stats">STATS</button>
      </div>
    </div>
  `;
  document.body.appendChild(screen);
  return screen;
}

// ===== RESTART 对话框 =====
function buildRestartDialog() {
  const dialog = document.createElement('div');
  dialog.id = 'restart-dialog';
  dialog.classList.add('hidden');
  dialog.innerHTML = `
    <div id="rd-inner">
      <div id="rd-title">CHOOSE YOUR SEED</div>
      <button class="rd-opt primary" id="rd-same">
        <span>🔁</span>
        <span>SAME SEED<br><small id="rd-seed-val" style="font-size:9px;opacity:0.75;font-family:sans-serif"></small></span>
      </button>
      <div id="rd-alt">🎲 switch to new random seed</div>
      <div id="rd-cancel">CANCEL</div>
    </div>
  `;
  document.body.appendChild(dialog);
  return dialog;
}

// ===== STATS 全屏页面 =====
function buildStatsScreen() {
  const screen = document.createElement('div');
  screen.id = 'stats-screen';
  screen.classList.add('hidden');
  screen.innerHTML = `
    <div id="stats-left">
      <div id="stats-left-label">press SPACE to dance ✨</div>
    </div>
    <div id="stats-right">

      <!-- 总分 + 最高连击高亮区 -->
      <div id="stats-highlight">
        <div class="highlight-block">
          <div class="highlight-value" id="sh-score">0</div>
          <div class="highlight-label">SCORE</div>
        </div>
        <div class="highlight-divider"></div>
        <div class="highlight-block">
          <div class="highlight-value" id="sh-combo">0</div>
          <div class="highlight-label">MAX COMBO</div>
        </div>
      </div>

      <div id="stats-intro">Along the way, you encountered...</div>
      <div id="stats-items-title">ENCOUNTERS</div>

      <div id="stats-items-grid">
        <div class="stats-item-cell">
          <img src="./icons/margarita_flower-icon.png" alt="daisy">
          <span class="stats-item-name">Daisy platforms</span>
          <span id="si-margarita">0</span>
        </div>
        <div class="stats-item-cell">
          <img src="./icons/calendula_flower-icon.png" alt="marigold">
          <span class="stats-item-name">Marigold platforms</span>
          <span id="si-calendula">0</span>
        </div>
        <div class="stats-item-cell">
          <img src="./icons/InktobVR Day02 Little Flowers-icon.png" alt="grass">
          <span class="stats-item-name">Grass patches</span>
          <span id="si-grass">0</span>
        </div>
        <div class="stats-item-cell">
          <img src="./icons/lowpoly_egg-icon.png" alt="egg">
          <span class="stats-item-name">Eggs</span>
          <span id="si-egg">0</span>
        </div>
        <div class="stats-item-cell">
          <img src="./icons/chicken-icon.png" alt="chicken">
          <span class="stats-item-name">Chickens</span>
          <span id="si-chicken">0</span>
        </div>
        <div class="stats-item-cell">
          <img src="./icons/low_poly_basket-icon.png" alt="basket">
          <span class="stats-item-name">Baskets</span>
          <span id="si-basket">0</span>
        </div>
        <div class="stats-item-cell">
          <img src="./icons/luna_the_lowpoly_dog-icon.png" alt="dog">
          <span class="stats-item-name">Dogs</span>
          <span id="si-dog">0</span>
        </div>
      </div>

      <div id="stats-ranking">
        <div id="stats-ranking-title">🏆 LEADERBOARD</div>
        <div id="stats-ranking-arrow">→</div>
      </div>

      <div id="stats-btns">
        <button class="stats-btn" id="sb-back">← BACK</button>
        <button class="stats-btn" id="sb-restart2">RESTART</button>
      </div>
    </div>
  `;
  document.body.appendChild(screen);
  return screen;
}

// ===== 独立排行榜全屏页面 =====
function buildLeaderboardScreen() {
  const screen = document.createElement('div');
  screen.id = 'lb-screen';
  screen.classList.add('hidden');
  screen.innerHTML = `
    <div id="lb-title">🏆 LEADERBOARD — TOP 100</div>
    <div id="lb-body"><div id="lb-loading">loading...</div></div>
    <div id="lb-pinned"></div>
    <button id="lb-back">← BACK</button>
  `;
  document.body.appendChild(screen);
  return screen;
}

// ===== 主入口 =====
export function createResultScreen({ onRestart, onMenu, onShowStats, onHideStats }) {
  injectStyles();
  const gameOverScreen = buildGameOverCard();
  const dialog        = buildRestartDialog();
  const statsScreen   = buildStatsScreen();
  const lbScreen      = buildLeaderboardScreen();

  let primaryIsSame = true;

  function openRestartDialog() {
    document.getElementById('rd-seed-val').textContent = `seed: ${gameSeed}`;
    updateDialogLayout();
    dialog.classList.remove('hidden');
  }

  function updateDialogLayout() {
    const same = document.getElementById('rd-same');
    const alt  = document.getElementById('rd-alt');
    if (primaryIsSame) {
      same.className = 'rd-opt primary';
      alt.textContent = '🎲 switch to new random seed';
    } else {
      same.className = 'rd-opt secondary';
      alt.textContent = '🔁 use same seed instead';
    }
  }

  document.getElementById('rd-alt').addEventListener('click', () => {
    primaryIsSame = !primaryIsSame;
    updateDialogLayout();
  });

  document.getElementById('rd-same').addEventListener('click', () => {
    const seed = primaryIsSame ? gameSeed : Date.now();
    if (!primaryIsSame) setGameSeed(seed);
    dialog.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    statsScreen.classList.add('hidden');
    if (onHideStats) onHideStats();
    onRestart(seed);
  });

  document.getElementById('rd-cancel').addEventListener('click', () => {
    dialog.classList.add('hidden');
  });

  document.getElementById('rb-restart').addEventListener('click', openRestartDialog);

  document.getElementById('rb-menu').addEventListener('click', () => {
    gameOverScreen.classList.add('hidden');
    onMenu();
  });

  document.getElementById('rb-stats').addEventListener('click', () => {
    fillStatsData();
    gameOverScreen.classList.add('hidden');
    statsScreen.classList.remove('hidden');
    if (onShowStats) onShowStats();
  });

  document.getElementById('sb-back').addEventListener('click', () => {
    statsScreen.classList.add('hidden');
    if (onHideStats) onHideStats();
    gameOverScreen.classList.remove('hidden');
  });

  document.getElementById('sb-restart2').addEventListener('click', openRestartDialog);

  document.getElementById('stats-ranking').addEventListener('click', () => {
    openLeaderboardScreen();
    lbScreen.classList.remove('hidden');
  });

  document.getElementById('lb-back').addEventListener('click', () => {
    lbScreen.classList.add('hidden');
  });
}

function fillStatsData() {
  // 高亮区
  document.getElementById('sh-score').textContent = document.getElementById('result-score')?.textContent || '0';
  document.getElementById('sh-combo').textContent = Stats.maxCombo;

  // 道具列表
  document.getElementById('si-margarita').textContent = Stats.margaritaCount;
  document.getElementById('si-calendula').textContent = Stats.calendulaCount;
  document.getElementById('si-grass').textContent     = Stats.grassCount;
  document.getElementById('si-egg').textContent       = Stats.eggCount;
  document.getElementById('si-chicken').textContent   = Stats.chickenCount;
  document.getElementById('si-basket').textContent    = Stats.basketCount;
  document.getElementById('si-dog').textContent       = Stats.dogCount;
}

// ===== 独立排行榜页面：加载与渲染 =====
const LB_ITEM_ICONS = [
  ['margaritaCount', './icons/margarita_flower-icon.png'],
  ['calendulaCount', './icons/calendula_flower-icon.png'],
  ['grassCount', './icons/InktobVR Day02 Little Flowers-icon.png'],
  ['eggCount', './icons/lowpoly_egg-icon.png'],
  ['chickenCount', './icons/chicken-icon.png'],
  ['basketCount', './icons/low_poly_basket-icon.png'],
  ['dogCount', './icons/luna_the_lowpoly_dog-icon.png'],
];

function buildSubLine(entry) {
  const parts = [];
  if (entry.maxCombo > 0) {
    parts.push(`<span class="lb-sub-item">🔥 ${entry.maxCombo} combo</span>`);
  }
  LB_ITEM_ICONS.forEach(([key, icon]) => {
    const count = entry[key] || 0;
    if (count > 0) {
      parts.push(`<span class="lb-sub-item"><img src="${icon}" alt="">${count}</span>`);
    }
  });
  return parts.join('');
}

async function openLeaderboardScreen() {
  const bodyEl = document.getElementById('lb-body');
  const pinnedEl = document.getElementById('lb-pinned');
  pinnedEl.style.display = 'none';
  bodyEl.innerHTML = `<div id="lb-loading">loading...</div>`;

  const user = getCurrentUser();

  try {
    const entries = await fetchLeaderboard(100);

    if (entries.length === 0) {
      bodyEl.innerHTML = `<div id="lb-empty">no scores yet — be the first!</div>`;
    } else {
      bodyEl.innerHTML = entries.map((e) => {
        const isYou = user && e.uid === user.uid;
        const avatar = e.photoURL
          ? `<img class="lb-avatar" src="${e.photoURL}" alt="">`
          : `<div class="lb-avatar"></div>`;
        return `
          <div class="lb-row ${isYou ? 'you' : ''}">
            <span class="lb-rank">#${e.rank}</span>
            ${avatar}
            <div class="lb-mid">
              <div class="lb-name">${escapeHtml(e.displayName || 'Player')}</div>
              <div class="lb-sub">${buildSubLine(e)}</div>
            </div>
            <span class="lb-score">${e.score}</span>
          </div>
        `;
      }).join('');
    }

    // 若登录用户"历史最佳一局"没进前100，单独标出真实排名
    if (user) {
      const inTop = entries.some((e) => e.uid === user.uid);
      if (!inTop) {
        const rank = await getUserBestRank();
        if (rank != null) {
          pinnedEl.style.display = 'block';
          pinnedEl.textContent = `your best run ranks #${rank}`;
        }
      }
    } else {
      pinnedEl.style.display = 'block';
      pinnedEl.textContent = 'sign in on the start screen to join the leaderboard';
    }
  } catch (err) {
    console.warn('排行榜加载失败：', err);
    bodyEl.innerHTML = `<div id="lb-empty">couldn't load leaderboard</div>`;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function showResultScreen(finalScore) {
  document.getElementById('result-score').textContent = finalScore ?? 0;
  document.getElementById('result-screen').classList.remove('hidden');
}

export function hideResultScreen() {
  document.getElementById('result-screen')?.classList.add('hidden');
  document.getElementById('restart-dialog')?.classList.add('hidden');
  document.getElementById('stats-screen')?.classList.add('hidden');
  document.getElementById('lb-screen')?.classList.add('hidden');
}
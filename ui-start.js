// ===================================================
// 开始页面 ui-start.js
// ===================================================
import { seedFromString, setGameSeed, gameSeed } from './game-state.js';
import {
  onAuthChange, signInWithGoogle, signInWithGithub,
  signUpWithEmail, signInWithEmail, resetPassword,
  signOutUser, getCurrentUser,
} from './firebase-services.js';

// ===== 云朵CSS =====
function injectCloudStyles() {
  const style = document.createElement('style');
  style.textContent = `
    #start-screen {
      position: fixed; inset: 0;
      background: #87CEEB;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      font-family: 'Noto Sans SC', sans-serif;
      z-index: 100;
      overflow: hidden;
    }
    #start-screen.hidden { display: none; }

    /* 云朵 */
    .cloud {
      position: absolute;
      background: white;
      border-radius: 50px;
      filter: blur(8px);
      opacity: 0.82;
      animation: cloudDrift linear infinite;
    }
    .cloud::before, .cloud::after {
      content: '';
      position: absolute;
      background: white;
      border-radius: 50%;
    }
    @keyframes cloudDrift {
      from { transform: translateX(-120%); }
      to   { transform: translateX(120vw); }
    }

    /* 标题 */
    #start-title {
      font-family: 'Press Start 2P', monospace;
      font-size: clamp(18px, 4vw, 32px);
      color: white;
      text-shadow: 2px 2px 0 rgba(0,0,0,0.18);
      margin-bottom: 8px;
      letter-spacing: 2px;
      z-index: 2;
      text-align: center;
    }
    #start-subtitle {
      font-family: 'Noto Sans SC', sans-serif;
      font-size: 14px;
      color: rgba(255,255,255,0.7);
      margin-bottom: 48px;
      z-index: 2;
    }

    /* 输入区域 */
    #seed-label {
      font-size: 12px;
      color: rgba(255,255,255,0.85);
      align-self: flex-start;
      letter-spacing: 1px;
    }
    #seed-input {
      font-family: 'Press Start 2P', monospace;
      font-size: 16px;                          /* ≥16px防止iOS自动缩放 */
      background: rgba(255,255,255,0.3);
      border: 1.5px solid rgba(255,255,255,0.6);
      border-radius: 10px;
      color: white;
      padding: 10px 16px;
      outline: none;
      width: 220px;
      text-align: center;
      letter-spacing: 2px;
      touch-action: manipulation;              /* 防止双击缩放 */
    }
    #seed-input::placeholder { color: rgba(255,255,255,0.5); font-size: 13px; }
    #seed-input:focus { border-color: white; background: rgba(255,255,255,0.4); }

    /* 按钮 */
    .start-btn {
      font-family: 'Press Start 2P', monospace;
      font-size: 12px;
      border: none; border-radius: 12px;
      padding: 12px 28px;
      cursor: pointer;
      letter-spacing: 1px;
      transition: transform 0.1s, opacity 0.1s;
      touch-action: manipulation;              /* 防止双击缩放 */
    }
    .start-btn:active { transform: scale(0.96); }
    #btn-start-seed {
      background: white;
      color: #5B8C5A;
      width: 100%;
    }
    #btn-start-seed:hover { opacity: 0.9; }
    #btn-random {
      background: transparent;
      color: rgba(255,255,255,0.8);
      border: 1.5px solid rgba(255,255,255,0.5);
      font-size: 11px;
      padding: 8px 20px;
    }
    #btn-random:hover { background: rgba(255,255,255,0.15); color: white; }

    #start-seed-display {
      font-size: 11px;
      color: rgba(255,255,255,0.5);
      margin-top: 4px;
      font-family: 'Noto Sans SC', sans-serif;
    }

    /* 登录区域，右上角常驻 */
    #login-area {
      position: absolute;
      top: calc(16px + env(safe-area-inset-top));
      right: 16px;
      z-index: 3;
      font-family: 'Noto Sans SC', sans-serif;
    }
    #login-btn {
      display: flex; align-items: center; gap: 8px;
      background: rgba(255,255,255,0.25);
      border: 1.5px solid rgba(255,255,255,0.55);
      border-radius: 20px;
      padding: 7px 14px 7px 10px;
      color: white;
      font-size: 12px;
      cursor: pointer;
      backdrop-filter: blur(4px);
      touch-action: manipulation;
      transition: background 0.15s;
    }
    #login-btn:hover { background: rgba(255,255,255,0.38); }
    #login-btn svg { flex-shrink: 0; }

    #user-chip {
      display: none;
      align-items: center; gap: 8px;
      background: rgba(255,255,255,0.22);
      border: 1.5px solid rgba(255,255,255,0.5);
      border-radius: 20px;
      padding: 5px 12px 5px 5px;
      backdrop-filter: blur(4px);
    }
    #user-chip img {
      width: 26px; height: 26px;
      border-radius: 50%;
      border: 1.5px solid rgba(255,255,255,0.8);
    }
    #user-chip-name {
      color: white;
      font-size: 12px;
      max-width: 110px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #signout-btn {
      color: rgba(255,255,255,0.65);
      font-size: 11px;
      cursor: pointer;
      text-decoration: underline;
      touch-action: manipulation;
      margin-left: 2px;
    }
    #signout-btn:hover { color: white; }

    /* 游客未登录确认弹窗 */
    #guest-confirm {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.4);
      display: flex; align-items: center; justify-content: center;
      z-index: 400;
    }
    #guest-confirm.hidden { display: none; }
    #gc-inner {
      background: white; border-radius: 20px;
      padding: 26px 28px;
      width: min(300px, 86vw);
      display: flex; flex-direction: column;
      align-items: center; gap: 14px;
      font-family: 'Noto Sans SC', sans-serif;
    }
    #gc-text {
      font-size: 13px; color: #444;
      text-align: center; line-height: 1.7;
    }
    #gc-buttons { display: flex; gap: 10px; width: 100%; }
    .gc-btn {
      flex: 1;
      font-family: 'Press Start 2P', monospace;
      font-size: 9px; border: none; border-radius: 12px;
      padding: 12px 6px; cursor: pointer;
      touch-action: manipulation;
      transition: transform 0.1s, opacity 0.1s;
    }
    .gc-btn:active { transform: scale(0.96); }
    #gc-continue { background: #5B8C5A; color: white; }
    #gc-continue:hover { opacity: 0.9; }
    #gc-back { background: transparent; color: #5B8C5A; border: 1.5px solid #5B8C5A; }
    #gc-back:hover { background: rgba(91,140,90,0.08); }

    /* 登录方式选择弹窗 */
    #auth-modal {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.4);
      display: flex; align-items: center; justify-content: center;
      z-index: 450;
    }
    #auth-modal.hidden { display: none; }
    #auth-inner {
      background: white; border-radius: 20px;
      padding: 26px 26px;
      width: min(300px, 86vw);
      display: flex; flex-direction: column;
      gap: 12px;
      font-family: 'Noto Sans SC', sans-serif;
    }
    #auth-title {
      font-family: 'Press Start 2P', monospace;
      font-size: 12px; color: #3a3a3a;
      text-align: center; margin-bottom: 4px;
    }
    .auth-provider-btn {
      display: flex; align-items: center; justify-content: center; gap: 10px;
      border-radius: 12px; border: 1.5px solid #ddd;
      background: white; color: #333;
      font-size: 13px; padding: 11px 14px;
      cursor: pointer; touch-action: manipulation;
      transition: background 0.15s;
    }
    .auth-provider-btn:hover { background: #f5f5f5; }
    .auth-provider-btn svg, .auth-provider-btn img { flex-shrink: 0; }
    #auth-cancel {
      text-align: center; color: #bbb; font-size: 12px;
      cursor: pointer; margin-top: 4px; touch-action: manipulation;
    }
    #auth-cancel:hover { color: #888; }
    #auth-error {
      color: #d9534f; font-size: 11px; text-align: center;
      display: none; line-height: 1.5;
    }

    /* 邮箱表单 */
    #auth-email-form { display: flex; flex-direction: column; gap: 10px; }
    #auth-email-form input {
      font-size: 14px; padding: 10px 12px;
      border: 1.5px solid #ddd; border-radius: 10px;
      outline: none; font-family: 'Noto Sans SC', sans-serif;
    }
    #auth-email-form input:focus { border-color: #5B8C5A; }
    #auth-email-submit {
      background: #5B8C5A; color: white; border: none;
      border-radius: 12px; padding: 11px; cursor: pointer;
      font-size: 13px; touch-action: manipulation;
    }
    #auth-email-submit:hover { opacity: 0.9; }
    #auth-email-toggle, #auth-forgot {
      text-align: center; font-size: 11px; color: #5B8C5A;
      cursor: pointer; text-decoration: underline;
      touch-action: manipulation;
    }
    #auth-back {
      text-align: center; color: #bbb; font-size: 11px;
      cursor: pointer; touch-action: manipulation;
    }
    #auth-back:hover { color: #888; }

    /* 刘海屏/底部安全区 */
    #start-panel {
      z-index: 2;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
      background: rgba(255,255,255,0.18);
      backdrop-filter: blur(6px);
      border-radius: 20px;
      padding: 28px 36px;
      padding-bottom: calc(28px + env(safe-area-inset-bottom));
      border: 1px solid rgba(255,255,255,0.4);
    }
  `;
  document.head.appendChild(style);
}

// ===== 云朵生成 =====
function createClouds(container) {
  const clouds = [
    { w: 180, h: 55,  top: '12%', dur: 38, delay: 0    },
    { w: 120, h: 38,  top: '22%', dur: 52, delay: -14  },
    { w: 220, h: 65,  top: '8%',  dur: 45, delay: -22  },
    { w: 90,  h: 30,  top: '32%', dur: 60, delay: -8   },
    { w: 150, h: 45,  top: '18%', dur: 42, delay: -30  },
  ];

  clouds.forEach(c => {
    const el = document.createElement('div');
    el.className = 'cloud';
    el.style.cssText = `
      width: ${c.w}px; height: ${c.h}px;
      top: ${c.top};
      animation-duration: ${c.dur}s;
      animation-delay: ${c.delay}s;
    `;
    // 云朵凸起
    el.style.setProperty('--bw', `${c.w * 0.55}px`);
    el.style.setProperty('--bh', `${c.h * 1.5}px`);
    const pseudo = document.createElement('style');
    // 用唯一class模拟before/after
    const id = `cloud-${Math.random().toString(36).slice(2)}`;
    el.classList.add(id);
    pseudo.textContent = `
      .${id}::before {
        width: ${c.w * 0.5}px; height: ${c.h * 1.6}px;
        top: -${c.h * 0.7}px; left: ${c.w * 0.15}px;
      }
      .${id}::after {
        width: ${c.w * 0.38}px; height: ${c.h * 1.3}px;
        top: -${c.h * 0.5}px; left: ${c.w * 0.5}px;
      }
    `;
    document.head.appendChild(pseudo);
    container.appendChild(el);
  });
}

// ===== 创建开始页面DOM =====
export function createStartScreen(onStart) {
  injectCloudStyles();

  const screen = document.createElement('div');
  screen.id = 'start-screen';

  // 云朵层
  createClouds(screen);

  // 登录区域
  const loginArea = document.createElement('div');
  loginArea.id = 'login-area';

  const loginBtn = document.createElement('div');
  loginBtn.id = 'login-btn';
  loginBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.6 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l6-6C34.5 5.1 29.5 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.4-.1-2.7-.4-4.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l6-6C34.5 6.1 29.5 4 24 4c-7.4 0-13.7 4.2-16.9 10.3-.3.6-.6 1.3-.8 2z"/>
      <path fill="#4CAF50" d="M24 44c5.3 0 10.1-2 13.7-5.4l-6.3-5.3c-2.1 1.4-4.7 2.2-7.4 2.2-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9.5 39.5 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4-4 5.4l6.3 5.3C39.9 37.1 44 31 44 24c0-1.4-.1-2.7-.4-4.5z"/>
    </svg>
    <span>SIGN IN</span>
  `;

  const userChip = document.createElement('div');
  userChip.id = 'user-chip';
  userChip.innerHTML = `
    <img id="user-chip-avatar" src="" alt="">
    <span id="user-chip-name"></span>
    <span id="signout-btn">sign out</span>
  `;

  loginArea.append(loginBtn, userChip);

  // 标题
  const title = document.createElement('div');
  title.id = 'start-title';
  title.textContent = "JOI'S FLOWER TOUR";

  const subtitle = document.createElement('div');
  subtitle.id = 'start-subtitle';
  subtitle.textContent = 'tap & hold to charge · release to jump';

  // 输入面板
  const panel = document.createElement('div');
  panel.id = 'start-panel';

  const label = document.createElement('div');
  label.id = 'seed-label';
  label.textContent = 'ENTER SEED (number or word)';

  const input = document.createElement('input');
  input.id = 'seed-input';
  input.type = 'text';
  input.placeholder = 'leave empty = random';
  input.maxLength = 20;

  const btnStart = document.createElement('button');
  btnStart.id = 'btn-start-seed';
  btnStart.className = 'start-btn';
  btnStart.textContent = '▶ START';

  const btnRandom = document.createElement('button');
  btnRandom.id = 'btn-random';
  btnRandom.className = 'start-btn';
  btnRandom.textContent = '🎲 RANDOM SEED';

  const seedDisplay = document.createElement('div');
  seedDisplay.id = 'start-seed-display';
  seedDisplay.textContent = '';

  panel.append(label, input, btnStart, btnRandom, seedDisplay);
  screen.append(loginArea, title, subtitle, panel);
  document.body.appendChild(screen);

  // ===== 登录方式选择弹窗 =====
  const authModal = document.createElement('div');
  authModal.id = 'auth-modal';
  authModal.classList.add('hidden');
  authModal.innerHTML = `
    <div id="auth-inner">
      <div id="auth-title">SIGN IN</div>
      <div id="auth-providers">
        <button class="auth-provider-btn" id="auth-google">
          <svg width="16" height="16" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.6 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l6-6C34.5 5.1 29.5 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.4-.1-2.7-.4-4.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l6-6C34.5 6.1 29.5 4 24 4c-7.4 0-13.7 4.2-16.9 10.3-.3.6-.6 1.3-.8 2z"/>
            <path fill="#4CAF50" d="M24 44c5.3 0 10.1-2 13.7-5.4l-6.3-5.3c-2.1 1.4-4.7 2.2-7.4 2.2-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9.5 39.5 16.2 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4-4 5.4l6.3 5.3C39.9 37.1 44 31 44 24c0-1.4-.1-2.7-.4-4.5z"/>
          </svg>
          <span>Continue with Google</span>
        </button>
        <button class="auth-provider-btn" id="auth-github">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="#181717">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
              0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13
              -.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66
              .07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15
              -.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0
              1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82
              1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01
              1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
          </svg>
          <span>Continue with GitHub</span>
        </button>
        <button class="auth-provider-btn" id="auth-email-btn">
          <span>✉️</span>
          <span>Continue with Email</span>
        </button>
      </div>

      <form id="auth-email-form" style="display:none;">
        <input type="email" id="auth-email-input" placeholder="email" autocomplete="email" required>
        <input type="password" id="auth-password-input" placeholder="password" autocomplete="current-password" required>
        <button type="submit" id="auth-email-submit">Sign In</button>
        <div id="auth-email-toggle">Need an account? Sign up</div>
        <div id="auth-forgot">Forgot password?</div>
        <div id="auth-back">← back</div>
      </form>

      <div id="auth-error"></div>
      <div id="auth-cancel">Cancel</div>
    </div>
  `;
  document.body.appendChild(authModal);

  const authProvidersView = authModal.querySelector('#auth-providers');
  const authEmailForm = authModal.querySelector('#auth-email-form');
  const authErrorEl = authModal.querySelector('#auth-error');
  const authCancelEl = authModal.querySelector('#auth-cancel');
  const authEmailInput = authModal.querySelector('#auth-email-input');
  const authPasswordInput = authModal.querySelector('#auth-password-input');
  const authSubmitBtn = authModal.querySelector('#auth-email-submit');
  const authToggleEl = authModal.querySelector('#auth-email-toggle');
  let emailMode = 'signin'; // 'signin' | 'signup'

  function friendlyAuthError(err) {
    const code = err?.code || '';
    if (code.includes('wrong-password') || code.includes('invalid-credential')) return 'Incorrect email or password.';
    if (code.includes('user-not-found')) return 'No account found with this email.';
    if (code.includes('email-already-in-use')) return 'An account already exists with this email.';
    if (code.includes('weak-password')) return 'Password should be at least 6 characters.';
    if (code.includes('invalid-email')) return 'That email address looks invalid.';
    if (code.includes('popup-closed-by-user')) return null; // 用户主动关闭弹窗，不算错误
    return 'Something went wrong. Please try again.';
  }

  function showAuthError(msg) {
    if (!msg) { authErrorEl.style.display = 'none'; return; }
    authErrorEl.textContent = msg;
    authErrorEl.style.display = 'block';
  }

  function resetAuthModalView() {
    authProvidersView.style.display = 'flex';
    authProvidersView.style.flexDirection = 'column';
    authProvidersView.style.gap = '10px';
    authEmailForm.style.display = 'none';
    authCancelEl.style.display = 'block';
    showAuthError(null);
    emailMode = 'signin';
    authSubmitBtn.textContent = 'Sign In';
    authToggleEl.textContent = 'Need an account? Sign up';
    authEmailInput.value = '';
    authPasswordInput.value = '';
  }

  function openAuthModal() {
    resetAuthModalView();
    authModal.classList.remove('hidden');
  }
  function closeAuthModal() {
    authModal.classList.add('hidden');
  }

  authCancelEl.addEventListener('click', closeAuthModal);

  authModal.querySelector('#auth-google').addEventListener('click', async () => {
    showAuthError(null);
    try {
      await signInWithGoogle();
      closeAuthModal();
    } catch (err) {
      showAuthError(friendlyAuthError(err));
    }
  });

  authModal.querySelector('#auth-github').addEventListener('click', async () => {
    showAuthError(null);
    try {
      await signInWithGithub();
      closeAuthModal();
    } catch (err) {
      showAuthError(friendlyAuthError(err));
    }
  });

  authModal.querySelector('#auth-email-btn').addEventListener('click', () => {
    authProvidersView.style.display = 'none';
    authCancelEl.style.display = 'none';
    authEmailForm.style.display = 'flex';
    authEmailForm.style.flexDirection = 'column';
    showAuthError(null);
  });

  authModal.querySelector('#auth-back').addEventListener('click', () => {
    resetAuthModalView();
  });

  authToggleEl.addEventListener('click', () => {
    emailMode = emailMode === 'signin' ? 'signup' : 'signin';
    authSubmitBtn.textContent = emailMode === 'signin' ? 'Sign In' : 'Create Account';
    authToggleEl.textContent = emailMode === 'signin' ? 'Need an account? Sign up' : 'Already have an account? Sign in';
    showAuthError(null);
  });

  authModal.querySelector('#auth-forgot').addEventListener('click', async () => {
    const email = authEmailInput.value.trim();
    if (!email) { showAuthError('Enter your email above first.'); return; }
    try {
      await resetPassword(email);
      showAuthError(null);
      authErrorEl.style.color = '#5B8C5A';
      authErrorEl.textContent = 'Password reset email sent — check your inbox.';
      authErrorEl.style.display = 'block';
    } catch (err) {
      authErrorEl.style.color = '#d9534f';
      showAuthError(friendlyAuthError(err));
    }
  });

  authEmailForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = authEmailInput.value.trim();
    const password = authPasswordInput.value;
    showAuthError(null);
    try {
      if (emailMode === 'signup') {
        await signUpWithEmail(email, password);
      } else {
        await signInWithEmail(email, password);
      }
      closeAuthModal();
    } catch (err) {
      showAuthError(friendlyAuthError(err));
    }
  });

  // ===== 登录状态UI同步 =====
  const chipAvatar = userChip.querySelector('#user-chip-avatar');
  const chipName = userChip.querySelector('#user-chip-name');
  const signoutBtn = userChip.querySelector('#signout-btn');

  onAuthChange((user) => {
    if (user) {
      loginBtn.style.display = 'none';
      userChip.style.display = 'flex';
      chipAvatar.src = user.photoURL || '';
      chipName.textContent = user.displayName || user.email || 'Player';
    } else {
      loginBtn.style.display = 'flex';
      userChip.style.display = 'none';
    }
  });

  loginBtn.addEventListener('click', () => {
    openAuthModal();
  });

  signoutBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    signOutUser();
  });

  // ===== 游客未登录确认弹窗 =====
  const guestConfirm = document.createElement('div');
  guestConfirm.id = 'guest-confirm';
  guestConfirm.classList.add('hidden');
  guestConfirm.innerHTML = `
    <div id="gc-inner">
      <div id="gc-text">You're not signed in — this run won't be saved to the leaderboard.</div>
      <div id="gc-buttons">
        <button class="gc-btn" id="gc-back">Back</button>
        <button class="gc-btn" id="gc-continue">Continue</button>
      </div>
    </div>
  `;
  document.body.appendChild(guestConfirm);

  let pendingSeed = null;
  function requestStart(seed) {
    if (getCurrentUser()) {
      startWithSeed(seed);
      return;
    }
    pendingSeed = seed;
    guestConfirm.classList.remove('hidden');
  }
  guestConfirm.querySelector('#gc-back').addEventListener('click', () => {
    pendingSeed = null;
    guestConfirm.classList.add('hidden');
  });
  guestConfirm.querySelector('#gc-continue').addEventListener('click', () => {
    guestConfirm.classList.add('hidden');
    if (pendingSeed != null) startWithSeed(pendingSeed);
    pendingSeed = null;
  });

  // ===== 事件 =====
  function startWithSeed(seed) {
    setGameSeed(seed);
    screen.classList.add('hidden');
    onStart(seed);
  }

  btnStart.addEventListener('click', () => {
    const val = input.value.trim();
    const seed = val ? seedFromString(val) : Date.now();
    seedDisplay.textContent = `SEED: ${seed}`;
    setTimeout(() => requestStart(seed), 300);
  });

  btnRandom.addEventListener('click', () => {
    const seed = Date.now();
    input.value = String(seed);          // 填回输入框让玩家看到种子
    seedDisplay.textContent = `SEED: ${seed}`;
    setTimeout(() => requestStart(seed), 300);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnStart.click();
  });

  return screen;
}

export function showStartScreen() {
  const el = document.getElementById('start-screen');
  if (el) el.classList.remove('hidden');
}

export function hideStartScreen() {
  const el = document.getElementById('start-screen');
  if (el) el.classList.add('hidden');
}
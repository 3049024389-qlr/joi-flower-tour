// ===================================================
// Firebase 服务模块 firebase-services.js
// 负责：Google/GitHub/邮箱登录 / 保存单局记录 / 排行榜查询 / 破纪录基准查询
//
// 重要：本文件不在顶部用静态 import 引入 firebase/* 包。
// 原因：firebase/* 通过 importmap 指向 gstatic.com，国内网络若无法访问，
// 静态 import 会导致"这个文件加载失败"，进而拖累所有 import 了本文件的
// main.js / ui-start.js / ui-result.js 全部无法运行，整个游戏直接卡死。
// 改成运行时才会真正尝试加载的 import()，并包一层容错：
// 加载失败时，游戏本体完全不受影响，只有登录/排行榜相关功能优雅降级。
// ===================================================
import { firebaseConfig } from './firebase-config.js';

const PER_USER_CAP = 10; // 每个用户最多保留的历史最佳局数

// ===== SDK函数引用（动态加载成功后才会被填充） =====
let _signInWithPopup, _signOut, _onAuthStateChanged;
let _createUserWithEmailAndPassword, _signInWithEmailAndPassword, _sendPasswordResetEmail;
let _collection, _addDoc, _deleteDoc, _query, _where, _orderBy, _limit, _getDocs, _getCountFromServer;

let auth = null;
let db = null;
let googleProvider = null;
let githubProvider = null;

let firebaseReady = false;   // 加载并初始化成功
let firebaseFailed = false;  // 加载失败（多半是网络无法访问Google服务）
let initPromise = null;

// ===== 登录状态 =====
let currentUser = null;
let authReady = false;
const authListeners = [];

// ===== 懒加载 + 初始化Firebase（只会真正执行一次，后续调用复用同一个Promise） =====
function initFirebase() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const [appMod, authMod, fsMod] = await Promise.all([
        import('firebase/app'),
        import('firebase/auth'),
        import('firebase/firestore'),
      ]);

      const app = appMod.initializeApp(firebaseConfig);
      auth = authMod.getAuth(app);
      db = fsMod.getFirestore(app);
      googleProvider = new authMod.GoogleAuthProvider();
      githubProvider = new authMod.GithubAuthProvider();

      _signInWithPopup = authMod.signInWithPopup;
      _signOut = authMod.signOut;
      _onAuthStateChanged = authMod.onAuthStateChanged;
      _createUserWithEmailAndPassword = authMod.createUserWithEmailAndPassword;
      _signInWithEmailAndPassword = authMod.signInWithEmailAndPassword;
      _sendPasswordResetEmail = authMod.sendPasswordResetEmail;

      _collection = fsMod.collection;
      _addDoc = fsMod.addDoc;
      _deleteDoc = fsMod.deleteDoc;
      _query = fsMod.query;
      _where = fsMod.where;
      _orderBy = fsMod.orderBy;
      _limit = fsMod.limit;
      _getDocs = fsMod.getDocs;
      _getCountFromServer = fsMod.getCountFromServer;

      _onAuthStateChanged(auth, (user) => {
        currentUser = user;
        authReady = true;
        authListeners.forEach((cb) => cb(user));
      });

      firebaseReady = true;
    } catch (err) {
      console.warn('Firebase 加载失败（可能是当前网络无法访问Google服务）：', err);
      firebaseFailed = true;
      authReady = true;
      authListeners.forEach((cb) => cb(null)); // 让登录UI正常显示"未登录"状态，不用一直转圈等待
    }
  })();
  return initPromise;
}
initFirebase(); // 页面加载即在后台尝试，不阻塞任何东西

// 需要真正调用Firebase功能前先确认已就绪；失败则抛出统一错误，由调用方友好提示
async function ensureReady() {
  await initFirebase();
  if (firebaseFailed) {
    const err = new Error('Firebase service unavailable');
    err.code = 'app/unavailable';
    throw err;
  }
}

export function isFirebaseAvailable() { return firebaseReady; }
export function isFirebaseUnavailable() { return firebaseFailed; }

export function onAuthChange(cb) {
  authListeners.push(cb);
  if (authReady) cb(currentUser);
}

export function getCurrentUser() {
  return currentUser;
}

// ===== 登录 / 登出 =====
export async function signInWithGoogle() {
  await ensureReady();
  const result = await _signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signInWithGithub() {
  await ensureReady();
  const result = await _signInWithPopup(auth, githubProvider);
  return result.user;
}

export async function signUpWithEmail(email, password) {
  await ensureReady();
  const result = await _createUserWithEmailAndPassword(auth, email, password);
  return result.user;
}

export async function signInWithEmail(email, password) {
  await ensureReady();
  const result = await _signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

export async function resetPassword(email) {
  await ensureReady();
  await _sendPasswordResetEmail(auth, email);
}

export async function signOutUser() {
  await ensureReady();
  await _signOut(auth);
}

// ===== 保存单局记录 =====
export async function saveRoundScore(stats) {
  if (!currentUser) return { saved: false, reason: 'not-signed-in' };
  await ensureReady(); // currentUser非空说明之前已经加载成功过，这里几乎必定秒过

  const scoresRef = _collection(db, 'scores');
  const record = {
    uid: currentUser.uid,
    displayName: currentUser.displayName || currentUser.email || 'Anonymous',
    photoURL: currentUser.photoURL || '',
    score: stats.score || 0,
    maxCombo: stats.maxCombo || 0,
    margaritaCount: stats.margaritaCount || 0,
    calendulaCount: stats.calendulaCount || 0,
    grassCount: stats.grassCount || 0,
    eggCount: stats.eggCount || 0,
    chickenCount: stats.chickenCount || 0,
    basketCount: stats.basketCount || 0,
    dogCount: stats.dogCount || 0,
    createdAt: Date.now(),
  };

  const q = _query(scoresRef, _where('uid', '==', currentUser.uid), _orderBy('score', 'asc'));
  const snap = await _getDocs(q);
  const docs = snap.docs;

  if (docs.length < PER_USER_CAP) {
    await _addDoc(scoresRef, record);
    return { saved: true };
  }

  const lowest = docs[0];
  const lowestScore = lowest.data().score || 0;
  if (record.score > lowestScore) {
    await _deleteDoc(lowest.ref);
    await _addDoc(scoresRef, record);
    return { saved: true, replaced: true };
  }
  return { saved: false, reason: 'below-personal-cap' };
}

// ===== 排行榜 Top N（默认100，按局排名，同一人可多条） =====
export async function fetchLeaderboard(topN = 100) {
  await ensureReady();
  const q = _query(_collection(db, 'scores'), _orderBy('score', 'desc'), _limit(topN));
  const snap = await _getDocs(q);
  return snap.docs.map((d, i) => ({ id: d.id, rank: i + 1, ...d.data() }));
}

// ===== 当前用户历史最佳一局的分数（未登录/不可用返回 null） =====
export async function getPersonalBest() {
  if (!currentUser) return null;
  await ensureReady();
  const q = _query(
    _collection(db, 'scores'),
    _where('uid', '==', currentUser.uid),
    _orderBy('score', 'desc'),
    _limit(1)
  );
  const snap = await _getDocs(q);
  if (snap.empty) return null;
  return snap.docs[0].data().score;
}

// ===== 全局最高分（世界记录，不可用时返回 null 而不是抛错，方便main.js直接判断跳过） =====
export async function getGlobalBest() {
  await ensureReady();
  const q = _query(_collection(db, 'scores'), _orderBy('score', 'desc'), _limit(1));
  const snap = await _getDocs(q);
  if (snap.empty) return 0;
  return snap.docs[0].data().score;
}

// ===== 当前用户"历史最佳一局"的真实全局排名 =====
export async function getUserBestRank() {
  if (!currentUser) return null;
  await ensureReady();
  const best = await getPersonalBest();
  if (best == null) return null;
  const q = _query(_collection(db, 'scores'), _where('score', '>', best));
  const countSnap = await _getCountFromServer(q);
  return countSnap.data().count + 1;
}
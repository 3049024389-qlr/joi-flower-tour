// ===================================================
// Firebase 服务模块 firebase-services.js
// 负责：Google登录 / 登出 / 保存单局记录 / 排行榜查询 / 破纪录基准查询
//
// 数据模型：scores 集合，每一局一条独立记录（自动生成文档ID）
// 每个用户最多保留历史最佳 10 局，新纪录挤掉该用户已存记录里最低的一条
// ===================================================
import { initializeApp } from 'firebase/app';
import {
  getAuth, GoogleAuthProvider, GithubAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail,
} from 'firebase/auth';
import {
  getFirestore, collection, addDoc, deleteDoc,
  query, where, orderBy, limit, getDocs, getCountFromServer,
} from 'firebase/firestore';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
const githubProvider = new GithubAuthProvider();

const PER_USER_CAP = 10; // 每个用户最多保留的历史最佳局数

// ===== 登录状态 =====
let currentUser = null;
let authReady = false;
const authListeners = [];

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  authReady = true;
  authListeners.forEach((cb) => cb(user));
});

export function onAuthChange(cb) {
  authListeners.push(cb);
  if (authReady) cb(currentUser);
}

export function getCurrentUser() {
  return currentUser;
}

// ===== 登录 / 登出 =====
export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signInWithGithub() {
  const result = await signInWithPopup(auth, githubProvider);
  return result.user;
}

export async function signUpWithEmail(email, password) {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  return result.user;
}

export async function signInWithEmail(email, password) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

export async function signOutUser() {
  await signOut(auth);
}

// ===== 保存单局记录 =====
// stats: { score, maxCombo, margaritaCount, calendulaCount, grassCount, eggCount, chickenCount, basketCount, dogCount }
// 返回 { saved: true/false, replaced?: true }；未登录时返回 { saved: false, reason: 'not-signed-in' }
export async function saveRoundScore(stats) {
  if (!currentUser) return { saved: false, reason: 'not-signed-in' };

  const scoresRef = collection(db, 'scores');
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

  // 拿这个用户已存的所有记录，按分数升序（最低的排最前面）
  const q = query(scoresRef, where('uid', '==', currentUser.uid), orderBy('score', 'asc'));
  const snap = await getDocs(q);
  const docs = snap.docs;

  if (docs.length < PER_USER_CAP) {
    await addDoc(scoresRef, record);
    return { saved: true };
  }

  const lowest = docs[0];
  const lowestScore = lowest.data().score || 0;
  if (record.score > lowestScore) {
    await deleteDoc(lowest.ref);
    await addDoc(scoresRef, record);
    return { saved: true, replaced: true };
  }
  return { saved: false, reason: 'below-personal-cap' };
}

// ===== 排行榜 Top N（默认100，按局排名，同一人可多条） =====
export async function fetchLeaderboard(topN = 100) {
  const q = query(collection(db, 'scores'), orderBy('score', 'desc'), limit(topN));
  const snap = await getDocs(q);
  return snap.docs.map((d, i) => ({ id: d.id, rank: i + 1, ...d.data() }));
}

// ===== 当前用户历史最佳一局的分数（未登录返回 null） =====
export async function getPersonalBest() {
  if (!currentUser) return null;
  const q = query(
    collection(db, 'scores'),
    where('uid', '==', currentUser.uid),
    orderBy('score', 'desc'),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return snap.docs[0].data().score;
}

// ===== 全局最高分（世界记录，任何人都能比，空榜返回0） =====
export async function getGlobalBest() {
  const q = query(collection(db, 'scores'), orderBy('score', 'desc'), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return 0;
  return snap.docs[0].data().score;
}

// ===== 当前用户"历史最佳一局"的真实全局排名（未登录返回 null） =====
export async function getUserBestRank() {
  if (!currentUser) return null;
  const best = await getPersonalBest();
  if (best == null) return null;
  const q = query(collection(db, 'scores'), where('score', '>', best));
  const countSnap = await getCountFromServer(q);
  return countSnap.data().count + 1;
}
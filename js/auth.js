import { auth, db, createSecondaryFirebaseApp } from './firebase-config.js';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { ref, get, set, update, remove } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';
import { can } from './permissions.js';

export async function login(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function logout() {
  return signOut(auth);
}

export async function getUserProfile(uid) {
  const snap = await get(ref(db, `usuarios/${uid}`));
  return snap.exists() ? snap.val() : null;
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, async user => {
    if (!user) {
      callback(null, null);
      return;
    }

    const profile = await getUserProfile(user.uid);
    callback(user, profile);
  });
}

export function requireAuth({ redirectTo = 'login.html', onReady } = {}) {
  return watchAuth((user, profile) => {
    if (!user) {
      window.location.href = redirectTo;
      return;
    }

    if (!profile?.perfil) {
      alert('Seu usuário ainda não possui perfil configurado. Solicite liberação ao administrador.');
      logout();
      return;
    }

    onReady?.(user, profile);
  });
}

export function redirectIfLoggedIn(target = 'dashboard.html') {
  return watchAuth((user, profile) => {
    if (user && profile?.perfil) window.location.href = target;
  });
}

export async function createUserByAdmin(adminProfile, { nome, email, senha, perfil }) {
  if (!can(adminProfile?.perfil, 'manageUsers')) {
    throw new Error('Apenas administradores podem cadastrar usuários.');
  }

  const secondary = await createSecondaryFirebaseApp();
  try {
    const credential = await createUserWithEmailAndPassword(secondary.auth, email, senha);
    const uid = credential.user.uid;

    await set(ref(db, `usuarios/${uid}`), {
      nome,
      email,
      perfil,
      ativo: true,
      criadoEm: new Date().toISOString(),
      criadoPor: adminProfile.uid || null
    });

    await signOut(secondary.auth);
    return uid;
  } finally {
    await secondary.destroy();
  }
}

export async function updateUserProfile(adminProfile, uid, data) {
  if (!can(adminProfile?.perfil, 'editUsers')) throw new Error('Sem permissão para editar usuários.');
  return update(ref(db, `usuarios/${uid}`), data);
}

export async function deleteUserProfile(adminProfile, uid) {
  if (!can(adminProfile?.perfil, 'deleteUsers')) throw new Error('Sem permissão para excluir usuários.');
  return remove(ref(db, `usuarios/${uid}`));
}

import { initializeApp, getApps, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

export const firebaseConfig = {
  apiKey: "AIzaSyAOOigxqJ9tm85iqkwpAplQA_EPmi28Rf4",
  authDomain: "projeto-paciente-8ffe2.firebaseapp.com",
  databaseURL: "https://projeto-paciente-8ffe2-default-rtdb.firebaseio.com",
  projectId: "projeto-paciente-8ffe2",
  storageBucket: "projeto-paciente-8ffe2.firebasestorage.app",
  messagingSenderId: "319894479322",
  appId: "1:319894479322:web:f5545af8b83b848720e0e3",
  measurementId: "G-TNQTZL2S33"
};

export const app = getApps().length
  ? getApps()[0]
  : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getDatabase(app);

// Usado para criar usuários sem deslogar o administrador atual
export async function createSecondaryFirebaseApp() {
  const secondaryApp = initializeApp(firebaseConfig, `secondary-${Date.now()}`);

  return {
    app: secondaryApp,
    auth: getAuth(secondaryApp),
    destroy: () => deleteApp(secondaryApp)
  };
}
// ----------------------------------------------------------
// Firebase.js (React) — Archivo oficial y definitivo
// ----------------------------------------------------------

import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { getStorage } from 'firebase/storage'
import { getFunctions } from 'firebase/functions'

// ⚠ Configuración REAL de tu proyecto
const firebaseConfig = {
  apiKey: "AIzaSyC54bmMhYRrAoZRiWoQMgPiDU8r_EJFAgo",
  authDomain: "turnosapp-digital.firebaseapp.com",
  projectId: "turnosapp-digital",
  storageBucket: "turnosapp-digital.firebasestorage.app",
  messagingSenderId: "879892551203",
  appId: "1:879892551203:web:8aec51dd0434a70fd8c396",
  measurementId: "G-EPJ8YMXYCS"
};

// ----------------------------------------------------------
// 🔥 Inicializar App (PRIMERO)
// ----------------------------------------------------------
const app = initializeApp(firebaseConfig)

// ----------------------------------------------------------
// 📦 Servicios Firebase
// ----------------------------------------------------------
export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)

// ----------------------------------------------------------
// ☁️ Cloud Functions (Callable)
// ----------------------------------------------------------
export const functions = getFunctions(app, 'us-central1')

export default app

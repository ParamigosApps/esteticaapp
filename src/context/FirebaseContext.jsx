// --------------------------------------------------------------
// FirebaseContext.jsx — AUTH + NIVEL (FUENTE ÚNICA DE PERMISOS)
// --------------------------------------------------------------

import { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "../Firebase.js";
import {
  GoogleAuthProvider,
  FacebookAuthProvider,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import Swal from "sweetalert2";

// =====================================================
// CONTEXT
// =====================================================
const FirebaseContext = createContext(null);

// 🔑 Hook ÚNICO a usar en toda la app
export const useFirebase = () => {
  const ctx = useContext(FirebaseContext);
  if (!ctx) {
    throw new Error("useFirebase debe usarse dentro de <FirebaseProvider>");
  }
  return ctx;
};

function normalizarTelefono(raw) {
  let n = raw.replace(/\D/g, "");

  if (n.startsWith("54")) return `+${n}`;

  if (n.startsWith("0")) n = n.slice(1);

  return `+549${n}`;
}
// =====================================================
// RECAPTCHA (PHONE AUTH)
// =====================================================
let recaptchaVerifierGlobal = null;

function obtenerRecaptcha() {
  if (recaptchaVerifierGlobal) return recaptchaVerifierGlobal;

  const el = document.getElementById("recaptcha-container");

  if (!el) {
    throw new Error("reCAPTCHA container no está montado todavía");
  }

  recaptchaVerifierGlobal = new RecaptchaVerifier(auth, el, {
    size: "invisible",
  });

  recaptchaVerifierGlobal.render();

  return recaptchaVerifierGlobal;
}

// =====================================================
// PROVIDER
// =====================================================
export function FirebaseProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // ---------------------------------------------------
  // 🔥 AUTH WATCHER + CARGA DE PERFIL (usuarios/{uid})
  // ---------------------------------------------------
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const ref = doc(db, "usuarios", currentUser.uid);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          setUser({
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: currentUser.displayName,
            ...snap.data(), // 🔥 nivel, esEmpleado, etc
          });
        } else {
          // Usuario sin perfil aún
          setUser({
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: currentUser.displayName,
            nivel: 0,
          });
        }
      } catch (err) {
        console.error("Error cargando usuario:", err);
        setUser(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  // =====================================================
  // MÉTODOS DE LOGIN
  // =====================================================
  async function loginGoogle() {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      console.error("Error login Google:", error);
      Swal.fire("Error", "No se pudo iniciar sesión con Google", "error");
    }
  }

  async function loginFacebook() {
    try {
      await signInWithPopup(auth, new FacebookAuthProvider());
    } catch (error) {
      console.error("Error login Facebook:", error);
      Swal.fire("Error", "No se pudo iniciar sesión con Facebook", "error");
    }
  }

  async function loginTelefono(numeroEnTexto) {
    try {
      if (!numeroEnTexto) throw new Error("Número vacío");

      const phoneNumber = normalizarTelefono(numeroEnTexto);

      const appVerifier = obtenerRecaptcha();

      return await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
    } catch (error) {
      console.error("Error login teléfono:", error);
      Swal.fire(
        "Error",
        "No se pudo enviar el SMS. Revisá el número.",
        "error",
      );
      throw error;
    }
  }

  async function logout() {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
      Swal.fire("Error", "No se pudo cerrar sesión", "error");
    }
  }

  // =====================================================
  // PROVIDER VALUE
  // =====================================================
  return (
    <FirebaseContext.Provider
      value={{
        user, // 🔥 incluye nivel
        loading,
        loginGoogle,
        loginFacebook,
        loginTelefono,
        logout,
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
}

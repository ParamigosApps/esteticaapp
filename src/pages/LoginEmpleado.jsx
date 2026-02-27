// --------------------------------------------------------------
// LoginEmpleado.jsx — PANEL EMPLEADOS / ADMIN (SOLO GOOGLE + CLAIMS)
// --------------------------------------------------------------

import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
} from "firebase/auth";
import { auth } from "../Firebase.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function LoginEmpleado() {
  const { loading: authLoading } = useAuth();
  const redirectingRef = useRef(false);
  const navigate = useNavigate();

  const [loggingIn, setLoggingIn] = useState(false);
  const [checkingSession, setCheckingSession] = useState(false);
  const [error, setError] = useState("");

  // ------------------------------------------------------------
  // VALIDAR EMPLEADO POR CLAIM
  // ------------------------------------------------------------
  useEffect(() => {
    if (!auth.currentUser) return;

    auth.currentUser.getIdTokenResult().then((token) => {
      console.log("CLAIMS REALES:", token.claims);
    });
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      if (redirectingRef.current) return;

      redirectingRef.current = true;
      setCheckingSession(true);

      try {
        await validarEmpleadoPanel(user);
        navigate("/admin", { replace: true });
      } catch {
        redirectingRef.current = false;
        setCheckingSession(false);
      }
    });

    return () => unsub();
  }, [navigate]);
  async function validarEmpleadoPanel(user) {
    if (!user?.uid) throw new Error("NO_AUTH");

    // 🔁 esperar claims reales (hasta 2s máx)
    for (let i = 0; i < 6; i++) {
      await user.getIdToken(true);
      const token = await user.getIdTokenResult();

      const nivel = Number(token?.claims?.nivel || 0);

      if (nivel >= 1) {
        return nivel;
      }

      // esperar 300ms y reintentar
      await new Promise((r) => setTimeout(r, 300));
    }

    throw new Error("NO_EMPLEADO");
  }

  // ------------------------------------------------------------
  // LOGIN — GOOGLE
  // ------------------------------------------------------------
  async function loginAdminGoogle() {
    if (loggingIn) return;

    setError("");
    setLoggingIn(true);

    try {
      const res = await signInWithPopup(auth, new GoogleAuthProvider());
      const user = res.user;
      console.log("UID LOGIN:", user.uid);
      const nivel = await validarEmpleadoPanel(user);
      console.log("Validando UID:", user.uid);
      if (nivel >= 1) {
        return;
      }

      throw new Error("NO_EMPLEADO");
    } catch (err) {
      console.error("❌ Login admin Google fallido:", err);

      try {
        await auth.signOut();
      } catch {}

      if (err.message === "NO_EMPLEADO") {
        setError("No tenés permisos para acceder al panel");
      } else if (err.code === "auth/popup-closed-by-user") {
        setError("Inicio de sesión cancelado");
      } else {
        setError("No se pudo iniciar sesión con Google");
      }
    } finally {
      setLoggingIn(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="login-wrapper d-flex align-items-center justify-content-center">
        <div className="spinner-border text-light" role="status" />
      </div>
    );
  }

  if (!checkingSession && !authLoading) {
    return (
      <div className="login-wrapper">
        <h2 className="login-title">PANEL ADMIN</h2>

        <div>Accedé con tu cuenta autorizada</div>
        <div className="bar-divider mb-3"></div>

        {error && (
          <div className="text-danger text-center small mb-3">{error}</div>
        )}

        <button
          className="btn btn-dark w-100"
          onClick={loginAdminGoogle}
          disabled={loggingIn}
        >
          {loggingIn ? "Ingresando…" : "Ingresar con Google"}
        </button>

        <p className="login-back mt-3" onClick={() => navigate("/")}>
          ← Salir
        </p>
      </div>
    );
  }
}

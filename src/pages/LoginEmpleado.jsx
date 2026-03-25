import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "../Firebase.js";
import { useAuth } from "../context/AuthContext.jsx";

async function validarEmpleadoPanel(user) {
  if (!user?.uid) throw new Error("NO_AUTH");

  const activarEmpleadoGoogle = httpsCallable(
    functions,
    "activarEmpleadoGoogle",
  );

  for (let i = 0; i < 3; i++) {
    await user.getIdToken(true);
    const token = await user.getIdTokenResult();
    const nivel = Number(token?.claims?.nivel || 0);

    if (nivel >= 1) {
      return nivel;
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  try {
    const result = await activarEmpleadoGoogle();
    const nivelActivado = Number(result?.data?.nivel || 0);

    if (nivelActivado >= 1) {
      await user.getIdToken(true);
      return nivelActivado;
    }
  } catch (err) {
    console.warn(
      "No se pudo activar empleado por Google:",
      err?.message || err,
    );
  }

  for (let i = 0; i < 3; i++) {
    await user.getIdToken(true);
    const token = await user.getIdTokenResult();
    const nivel = Number(token?.claims?.nivel || 0);

    if (nivel >= 1) {
      return nivel;
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  throw new Error("NO_EMPLEADO");
}

export default function LoginEmpleado() {
  const { loading: authLoading, user } = useAuth();
  const navigate = useNavigate();

  const [loggingIn, setLoggingIn] = useState(false);
  const [checkingSession, setCheckingSession] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setCheckingSession(false);
      return;
    }

    let active = true;
    setCheckingSession(true);

    validarEmpleadoPanel(auth.currentUser)
      .then((nivelAcceso) => {
        if (!active) return;
        navigate(nivelAcceso >= 3 ? "/admin" : "/profesional", {
          replace: true,
        });
      })
      .catch(async () => {
        if (!active) return;

        try {
          await auth.signOut();
        } catch (signOutError) {
          console.warn(
            "No se pudo cerrar sesion tras validar acceso:",
            signOutError,
          );
        }

        setCheckingSession(false);
        setError("No tenes permisos para acceder al panel.");
      });

    return () => {
      active = false;
    };
  }, [authLoading, navigate, user?.uid]);

  async function loginAdminGoogle() {
    if (loggingIn) return;

    setError("");
    setLoggingIn(true);

    try {
      const res = await signInWithPopup(auth, new GoogleAuthProvider());
      const user = res.user;
      const nivel = await validarEmpleadoPanel(user);

      if (nivel >= 1) {
        setCheckingSession(true);
        return;
      }

      throw new Error("NO_EMPLEADO");
    } catch (err) {
      console.error("Login admin Google fallido:", err);

      try {
        await auth.signOut();
      } catch (signOutError) {
        console.warn("No se pudo cerrar sesion tras error:", signOutError);
      }

      if (err.message === "NO_EMPLEADO") {
        setError("No tenes permisos para acceder al panel.");
      } else if (err.code === "auth/popup-closed-by-user") {
        setError("Inicio de sesion cancelado.");
      } else {
        setError("No se pudo iniciar sesión con Google.");
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
        <h2 className="login-title">PANEL EMPLEADOS</h2>

        <div>Accede con tu cuenta autorizada de Google</div>
        <div className="bar-divider mb-3"></div>

        {error ? (
          <div className="text-danger text-center small mb-3">{error}</div>
        ) : null}

        <button
          className="btn btn-dark w-100"
          onClick={loginAdminGoogle}
          disabled={loggingIn}
        >
          {loggingIn ? "Ingresando..." : "Ingresar con Google"}
        </button>

        <p className="login-back mt-3" onClick={() => navigate("/")}>
          ← Salir
        </p>
      </div>
    );
  }

  return null;
}

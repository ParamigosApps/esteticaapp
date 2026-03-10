import { useAuth } from "../../context/AuthContext.jsx";
import { useState, useEffect } from "react";

import googleIcon from "../../assets/img/google.png";
import facebookIcon from "../../assets/img/facebook.png";
import iconEditar from "../../assets/icons/editar.png";

import { swalLoginEmail } from "../utils/swalUtils.js";

export default function LoginPanel() {
  const {
    user: firebaseUser,
    loginSettings,
    loginGoogle,
    loginEnProceso,
    loginFacebook,
    loginEmailEnviarLink,
    loginTelefonoEnviarCodigo,
    loginTelefonoValidarCodigo,
    logout,
    loading,
    puedeEditarPerfil,
  } = useAuth();

  const [mostrarTelefono, setMostrarTelefono] = useState(false);
  const [smsEnviado, setSmsEnviado] = useState(false);
  const [smsError, setSmsError] = useState(false);
  const [loginActivo, setLoginActivo] = useState(null);
  const [bloqueoEnvioSms, setBloqueoEnvioSms] = useState(false);
  const [segundosReenvio, setSegundosReenvio] = useState(0);

  // ==========================
  // 📞 Enviar SMS
  // ==========================
  const enviarCodigoTelefono = async () => {
    if (bloqueoEnvioSms) return;

    const raw = document.getElementById("phoneInput")?.value.trim();
    if (!raw) return;

    const telefono = raw.startsWith("+")
      ? raw
      : `+549${raw.replace(/\D/g, "")}`;

    const ok = await loginTelefonoEnviarCodigo(telefono);

    if (ok === true) {
      setSmsEnviado(true);
      setSmsError(false);
      setBloqueoEnvioSms(true);
      setSegundosReenvio(30);
    } else {
      setSmsEnviado(false);
      setSmsError(true);
      setBloqueoEnvioSms(false);
    }
  };

  // ==========================
  // ⏱ Cooldown SMS
  // ==========================
  useEffect(() => {
    if (!bloqueoEnvioSms) return;

    const i = setInterval(() => {
      setSegundosReenvio((s) => {
        if (s <= 1) {
          clearInterval(i);
          setBloqueoEnvioSms(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => clearInterval(i);
  }, [bloqueoEnvioSms]);

  return (
    <>
      {loading && (
        <div className="mt-4 mb-4">
          <p className="text-muted text-center">Verificando sesión...</p>
        </div>
      )}

      {!loginSettings && !loading && !firebaseUser && (
        <div className="mt-4 mb-4">
          <p className="text-muted text-center">Cargando inicio de sesión...</p>
        </div>
      )}

      {/* 🔐 BOTONES LOGIN */}
      {!loading && !firebaseUser && loginSettings && !loginEnProceso && (
        <>
          {loginSettings.google && (
            <button
              className="google-btn d-block mx-auto mb-2 mt-3"
              onClick={() => {
                setMostrarTelefono(false);
                setSmsEnviado(false);
                setSmsError(false);
                setLoginActivo(null);
                loginGoogle();
              }}
            >
              <img src={googleIcon} />
              Iniciar sesión con Google
            </button>
          )}

          {loginSettings.facebook && (
            <button
              className="facebook-btn-small d-block mx-auto mb-3"
              onClick={() => {
                setMostrarTelefono(false);
                setSmsEnviado(false);
                setSmsError(false);
                setLoginActivo(null);
                loginFacebook();
              }}
            >
              <span className="facebook-icon-box">
                <img src={facebookIcon} />
              </span>
              Iniciar sesión con Facebook
            </button>
          )}

          <div className="login-divider my-3">
            <span>o</span>
          </div>

          {/* 📧 EMAIL */}
          <button
            className={`btn btn-outline-dark d-block mx-auto mb-2 ${
              loginActivo === "email" ? "btn-activo" : ""
            }`}
            onClick={async () => {
              setLoginActivo("email");
              setMostrarTelefono(false);
              setSmsEnviado(false);
              setSmsError(false);

              const res = await swalLoginEmail();
              if (!res.isConfirmed) return;

              const email = document
                .getElementById("swal-email-login")
                ?.value.trim();

              if (!email) return;
              loginEmailEnviarLink(email);
            }}
          >
            Correo electrónico / Contraseña
          </button>

          {/* 📞 TELÉFONO */}
          {loginSettings.phone && (
            <button
              className={`btn btn-outline-dark d-block mx-auto mb-4 ${
                loginActivo === "telefono" ? "btn-activo" : ""
              }`}
              onClick={() => {
                setLoginActivo((p) => (p === "telefono" ? null : "telefono"));
                setMostrarTelefono((p) => !p);
                setSmsError(false);
              }}
            >
              Iniciar sesión con Teléfono
            </button>
          )}
        </>
      )}

      {/* 📞 PANEL SMS */}
      {!loading && !firebaseUser && mostrarTelefono && (
        <section
          className="auth-telefono-container mt-4 mx-auto rounded-3 border"
          style={{ maxWidth: 360 }}
        >
          <h6 className="fw-semibold mb-2 text-center">
            Iniciar sesión con teléfono
          </h6>

          <input
            id="phoneInput"
            className="form-control mb-2"
            placeholder="Ej: 1123456789"
          />

          <button
            className="btn btn-outline-dark w-75 d-block mx-auto mb-3"
            disabled={bloqueoEnvioSms}
            onClick={enviarCodigoTelefono}
          >
            {bloqueoEnvioSms
              ? `Reenviar en ${segundosReenvio}s`
              : smsEnviado
                ? "Reenviar código"
                : "Enviar código SMS"}
          </button>

          {smsEnviado && (
            <>
              <input
                id="codeInput"
                className="form-control mb-2"
                placeholder="Código recibido"
              />

              <button
                className="btn swal-btn-confirm w-75 d-block mx-auto mb-3"
                onClick={() =>
                  loginTelefonoValidarCodigo(
                    document.getElementById("codeInput").value,
                  )
                }
              >
                Validar código
              </button>
            </>
          )}

          {!smsError && (
            <p
              className="small text-warning text-center mb-0"
              style={{ fontSize: "11px" }}
            >
              ⚠️ En algunos celulares el SMS puede demorar o no llegar.
            </p>
          )}

          <p
            className="small text-muted text-center"
            style={{ fontSize: "11px" }}
          >
            Recomendamos iniciar sesión con <b>Google</b> o <b>Email</b>.
          </p>

          {smsError && (
            <p
              className="small text-danger text-center mb-0"
              style={{ fontSize: "11px" }}
            >
              No se pudo enviar el SMS a este número.
            </p>
          )}

          <p className="recaptcha-legal mt-0">
            Este sitio está protegido por reCAPTCHA y se aplican la{" "}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noreferrer"
            >
              Política de Privacidad
            </a>{" "}
            y los{" "}
            <a
              href="https://policies.google.com/terms"
              target="_blank"
              rel="noreferrer"
            >
              Términos del Servicio
            </a>
            .
          </p>
        </section>
      )}

      {/* 👤 USUARIO LOGUEADO */}
      {(firebaseUser?.nombre || firebaseUser?.displayName) && !loading && (
        <div className="d-flex flex-column align-items-center">
          <p className="saludoLogin fs-5 mb-0">
            Hola, {firebaseUser.apodo || firebaseUser.nombre}
            {puedeEditarPerfil(firebaseUser) && (
              <span
                style={{ cursor: "pointer" }}
                onClick={async () => {
                  const { editarPerfilUsuario } =
                    await import("../../services/perfilUsuario.js");

                  await editarPerfilUsuario({
                    uid: firebaseUser.uid,
                    nombreActual: firebaseUser.nombre,
                    apodoActual: firebaseUser.apodo || "",
                  });
                }}
              >
                <img src={iconEditar} className="accordion-icon" />
              </span>
            )}
          </p>

          {firebaseUser.email && (
            <p className="text-muted small mb-0">{firebaseUser.email}</p>
          )}

          {firebaseUser.phoneNumber && (
            <p className="text-muted small mb-1">{firebaseUser.phoneNumber}</p>
          )}

          <button className="btn btn-outline-dark btn-sm mt-2" onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      )}

      <div id="recaptcha-container"></div>
    </>
  );
}

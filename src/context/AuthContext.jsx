import { createContext, useContext, useEffect, useState, useRef } from "react";
import { auth, db } from "../Firebase.js";
import {
  GoogleAuthProvider,
  FacebookAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithEmailAndPassword,
  sendEmailVerification,
  onIdTokenChanged,
} from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp as fsServerTimestamp,
} from "firebase/firestore";
import {
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
} from "firebase/auth";

import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Swal from "sweetalert2";

import { guardarPerfilUsuario } from "../services/usuarioService";

import { showLoading, hideLoading } from "../services/loadingService.js";

import { swalLoginEmail } from "../public/utils/swalUtils.js";
// ============================================================
// CONTEXT
// ============================================================
const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

// ============================================================
// PROVIDER
// ============================================================
export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [permisos, setPermisos] = useState({});
  const [loading, setLoading] = useState(true);

  // 🔑 FLAGS REALES
  const [authListo, setAuthListo] = useState(false);

  const recaptchaRef = useRef(null);
  const confirmationRef = useRef(null);
  const [loginSettings, setLoginSettings] = useState(null);
  const [esAdminReal, setEsAdminReal] = useState(false);

  const loginEnProcesoRef = useRef(false);
  const [loginEnProceso, setLoginEnProceso] = useState(false);

  const EMAIL_LINK_SETTINGS = {
    url: "https://pielycejas.misturnosapp.com.ar/",
    handleCodeInApp: true,
  };

  useEffect(() => {
    if (!authListo) return;

    // 🔐 ADMIN REAL → permisos completos
    if (esAdminReal) {
      setPermisos({
        admin: true,
        eventos: true,
        compras: true,
        entradas: true,
        productos: true,
        empleados: true,
      });
      //setPermisosListos(true);
      return;
    }

    // 👤 Usuario normal → permisos desde Firestore
    cargarPermisosSistema();
  }, [authListo, esAdminReal]);

  useEffect(() => {
    async function completarLoginEmailLink() {
      if (!isSignInWithEmailLink(auth, window.location.href)) return;

      let email = localStorage.getItem("emailForSignIn");

      if (!email) {
        const res = await Swal.fire({
          title: "Confirmá tu email",
          text: "Abriste el enlace en otro navegador o dispositivo. Ingresá tu email para continuar.",
          input: "email",
          inputLabel: "Email",
          inputPlaceholder: "tu@email.com",
          allowOutsideClick: false,
          allowEscapeKey: false,
          confirmButtonText: "Confirmar",
          customClass: {
            title: "swal-title-custom",
            confirmButton: "swal-btn-confirm",
          },
          buttonsStyling: false,
        });

        if (!res.value) return;
        email = res.value;
      }

      try {
        showLoading({
          title: "Iniciando sesión",
          text: "Validando enlace...",
        });

        const res = await signInWithEmailLink(
          auth,
          email,
          window.location.href,
        );

        const u = res.user;
        const ref = doc(db, "usuarios", u.uid);
        const snap = await getDoc(ref);
        const esPrimerLogin = !snap.exists();

        let nombre = snap.exists() ? snap.data().nombre : "";

        if (esPrimerLogin) {
          const datos = await pedirNombreYEmail({
            nombreActual: "",
            emailActual: u.email,
            titulo: "👤 Completá tu perfil",
          });

          if (!datos) return;

          nombre = datos.nombre;
        }

        await setDoc(
          ref,
          {
            uid: u.uid,
            email: u.email,
            nombre,

            ...(esPrimerLogin ? { creadoEn: fsServerTimestamp() } : {}),
          },
          { merge: true },
        );

        localStorage.removeItem("emailForSignIn");
        hideLoading();
      } catch (err) {
        console.error("❌ Error completando email link:", err);
        hideLoading();

        let msg = "El enlace es inválido o expiró.";

        if (
          err.code === "auth/invalid-action-code" ||
          err.code === "auth/expired-action-code"
        ) {
          await Swal.fire({
            icon: "warning",
            title: "Enlace inválido",
            text: "Este enlace ya fue usado o expiró. Pedí uno nuevo.",
            confirmButtonText: "Aceptar",
            allowOutsideClick: false,
            allowEscapeKey: false,
            buttonsStyling: false,
            customClass: {
              confirmButton: "swal-btn-confirm",
            },
          });

          // volver limpio al home
          window.history.replaceState(
            {},
            document.title,
            window.location.origin,
          );
          window.location.replace("/");
        }

        if (err.code === "auth/invalid-email") {
          const retry = await Swal.fire({
            icon: "warning",
            title: "Email incorrecto",
            text: "El email no coincide con el que recibió este enlace. Podés corregirlo ahora o solicitar uno nuevo.",
            showCancelButton: true,
            confirmButtonText: "Corregir email",
            cancelButtonText: "Nuevo enlace",
            buttonsStyling: false,
            customClass: {
              confirmButton: "swal-btn-confirm",
              cancelButton: "swal-btn-alt",
            },
          });

          if (retry.isConfirmed) {
            // 🔁 corregir email y reintentar con el mismo link
            localStorage.removeItem("emailForSignIn");
            completarLoginEmailLink();
          } else {
            // 📧 pedir nuevo enlace con salida limpia
            const emailRes = await swalLoginEmail({
              confirmText: "Enviar nuevo enlace",
              cancelText: "Salir",
            });

            if (emailRes.isConfirmed && emailRes.value) {
              await loginEmailEnviarLink(emailRes.value);
            }
          }

          return;
        }

        if (err.code === "auth/user-disabled") {
          msg = "Esta cuenta está deshabilitada.";
        }

        await Swal.fire({
          icon: "error",
          title: "No se pudo iniciar sesión",
          text: msg,
          confirmButtonText: "Solicitar nuevo enlace",
          buttonsStyling: false,
          customClass: {
            confirmButton: "swal-btn-confirm",
          },
        });
      }
    }

    completarLoginEmailLink();
  }, []);

  // ============================================================
  // RESTAURAR SESIÓN
  // ============================================================
  useEffect(() => {
    const unsub = onIdTokenChanged(auth, async (fbUser) => {
      try {
        if (!fbUser) {
          setFirebaseUser(null);
          setEsAdminReal(false);
          setAuthListo(true);
          return;
        }

        const token = await fbUser.getIdTokenResult();

        const claimNivel = Number(token.claims?.nivel || 0);

        if (claimNivel >= 3) {
          setEsAdminReal(true);
        } else {
          setEsAdminReal(false);
        }
        // 📦 PERFIL APPBAR (fuente real de usuarios normales)
        const ref = doc(db, "usuarios", fbUser.uid);
        const snap = await getDoc(ref);

        // 🎯 NIVEL REAL (Firestore > claims para clientes)
        let nivel = 1; // cliente por defecto

        if (snap.exists() && Number.isFinite(Number(snap.data().nivel))) {
          nivel = Number(snap.data().nivel);
        } else if (claimNivel > 0) {
          nivel = claimNivel;
        }

        // ⛔ usuario sin perfil (raro pero seguro)
        if (!nivel || nivel < 1) {
          console.warn("⛔ Usuario inválido, cerrando sesión");
          await signOut(auth);
          setFirebaseUser(null);
          setEsAdminReal(false);
          setAuthListo(true);
          return;
        }

        // 🛡️ ADMIN REAL SOLO POR CLAIM

        setFirebaseUser({
          ...fbUser, // Firebase Auth REAL completo
          providerData: fbUser.providerData, // 🔐 nunca perder esto
          ...(snap.exists() ? snap.data() : {}),
          nivel,
        });
      } catch (err) {
        console.error("❌ Error restaurando sesión:", err);
        setFirebaseUser(null);
        setEsAdminReal(false);
      } finally {
        setAuthListo(true);
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    const handler = async () => {
      if (!auth.currentUser) return;

      const ref = doc(db, "usuarios", auth.currentUser.uid);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        setFirebaseUser((u) => (u ? { ...u, ...snap.data() } : u));
      }
    };

    window.addEventListener("perfil-actualizado", handler);
    return () => window.removeEventListener("perfil-actualizado", handler);
  }, []);

  // 🔐 loading SOLO depende de Firebase Auth
  useEffect(() => {
    if (authListo) {
      setLoading(false);
    }
  }, [authListo]);

  useEffect(() => {
    // 🔒 Esperar a que Auth esté listo Y definido
    if (!authListo) return;

    // Auth listo puede ser user o null, pero ya estable
    cargarAuthConfig();
  }, [authListo]);

  async function cargarAuthConfig() {
    try {
      const ref = doc(db, "configuracion", "auth");
      const snap = await getDoc(ref);

      if (snap.exists()) {
        setLoginSettings(snap.data());
      } else {
        // fallback seguro
        setLoginSettings({
          google: true,
          email: true,
          phone: false,
          facebook: false,
        });
      }
    } catch (err) {
      console.error("❌ Error cargando auth config", err);
      setLoginSettings({
        google: true,
        email: true,
        phone: false,
        facebook: false,
      });
    }
  }

  // ============================================================
  // PERMISOS DEL SISTEMA
  // ============================================================
  async function cargarPermisosSistema() {
    try {
      // ⛔ usuario no admin → no leer permisos globales
      if (!esAdminReal) {
        setPermisos({});
        //setPermisosListos(true);
        return;
      }

      const ref = doc(db, "configuracion", "permisos");
      const snap = await getDoc(ref);

      if (snap.exists()) {
        setPermisos(snap.data());
      } else {
        console.warn("⚠️ configuracion/permisos no existe");
        setPermisos({});
      }
    } catch (err) {
      console.error("❌ Error cargando permisos:", err);
      setPermisos({});
    } finally {
      //setPermisosListos(true);
    }
  }

  function puedeEditarPerfil(user) {
    if (!user) return false;
    return true;
  }

  // ============================================================
  // LOGIN GOOGLE
  // ============================================================
  async function loginGoogle() {
    // ⛔ bloquear doble click / doble popup
    if (loginEnProcesoRef.current) return;

    loginEnProcesoRef.current = true;
    setLoginEnProceso(true);

    try {
      Swal.fire({
        title: "Conectando con Google",
        html: `
          <div class="loading-box">
            <div class="loading-spinner-shell" aria-hidden="true">
              <span class="spinner-border loading-spinner" role="status"></span>
            </div>
            <div class="loading-copy">
              <div class="loading-text">Esperando confirmación…</div>
            </div>
          </div>
        `,
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        showCloseButton: true,
        customClass: {
          popup: "swal-popup-custom",
          title: "swal-title-custom",
        },
      });

      const res = await signInWithPopup(auth, new GoogleAuthProvider());
      const u = res.user;

      Swal.close();

      const ref = doc(db, "usuarios", u.uid);
      const snap = await getDoc(ref);
      const esPrimerLogin = !snap.exists();

      await setDoc(
        ref,
        {
          uid: u.uid,
          email: u.email,
          nombre: u.displayName || u.email,

          ...(esPrimerLogin ? { creadoEn: fsServerTimestamp() } : {}),
        },
        { merge: true },
      );

      if (esPrimerLogin) {
        const telefono = await pedirTelefono();
        if (telefono) {
          await setDoc(
            ref,
            {
              telefono,
            },
            { merge: true },
          );
        }
      }

      setFirebaseUser({
        ...u,
        nombre: u.displayName || u.email,
      });

      // Para usuarios existentes sin teléfono, pedirlo
      if (!esPrimerLogin) {
        const snapActual = await getDoc(ref);
        if (!snapActual.data()?.telefono) {
          const telefono = await pedirTelefono();
          if (telefono) {
            await setDoc(ref, { telefono }, { merge: true });
          }
        }
      }

      return { ok: true };
    } catch (err) {
      Swal.close();

      if (
        err.code === "auth/popup-closed-by-user" ||
        err.code === "auth/cancelled-popup-request"
      ) {
        return { ok: false, cancelado: true };
      }

      console.error("❌ Error login Google:", err);
      toast.error("No se pudo iniciar sesión con Google");
      return { ok: false, error: err };
    } finally {
      // 🔓 liberar bloqueo SIEMPRE
      loginEnProcesoRef.current = false;
      setLoginEnProceso(false);
    }
  }

  // ============================================================
  // LOGIN FACEBOOK
  // ============================================================
  async function loginFacebook() {
    if (loginEnProcesoRef.current) return;

    loginEnProcesoRef.current = true;
    setLoginEnProceso(true);

    try {
      Swal.fire({
        title: "Conectando con Facebook",
        html: `
          <div class="loading-box">
            <div class="loading-spinner-shell" aria-hidden="true">
              <span class="spinner-border loading-spinner" role="status"></span>
            </div>
            <div class="loading-copy">
              <div class="loading-text">Esperando confirmación…</div>
            </div>
          </div>
        `,
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        showCloseButton: true,
        customClass: {
          popup: "swal-popup-custom",
          title: "swal-title-custom",
        },
      });

      const res = await signInWithPopup(auth, new FacebookAuthProvider());
      const u = res.user;

      Swal.close();

      const ref = doc(db, "usuarios", u.uid);
      const snap = await getDoc(ref);
      const esPrimerLogin = !snap.exists();

      await setDoc(
        ref,
        {
          uid: u.uid,
          email: u.email,
          nombre: u.displayName || u.email,

          ...(esPrimerLogin ? { creadoEn: fsServerTimestamp() } : {}),
        },
        { merge: true },
      );

      if (esPrimerLogin) {
        const telefono = await pedirTelefono();
        if (telefono) {
          await setDoc(
            ref,
            {
              telefono,
            },
            { merge: true },
          );
        }
      }

      setFirebaseUser({
        ...u,
        nombre: u.displayName || u.email,
      });

      if (esPrimerLogin && u.email) {
        enviarMail({
          to: u.email,
          subject: "Bienvenido a AppBar",
          html: mailLogin({
            nombre: u.displayName || "Hola",
          }),
        }).catch(() => {});
      }

      return { ok: true };
    } catch (err) {
      Swal.close();

      if (
        err.code === "auth/popup-closed-by-user" ||
        err.code === "auth/cancelled-popup-request"
      ) {
        return { ok: false, cancelado: true };
      }

      console.error("❌ Error login Facebook:", err);
      toast.error("No se pudo iniciar sesión con Facebook");
      return { ok: false, error: err };
    } finally {
      loginEnProcesoRef.current = false;
      setLoginEnProceso(false);
    }
  }

  async function loginEmailPassword(email, password) {
    if (!email || !password) {
      toast.error("Completá email y contraseña");
      return { ok: false };
    }

    // ⛔ bloquear doble click
    if (loginEnProcesoRef.current) return { ok: false };

    loginEnProcesoRef.current = true;
    setLoginEnProceso(true);

    try {
      showLoading({
        title: "Iniciando sesión",
        text: "Aguardá un instante...",
      });

      const res = await signInWithEmailAndPassword(auth, email, password);
      const u = res.user;

      // Si todavía no verificó email → mandar verificación y cortar
      if (!u.emailVerified) {
        try {
          await sendEmailVerification(u);
        } catch (e) {
          // no frenamos por esto
          console.warn("No se pudo enviar verificación:", e);
        }

        hideLoading();
        await Swal.fire({
          icon: "warning",
          title: "Verificá tu email",
          text: "Te enviamos un correo para verificar la cuenta. Luego volvé a iniciar sesión.",
          confirmButtonText: "Entendido",
          buttonsStyling: false,
          customClass: { confirmButton: "swal-btn-confirm" },
        });

        await signOut(auth);
        return { ok: false, needsVerification: true };
      }

      // ✅ Validación BACKEND (setea claim emailVerificado)
      const fn = httpsCallable(
        getFunctions(undefined, "us-central1"),
        "validarEmailVerificado",
      );
      await fn();

      // 🔄 token fresco para que entren claims nuevos
      await u.getIdToken(true);
      // Perfil Firestore (merge)
      const userRef = doc(db, "usuarios", u.uid);
      const snap = await getDoc(userRef);

      await setDoc(
        userRef,
        {
          uid: u.uid,
          email: u.email,
          nombre: snap.exists() ? snap.data().nombre || u.email : u.email,
          ...(snap.exists() ? {} : { creadoEn: fsServerTimestamp() }),
        },
        { merge: true },
      );

      hideLoading();
      toast.success("Sesión iniciada");
      return { ok: true };
    } catch (err) {
      hideLoading();
      console.error("❌ Error login email/password:", err);

      if (
        err.code === "auth/invalid-credential" ||
        err.code === "auth/wrong-password"
      ) {
        toast.error("Credenciales inválidas");
        return { ok: false };
      }
      if (err.code === "auth/user-not-found") {
        toast.error("No existe una cuenta con ese email");
        return { ok: false };
      }

      toast.error("No se pudo iniciar sesión");
      return { ok: false, error: err };
    } finally {
      loginEnProcesoRef.current = false;
      setLoginEnProceso(false);
    }
  }

  async function loginEmailEnviarLink(email) {
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      toast.error("Ingresá un email válido");
      return;
    }

    try {
      showLoading({
        title: "Enviando enlace",
        text: "Revisá tu correo electrónico",
      });

      await sendSignInLinkToEmail(auth, email, EMAIL_LINK_SETTINGS);

      localStorage.setItem("emailForSignIn", email);

      hideLoading();

      Swal.fire({
        icon: "success",
        title: "Link enviado",
        text: "Revisá la carpeta de SPAM o Promociones.",
        confirmButtonText: "Revisaré mi mail",
        buttonsStyling: false,
        customClass: {
          popup: "swal-popup-custom",
          title: "swal-title",
          htmlContainer: "swal-text",
          confirmButton: "swal-btn-confirm",
        },
      });
    } catch (err) {
      console.error("❌ Error enviando email link:", err);
      hideLoading();
      toast.error("No se pudo enviar el enlace");
    }
  }

  function normalizarTelefonoAR(phone) {
    let p = phone.replace(/\D/g, "");

    if (p.startsWith("0")) p = p.slice(1);
    if (p.startsWith("15")) p = p.slice(2);
    if (!p.startsWith("54")) p = "54" + p;
    if (!p.startsWith("549")) p = "549" + p.slice(2);

    return "+" + p;
  }

  // ============================================================
  // LOGIN TELÉFONO
  // ============================================================

  async function loginTelefonoValidarCodigo(code) {
    if (!confirmationRef.current) {
      toast.error("Primero solicitá el código");
      return;
    }

    if (!code || code.length < 4) {
      toast.error("Ingresá el código recibido");
      return;
    }

    try {
      const res = await confirmationRef.current.confirm(code);
      const u = res.user;

      const ref = doc(db, "usuarios", u.uid);
      const snap = await getDoc(ref);

      const esPrimerLogin = !snap.exists();

      let nombre = snap.exists() ? snap.data().nombre : "";
      let nombreConfirmado = snap.exists()
        ? snap.data().nombreConfirmado === true
        : false;

      let datos = null;

      if (esPrimerLogin || !nombreConfirmado) {
        datos = await pedirNombreYEmail({
          nombreActual: nombre,
          emailActual: snap.exists() ? snap.data().email : "",
          emailObligatorio: !snap.exists() || !snap.data().email,
          showCancel: false, // No cancelar en login obligatorio
        });

        if (!datos) return;

        nombre = datos.nombre;
      }

      const perfil = await guardarPerfilUsuario({
        uid: u.uid,
        nombre,
        emailNuevo: datos?.email ?? null,
        phoneNumber: u.phoneNumber,
      });

      setFirebaseUser({
        ...u,
        nombre: perfil.nombre,
        email: perfil.email,
        phoneNumber: u.phoneNumber,
      });

      confirmationRef.current = null;

      if (recaptchaRef.current) {
        recaptchaRef.current.clear();
        recaptchaRef.current = null;
      }

      toast.success("Sesión iniciada");
    } catch (err) {
      console.error("ERROR VALIDANDO SMS:", err);

      if (err.code === "auth/invalid-verification-code") {
        toast.error("Código incorrecto");
      } else if (err.code === "auth/code-expired") {
        toast.error("El código expiró. Volvé a solicitarlo.");
      } else if (err.code === "auth/too-many-requests") {
        toast.error("Demasiados intentos. Prueba con otro número.");
      } else {
        toast.error("No se pudo validar el código");
        return false;
      }
    }
  }

  async function loginTelefonoEnviarCodigo(phoneRaw) {
    if (!phoneRaw) {
      toast.error("Ingresá un teléfono");
      return "inexistente";
    }

    try {
      const phone = normalizarTelefonoAR(phoneRaw);

      // 🧹 destruir captcha previo si existe
      if (recaptchaRef.current) {
        try {
          recaptchaRef.current.clear();
        } catch {}
        recaptchaRef.current = null;
      }

      recaptchaRef.current = new RecaptchaVerifier(
        auth,
        "recaptcha-container",
        {
          size: "invisible",
          callback: () => {
            console.log("reCAPTCHA ok");
          },
          "expired-callback": () => {
            recaptchaRef.current = null;
          },
        },
      );

      await recaptchaRef.current.render();

      const confirmation = await signInWithPhoneNumber(
        auth,
        phone,
        recaptchaRef.current,
      );

      confirmationRef.current = confirmation;

      toast.success("Código enviado por SMS");
      return true;
    } catch (err) {
      console.error("ERROR ENVIANDO SMS:", err);

      if (recaptchaRef.current) {
        try {
          recaptchaRef.current.clear();
        } catch {}
        recaptchaRef.current = null;
      }

      if (err.code === "auth/too-many-requests") {
        toast.error("Demasiados intentos. Esperá unos minutos.");
      } else if (err.code === "auth/invalid-phone-number") {
        toast.error("Número inválido");
      } else {
        toast.error("No se pudo enviar el código");
      }

      return false;
    }
  }

  async function pedirNombreYEmail({
    nombreActual = "",
    emailActual = "",
    titulo = "👤 Datos de tu cuenta",
    emailObligatorio = false,
    showCancel = true,
  }) {
    const emailPlaceholder = emailObligatorio
      ? "tu@email.com"
      : "Email (opcional)";
    const emailRequiredText = emailObligatorio
      ? ""
      : `<p style="font-size:12px;color:#777">El email es opcional, pero te permite recibir tus entradas por correo.</p>`;

    const { value, isConfirmed } = await Swal.fire({
      title: titulo,
      html: `
      <input id="swal-nombre" class="swal2-input" placeholder="Tu nombre" value="${nombreActual}">
      <input id="swal-email" class="swal2-input" placeholder="${emailPlaceholder}" value="${emailActual}" type="email">
      ${emailRequiredText}
    `,
      focusConfirm: false,
      confirmButtonText: "Guardar",
      showCancelButton: false,
      allowOutsideClick: false,
      allowEscapeKey: false,
      customClass: {
        confirmButton: "swal-btn-confirm",
      },
      preConfirm: () => {
        const nombre = document.getElementById("swal-nombre").value.trim();
        const email = document.getElementById("swal-email").value.trim();

        if (!nombre || nombre.length < 2) {
          Swal.showValidationMessage("Ingresá un nombre válido");
          return false;
        }

        if (emailObligatorio && !email) {
          Swal.showValidationMessage("El email es obligatorio");
          return false;
        }

        if (email && !/^\S+@\S+\.\S+$/.test(email)) {
          Swal.showValidationMessage("Email inválido");
          return false;
        }

        return {
          nombre,
          email: email || null,
        };
      },
    });

    if (!isConfirmed) return null;
    return value;
  }

  async function pedirTelefono({
    titulo = "📱 Añadí tu teléfono",
    subtitulo = "Necesitamos tu número para enviarte recordatorios y confirmaciones de turnos.",
  }) {
    const { value, isConfirmed } = await Swal.fire({
      title: titulo,
      html: `
        <p style="font-size:14px;color:#555;margin-bottom:15px;">${subtitulo}</p>
        <input id="swal-telefono" class="swal2-input" placeholder="Ej: 11 1234 5678" type="tel">
      `,
      focusConfirm: false,
      confirmButtonText: "Guardar",
      showCancelButton: false,
      allowOutsideClick: false,
      allowEscapeKey: false,
      customClass: {
        confirmButton: "swal-btn-confirm",
      },
      preConfirm: () => {
        const telefono = document.getElementById("swal-telefono").value.trim();

        if (!telefono) {
          Swal.showValidationMessage("Ingresá tu número de teléfono");
          return false;
        }

        // Validar formato básico
        const digits = telefono.replace(/\D/g, "");
        if (digits.length < 10 || digits.length > 15) {
          Swal.showValidationMessage("Número de teléfono inválido");
          return false;
        }

        return telefono;
      },
    });

    if (!isConfirmed) return null;
    return value;
  }

  // ============================================================
  // LOGOUT
  // ============================================================
  async function logout() {
    await signOut(auth);
    setFirebaseUser(null);
    setEsAdminReal(false);
  }

  // ============================================================
  // PROVIDER
  // ============================================================
  return (
    <AuthContext.Provider
      value={{
        user: firebaseUser,
        nivel: firebaseUser?.nivel ?? 0,
        esAdminReal,
        permisos,
        loading,
        loginSettings,

        // auth público
        loginGoogle,
        loginEnProceso,
        loginFacebook,
        loginEmailPassword,
        loginTelefonoEnviarCodigo,
        loginTelefonoValidarCodigo,
        loginEmailEnviarLink,
        logout,

        puedeEditarPerfil,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

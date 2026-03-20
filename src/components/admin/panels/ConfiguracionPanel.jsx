import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

import { useAuth } from "../../../context/AuthContext.jsx";
import { db, functions as firebaseFunctions, storage } from "../../../Firebase.js";
import { swalError, swalSuccess } from "../../../public/utils/swalUtils.js";
import { hideLoading, showLoading } from "../../../services/loadingService.js";
import profesionalFemImg from "../../../assets/icons/profesional-fem.png";
import profesionalMascImg from "../../../assets/icons/profesional-masc.png";
import EmpleadosPanel from "./EmpleadosPanel.jsx";

const DIAS_SEMANA = [
  { key: "lunes", label: "Lunes" },
  { key: "martes", label: "Martes" },
  { key: "miercoles", label: "Miercoles" },
  { key: "jueves", label: "Jueves" },
  { key: "viernes", label: "Viernes" },
  { key: "sabado", label: "Sabado" },
  { key: "domingo", label: "Domingo" },
];

const AUTH_CONFIG_BASE = {
  google: true,
  email: true,
  phone: false,
  facebook: false,
};

const toStr = (value) => (typeof value === "string" ? value.trim() : "");

function formatConfigDate(value) {
  if (!value) return "";

  const date =
    typeof value?.toDate === "function"
      ? value.toDate()
      : value instanceof Date
        ? value
        : new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatConfigJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

function normalizeManualReviews(items = []) {
  const safeItems = Array.isArray(items) ? items : [];
  const next = safeItems
    .slice(0, 2)
    .map((item) => ({
      autor: toStr(item?.autor),
      fecha: toStr(item?.fecha),
      texto: toStr(item?.texto),
    }));

  while (next.length < 2) {
    next.push({ autor: "", fecha: "", texto: "" });
  }

  return next;
}

function esUrlValida(value) {
  const text = toStr(value);
  return /^https?:\/\/.+\..+/i.test(text);
}

function esWhatsappValido(value) {
  const text = toStr(value);
  return /^[0-9]{8,15}$/.test(text);
}

function getProfesionalFallback(profesional) {
  if (profesional?.imgProfesional) return profesional.imgProfesional;
  if (profesional?.generoProfesional === "masculino") return profesionalMascImg;
  return profesionalFemImg;
}

async function obtenerAuthConfig() {
  const authRef = doc(db, "configuracion", "auth");
  const snap = await getDoc(authRef);

  if (snap.exists()) {
    return { ...AUTH_CONFIG_BASE, ...snap.data() };
  }

  await setDoc(authRef, AUTH_CONFIG_BASE);
  return AUTH_CONFIG_BASE;
}

async function obtenerProfesionales() {
  const snap = await getDocs(collection(db, "profesionales"));
  return snap.docs.map((item) => ({
    id: item.id,
    ...item.data(),
  }));
}

async function obtenerRedes() {
  const snap = await getDoc(doc(db, "configuracion", "social"));
  return snap.exists() ? snap.data() : null;
}

async function obtenerUbicacion() {
  const snap = await getDoc(doc(db, "configuracion", "ubicacion"));
  return snap.exists() ? snap.data() : null;
}

async function obtenerHorarios() {
  const snap = await getDoc(doc(db, "configuracion", "horarios"));
  return snap.exists() ? snap.data() : null;
}

async function obtenerHomeVisuales() {
  const snap = await getDoc(doc(db, "configuracion", "homeVisuales"));
  return snap.exists() ? snap.data() : null;
}

async function obtenerReservasConfig() {
  const snap = await getDoc(doc(db, "configuracion", "reservas"));
  return snap.exists()
    ? snap.data()
    : {
        bloquearTurnosMananaSin12h: false,
        permitirReprogramacionUsuario: true,
        maxReprogramacionesUsuario: 1,
        whatsappHabilitado: false,
        enviarWhatsappPendienteTest: false,
        horaRecordatorioWhatsapp: "10:00",
        whatsappCodigoPais: "54",
        whatsappPhoneNumberId: "",
        whatsappTemplateIdioma: "es_AR",
        whatsappTemplateSolicitud: "",
        whatsappTemplateRecordatorio: "",
      };
}

function Seccion({
  title,
  subtitle,
  open,
  onToggle,
  completo = null,
  loading = false,
  children,
}) {
  return (
    <section className={`config-section-card ${open ? "open" : ""}`}>
      <button
        type="button"
        className="config-section-header"
        onClick={onToggle}
        aria-expanded={open}
      >
        <div className="config-section-heading">
          <span className="config-section-title">{title}</span>
          {subtitle ? (
            <span className="config-section-subtitle">{subtitle}</span>
          ) : null}
        </div>

        <div className="config-section-meta">
          {completo !== null ? (
            <span
              className={`config-section-status ${completo ? "ok" : "pending"}`}
            >
              <span className="config-section-status-dot" />
              {completo ? "Completo" : "Pendiente"}
            </span>
          ) : null}
          <span className="config-section-chevron" aria-hidden="true">
            {open ? "-" : "+"}
          </span>
        </div>
      </button>

      <div className={`config-section-body ${open ? "open" : ""}`}>
        <div className="config-section-body-inner">
          {loading ? <LoadingBlock /> : children}
        </div>
      </div>
    </section>
  );
}

function LoadingBlock({ label = "Cargando seccion..." }) {
  return (
    <div className="config-loading-block" role="status" aria-live="polite">
      <span className="spinner-border spinner-border-sm" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

function ImageWithLoader({ src, alt, className = "", wrapperClassName = "" }) {
  const [imageLoading, setImageLoading] = useState(Boolean(src));
  const imgRef = useRef(null);

  useEffect(() => {
    setImageLoading(Boolean(src));
  }, [src]);

  useEffect(() => {
    if (imgRef.current?.complete && src) {
      setImageLoading(false);
    }
  }, [src]);

  return (
    <div className={`config-image-shell ${wrapperClassName}`.trim()}>
      {imageLoading ? (
        <div className="config-image-loader" aria-hidden="true">
          <span className="spinner-border spinner-border-sm" />
        </div>
      ) : null}

      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className={className}
        onLoad={() => setImageLoading(false)}
        onError={() => setImageLoading(false)}
      />
    </div>
  );
}

async function runWithLoading(task, options = {}) {
  showLoading(options);

  try {
    return await task();
  } finally {
    hideLoading();
  }
}

export default function AdminConfiguracion() {
  const { user, loading } = useAuth();
  const [sectionLoading, setSectionLoading] = useState({
    auth: true,
    profesionales: true,
    redes: true,
    ubicacion: true,
    horarios: true,
    homeVisuales: true,
    reservas: true,
  });

  const [profesionales, setProfesionales] = useState([]);
  const [nombreProfesional, setNombreProfesional] = useState("");
  const [generoProfesional, setGeneroProfesional] = useState("femenino");
  const [fileProfesional, setFileProfesional] = useState(null);
  const [profesionalEditandoId, setProfesionalEditandoId] = useState("");
  const [imagenProfesionalActual, setImagenProfesionalActual] = useState("");
  const [homeVisuales, setHomeVisuales] = useState({
    imgPrincipalHome: "",
    imgSecundariaHome: "",
    faviconUrl: "",
    googleReviewsUrl: "",
    googlePlaceId: "",
    reviewsEnabled: true,
    reviewsDisplayCount: "2",
    manualReviewsRating: "",
    manualReviewsTotal: "",
    manualReviewsItems: [
      { autor: "", fecha: "", texto: "" },
      { autor: "", fecha: "", texto: "" },
    ],
  });
  const [fileHomePrincipal, setFileHomePrincipal] = useState(null);
  const [fileHomeSecundaria, setFileHomeSecundaria] = useState(null);
  const [fileHomeFavicon, setFileHomeFavicon] = useState(null);

  const fileInputProfesionalRef = useRef(null);
  const profesionalFormRef = useRef(null);
  const fileInputHomePrincipalRef = useRef(null);
  const fileInputHomeSecundariaRef = useRef(null);
  const fileInputHomeFaviconRef = useRef(null);

  const [open, setOpen] = useState({
    redes: false,
    ubicacion: false,
    auth: true,
    reservas: false,
    mercadoPago: false,
    empleados: false,
    profesionales: false,
    homeVisuales: false,
  });

  const [social, setSocial] = useState({
    instagramContacto: "",
    tiktokContacto: "",
    whatsappContacto: "",
    facebookContacto: "",
    webContacto: "",
    xContacto: "",
  });

  const [ubicacion, setUbicacion] = useState({
    mapsDireccion: "",
    mapsEmbedUrl: "",
    mapsLink: "",
  });

  const [horarios, setHorarios] = useState({
    lunes: { abierto: false, desde: "", hasta: "" },
    martes: { abierto: false, desde: "", hasta: "" },
    miercoles: { abierto: false, desde: "", hasta: "" },
    jueves: { abierto: false, desde: "", hasta: "" },
    viernes: { abierto: false, desde: "", hasta: "" },
    sabado: { abierto: false, desde: "", hasta: "" },
    domingo: { abierto: false, desde: "", hasta: "" },
  });

  const [authConfig, setAuthConfig] = useState({
    ...AUTH_CONFIG_BASE,
  });
  const [reservasConfig, setReservasConfig] = useState({
    bloquearTurnosMananaSin12h: false,
    permitirReprogramacionUsuario: true,
    maxReprogramacionesUsuario: 1,
    whatsappHabilitado: false,
    enviarWhatsappPendienteTest: false,
    horaRecordatorioWhatsapp: "10:00",
    whatsappCodigoPais: "54",
    whatsappPhoneNumberId: "",
    whatsappTemplateIdioma: "es_AR",
    whatsappTemplateSolicitud: "",
    whatsappTemplateRecordatorio: "",
  });
  const [whatsappEstado, setWhatsappEstado] = useState({
    status: "idle",
    message: "Token sin validar",
  });
  const [mpOauth, setMpOauth] = useState({
    loading: true,
    connecting: false,
    disconnecting: false,
    connected: false,
    account: null,
    message: "Cargando estado de Mercado Pago...",
  });

  const toggle = (key) => {
    setOpen((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const fileProfesionalPreview = useMemo(
    () => (fileProfesional ? URL.createObjectURL(fileProfesional) : ""),
    [fileProfesional],
  );
  const fileHomePrincipalPreview = useMemo(
    () => (fileHomePrincipal ? URL.createObjectURL(fileHomePrincipal) : ""),
    [fileHomePrincipal],
  );
  const fileHomeSecundariaPreview = useMemo(
    () => (fileHomeSecundaria ? URL.createObjectURL(fileHomeSecundaria) : ""),
    [fileHomeSecundaria],
  );
  const fileHomeFaviconPreview = useMemo(
    () => (fileHomeFavicon ? URL.createObjectURL(fileHomeFavicon) : ""),
    [fileHomeFavicon],
  );

  useEffect(() => {
    return () => {
      if (fileProfesionalPreview) URL.revokeObjectURL(fileProfesionalPreview);
      if (fileHomePrincipalPreview)
        URL.revokeObjectURL(fileHomePrincipalPreview);
      if (fileHomeSecundariaPreview)
        URL.revokeObjectURL(fileHomeSecundariaPreview);
      if (fileHomeFaviconPreview) URL.revokeObjectURL(fileHomeFaviconPreview);
    };
  }, [
    fileProfesionalPreview,
    fileHomePrincipalPreview,
    fileHomeSecundariaPreview,
    fileHomeFaviconPreview,
  ]);

  async function cargarProfesionales() {
    setProfesionales(await obtenerProfesionales());
  }

  function resetProfesionalForm() {
    setNombreProfesional("");
    setGeneroProfesional("femenino");
    setFileProfesional(null);
    setProfesionalEditandoId("");
    setImagenProfesionalActual("");

    if (fileInputProfesionalRef.current) {
      fileInputProfesionalRef.current.value = "";
    }
  }

  useEffect(() => {
    if (loading) return;
    if (!user?.uid) return;
    if (Number(user.nivel) !== 4) return;

    let cancelled = false;

    async function cargarInicial() {
      setSectionLoading({
        auth: true,
        profesionales: true,
        redes: true,
        ubicacion: true,
        horarios: true,
        homeVisuales: true,
        reservas: true,
      });

      const tareas = [
        ["auth", async () => setAuthConfig(await obtenerAuthConfig())],
        [
          "profesionales",
          async () => setProfesionales(await obtenerProfesionales()),
        ],
        [
          "redes",
          async () => {
            const redesData = await obtenerRedes();
            if (redesData) setSocial((prev) => ({ ...prev, ...redesData }));
          },
        ],
        [
          "ubicacion",
          async () => {
            const ubicacionData = await obtenerUbicacion();
            if (ubicacionData) {
              setUbicacion((prev) => ({ ...prev, ...ubicacionData }));
            }
          },
        ],
        [
          "horarios",
          async () => {
            const horariosData = await obtenerHorarios();
            if (horariosData) {
              setHorarios((prev) => ({
                ...prev,
                ...horariosData,
              }));
            }
          },
        ],
        [
          "homeVisuales",
          async () => {
            const homeVisualesData = await obtenerHomeVisuales();
            if (homeVisualesData) {
              setHomeVisuales((prev) => ({
                ...prev,
                ...homeVisualesData,
              }));
            }
          },
        ],
        [
          "reservas",
          async () => {
            const reservasData = await obtenerReservasConfig();
            if (reservasData) {
              setReservasConfig((prev) => ({
                ...prev,
                ...reservasData,
              }));
            }
          },
        ],
      ];

      await Promise.all(
        tareas.map(async ([key, task]) => {
          try {
            if (!cancelled) await task();
          } catch (error) {
            console.error(`Error cargando seccion ${key}`, error);
          } finally {
            if (!cancelled) {
              setSectionLoading((current) => ({
                ...current,
                [key]: false,
              }));
            }
          }
        }),
      );
    }

    void cargarInicial();

    return () => {
      cancelled = true;
    };
  }, [loading, user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthResult = params.get("mp_oauth");
    if (!oauthResult) return;

    if (oauthResult === "ok") {
      swalSuccess({
        title: "Mercado Pago conectado",
        text: "La cuenta se vinculó correctamente.",
      });
    } else {
      const reason = params.get("reason");
      swalError({
        title: "No se pudo conectar Mercado Pago",
        text: reason
          ? `Detalle: ${reason}`
          : "Volvé a intentar la conexión.",
      });
    }

    params.delete("mp_oauth");
    params.delete("reason");
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`;
    window.history.replaceState({}, "", nextUrl);
  }, []);

  if (loading) {
    return (
      <div className="config-admin-page">
        <LoadingBlock label="Cargando configuracion..." />
      </div>
    );
  }

  if (!user || Number(user.nivel) !== 4) {
    return (
      <div className="alert alert-danger">
        Solo el dueño puede acceder a la configuracion del sistema.
      </div>
    );
  }

  async function guardarAuthConfig() {
    await runWithLoading(
      () => setDoc(doc(db, "configuracion", "auth"), authConfig),
      {
        title: "Guardando configuracion",
        text: "Actualizando metodos de inicio de sesion...",
      },
    );
    swalSuccess({
      title: "Metodos de inicio de sesion",
      text: "Configuracion actualizada correctamente",
    });
  }

  async function guardarReservasConfig() {
    await runWithLoading(
      () => setDoc(doc(db, "configuracion", "reservas"), reservasConfig),
      {
        title: "Guardando reglas",
        text: "Actualizando reglas generales de reserva...",
      },
    );

    if (reservasConfig.whatsappPhoneNumberId) {
      await validarWhatsAppToken({ silent: true });
    } else {
      setWhatsappEstado({
        status: "idle",
        message: "Completa el Phone Number ID para validar",
      });
    }

    swalSuccess({
      title: "Reglas de reserva",
      text: "Configuracion actualizada correctamente",
    });
  }

  async function validarWhatsAppToken({ silent = false } = {}) {
    if (!reservasConfig.whatsappPhoneNumberId) {
      setWhatsappEstado({
        status: "error",
        message: "Falta el Phone Number ID",
      });
      return;
    }

    if (!silent) {
      setWhatsappEstado({
        status: "checking",
        message: "Validando token...",
      });
    }

    try {
      const callable = httpsCallable(firebaseFunctions, "validarWhatsAppConfig");
      const response = await callable({
        phoneNumberId: reservasConfig.whatsappPhoneNumberId,
      });

      const data = response?.data || {};
      const detalles = [data.verifiedName, data.displayPhoneNumber]
        .filter(Boolean)
        .join(" - ");

      setWhatsappEstado({
        status: "ok",
        message: detalles
          ? `Token correcto${detalles ? ` (${detalles})` : ""}`
          : "Token correcto",
      });
    } catch (error) {
      const message =
        error?.message?.replace("FirebaseError: ", "") ||
        "Token incorrecto";

      setWhatsappEstado({
        status: "error",
        message: message.includes("Token incorrecto")
          ? message
          : `Token incorrecto: ${message}`,
      });
    }
  }

  async function cargarMpOauthEstado() {
    setMpOauth((current) => ({
      ...current,
      loading: true,
      message: "Consultando estado de Mercado Pago...",
    }));

    try {
      const callable = httpsCallable(firebaseFunctions, "mpOAuthStatus");
      const response = await callable();
      const data = response?.data || {};
      const connected = Boolean(data.connected);
      const account = data.account || null;

      setMpOauth({
        loading: false,
        connecting: false,
        disconnecting: false,
        connected,
        account,
        message: connected
          ? `Conectado${account?.mpNickname ? ` (${account.mpNickname})` : ""}`
          : "No hay cuenta conectada",
      });
    } catch (error) {
      const message =
        error?.message?.replace("FirebaseError: ", "") ||
        "No se pudo obtener el estado";
      setMpOauth({
        loading: false,
        connecting: false,
        disconnecting: false,
        connected: false,
        account: null,
        message,
      });
    }
  }

  async function conectarMercadoPago() {
    setMpOauth((current) => ({
      ...current,
      connecting: true,
      message: "Generando enlace de conexión...",
    }));

    try {
      const callable = httpsCallable(firebaseFunctions, "mpOAuthStart");
      const response = await callable();
      const url = String(response?.data?.url || "").trim();

      if (!url) {
        throw new Error("No se recibió URL de autorización OAuth");
      }

      window.location.assign(url);
    } catch (error) {
      const message =
        error?.message?.replace("FirebaseError: ", "") ||
        "No se pudo iniciar OAuth";
      setMpOauth((current) => ({
        ...current,
        connecting: false,
        message,
      }));
      swalError({
        title: "Error iniciando conexión",
        text: message,
      });
    }
  }

  async function desconectarMercadoPago() {
    const confirm = await confirmDanger({
      title: "Desconectar Mercado Pago",
      text: "Se desactivará la cuenta conectada para split. Podrás reconectarla cuando quieras.",
      confirmText: "Desconectar",
      cancelText: "Cancelar",
    });

    if (!confirm?.isConfirmed) return;

    setMpOauth((current) => ({
      ...current,
      disconnecting: true,
      message: "Desconectando cuenta...",
    }));

    try {
      const callable = httpsCallable(firebaseFunctions, "mpOAuthDisconnect");
      await callable();
      await cargarMpOauthEstado();
      swalSuccess({
        title: "Mercado Pago desconectado",
        text: "La conexión OAuth fue eliminada correctamente.",
      });
    } catch (error) {
      const message =
        error?.message?.replace("FirebaseError: ", "") ||
        "No se pudo desconectar";
      setMpOauth((current) => ({
        ...current,
        disconnecting: false,
        message,
      }));
      swalError({
        title: "No se pudo desconectar",
        text: message,
      });
    }
  }

  useEffect(() => {
    if (loading) return;
    if (!user?.uid || Number(user.nivel) !== 4) return;
    void cargarMpOauthEstado();
  }, [loading, user?.uid, user?.nivel]);

  async function agregarProfesional() {
    if (!nombreProfesional.trim()) {
      swalError({
        title: "Error",
        text: "El nombre es obligatorio",
      });
      return;
    }

    await runWithLoading(
      async () => {
        let urlImagen = "";

        if (fileProfesional) {
          const nombreArchivo = `${Date.now()}_${fileProfesional.name}`;
          const storageRef = ref(storage, `profesionales/${nombreArchivo}`);

          await uploadBytes(storageRef, fileProfesional);
          urlImagen = await getDownloadURL(storageRef);
        }

        await addDoc(collection(db, "profesionales"), {
          nombreProfesional: nombreProfesional.trim(),
          imgProfesional: urlImagen,
          generoProfesional,
          activo: true,
          creadoEn: new Date(),
        });

        resetProfesionalForm();
        await cargarProfesionales();
      },
      {
        title: "Guardando profesional",
        text: "Subiendo imagen y actualizando el equipo...",
      },
    );

    swalSuccess({
      title: "Profesional agregado",
    });
  }

  async function guardarEdicionProfesional() {
    if (!nombreProfesional.trim() || !profesionalEditandoId) {
      swalError({
        title: "Error",
        text: "El nombre del profesional es obligatorio.",
      });
      return;
    }

    const profesionalActual = profesionales.find(
      (item) => item.id === profesionalEditandoId,
    );

    await runWithLoading(
      async () => {
        let urlImagen = profesionalActual?.imgProfesional || "";

        if (fileProfesional) {
          const nombreArchivo = `${Date.now()}_${fileProfesional.name}`;
          const storageRef = ref(storage, `profesionales/${nombreArchivo}`);

          await uploadBytes(storageRef, fileProfesional);
          urlImagen = await getDownloadURL(storageRef);
        }

        await updateDoc(doc(db, "profesionales", profesionalEditandoId), {
          nombreProfesional: nombreProfesional.trim(),
          generoProfesional,
          imgProfesional: urlImagen,
        });

        resetProfesionalForm();
        await cargarProfesionales();
      },
      {
        title: "Guardando cambios",
        text: "Actualizando profesional...",
      },
    );

    swalSuccess({
      title: "Profesional actualizado",
    });
  }

  function editarProfesional(profesional) {
    setProfesionalEditandoId(profesional.id);
    setNombreProfesional(profesional.nombreProfesional || "");
    setGeneroProfesional(profesional.generoProfesional || "femenino");
    setFileProfesional(null);
    setImagenProfesionalActual(profesional.imgProfesional || "");

    if (fileInputProfesionalRef.current) {
      fileInputProfesionalRef.current.value = "";
    }

    profesionalFormRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  async function eliminarProfesional(id) {
    await runWithLoading(
      async () => {
        await deleteDoc(doc(db, "profesionales", id));
        await cargarProfesionales();
      },
      {
        title: "Eliminando profesional",
        text: "Actualizando el listado...",
      },
    );
  }

  async function guardarRedes() {
    await runWithLoading(
      () => setDoc(doc(db, "configuracion", "social"), social),
      {
        title: "Guardando redes",
        text: "Actualizando canales de contacto...",
      },
    );
    swalSuccess({
      title: "Redes sociales",
      text: "Actualizadas con exito",
    });
  }

  async function guardarUbicacion() {
    if (!ubicacion.mapsEmbedUrl) {
      swalError({
        title: "Error",
        text: "El link embed de Google Maps es obligatorio.",
      });
      return;
    }

    if (!ubicacion.mapsDireccion) {
      swalError({
        title: "Error",
        text: "Completa la direccion del local.",
      });
      return;
    }

    await runWithLoading(
      () => setDoc(doc(db, "configuracion", "ubicacion"), ubicacion),
      {
        title: "Guardando ubicacion",
        text: "Actualizando direccion y mapa...",
      },
    );
    swalSuccess({
      title: "Ubicacion",
      text: "Datos actualizados correctamente",
    });
  }

  async function guardarHorarios() {
    await runWithLoading(
      () => setDoc(doc(db, "configuracion", "horarios"), horarios),
      {
        title: "Guardando horarios",
        text: "Actualizando disponibilidad del negocio...",
      },
    );
    swalSuccess({
      title: "Horarios",
      text: "Horarios actualizados correctamente",
    });
  }

  async function guardarHomeVisuales() {
    await runWithLoading(
      async () => {
        let imgPrincipalHome = homeVisuales.imgPrincipalHome || "";
        let imgSecundariaHome = homeVisuales.imgSecundariaHome || "";
        let faviconUrl = homeVisuales.faviconUrl || "";
        const googleReviewsUrl = String(
          homeVisuales.googleReviewsUrl || "",
        ).trim();
        const googlePlaceId = String(homeVisuales.googlePlaceId || "").trim();
        const reviewsEnabled = homeVisuales.reviewsEnabled !== false;
        const reviewsDisplayCount = String(
          homeVisuales.reviewsDisplayCount || "2",
        ).trim();
        const manualReviewsRating = String(
          homeVisuales.manualReviewsRating || "",
        ).trim();
        const manualReviewsTotal = String(
          homeVisuales.manualReviewsTotal || "",
        ).trim();
        const manualReviewsItems = normalizeManualReviews(
          homeVisuales.manualReviewsItems,
        );

        if (fileHomePrincipal) {
          const nombreArchivo = `${Date.now()}_${fileHomePrincipal.name}`;
          const storageRef = ref(storage, `home/${nombreArchivo}`);
          await uploadBytes(storageRef, fileHomePrincipal);
          imgPrincipalHome = await getDownloadURL(storageRef);
        }

        if (fileHomeSecundaria) {
          const nombreArchivo = `${Date.now()}_${fileHomeSecundaria.name}`;
          const storageRef = ref(storage, `home/${nombreArchivo}`);
          await uploadBytes(storageRef, fileHomeSecundaria);
          imgSecundariaHome = await getDownloadURL(storageRef);
        }

        if (fileHomeFavicon) {
          const nombreArchivo = `${Date.now()}_${fileHomeFavicon.name}`;
          const storageRef = ref(storage, `home/favicon/${nombreArchivo}`);
          await uploadBytes(storageRef, fileHomeFavicon);
          faviconUrl = await getDownloadURL(storageRef);
        }

        const next = {
          imgPrincipalHome,
          imgSecundariaHome,
          faviconUrl,
          googleReviewsUrl,
          googlePlaceId,
          reviewsEnabled,
          reviewsDisplayCount,
          manualReviewsRating,
          manualReviewsTotal,
          manualReviewsItems,
        };

        await setDoc(doc(db, "configuracion", "homeVisuales"), next, {
          merge: true,
        });

        let syncedData = null;
        let syncError = "";

        if (googlePlaceId) {
          try {
            const callable = httpsCallable(
              firebaseFunctions,
              "sincronizarGoogleReviewsAdmin",
            );
            const response = await callable();
            syncedData = response?.data || null;
          } catch (error) {
            console.error("No se pudieron sincronizar las reseñas", error);
            syncError =
              error?.message?.replace("FirebaseError: ", "") ||
              "No se pudieron sincronizar las reseñas de Google";
          }
        }

        setHomeVisuales((prev) => ({
          ...prev,
          ...next,
          googleReviewsSyncError: syncError,
          ...(syncedData || {}),
        }));

        if (syncError) {
          await setDoc(
            doc(db, "configuracion", "homeVisuales"),
            {
              googleReviewsSyncError: syncError,
            },
            { merge: true },
          );
        }
        setFileHomePrincipal(null);
        setFileHomeSecundaria(null);
        setFileHomeFavicon(null);

        if (fileInputHomePrincipalRef.current) {
          fileInputHomePrincipalRef.current.value = "";
        }

        if (fileInputHomeSecundariaRef.current) {
          fileInputHomeSecundariaRef.current.value = "";
        }

        if (fileInputHomeFaviconRef.current) {
          fileInputHomeFaviconRef.current.value = "";
        }
      },
      {
        title: "Guardando imagenes",
        text: "Subiendo archivos y actualizando el home...",
      },
    );

    swalSuccess({
      title: "Visuales del home",
      text: homeVisuales.googlePlaceId
        ? "La configuracion fue actualizada. Si las reseñas no cambian, revisa el estado de sincronizacion."
        : "La configuracion fue actualizada correctamente",
    });
  }

  const redesCompletas = Object.entries(social).every(([key, value]) => {
    if (!value) return true;
    if (key === "whatsappContacto") return esWhatsappValido(value);
    return esUrlValida(value);
  });

  const ubicacionCompleta = Boolean(
    ubicacion.mapsEmbedUrl && ubicacion.mapsDireccion,
  );
  const initialLoading = Object.values(sectionLoading).some(Boolean);
  const metodosActivos = Object.values(authConfig).filter(Boolean).length;
  const redesCargadas = Object.values(social).filter((value) =>
    toStr(value),
  ).length;
  const diasAbiertos = Object.values(horarios).filter(
    (dia) => dia?.abierto,
  ).length;
  const homeVisualesCompleto = Boolean(
    homeVisuales.imgPrincipalHome &&
      homeVisuales.imgSecundariaHome &&
      homeVisuales.faviconUrl,
  );

  return (
    <div className="config-admin-page">
      <section className="config-admin-hero">
        <div className="config-admin-hero-copy">
          <p className="config-admin-eyebrow">Panel de administracion</p>
          <h2 className="config-admin-title">Configuracion del sistema</h2>
          <p className="config-admin-subtitle">
            Ajusta accesos, datos del negocio, presencia digital y equipo desde
            una vista ordenada para desktop y mobile.
          </p>
        </div>

        <div className="config-admin-summary">
          <article className="config-summary-card">
            <span className="config-summary-label">Metodos activos</span>
            <strong>{initialLoading ? "..." : metodosActivos}</strong>
          </article>
          <article className="config-summary-card">
            <span className="config-summary-label">Profesionales</span>
            <strong>{initialLoading ? "..." : profesionales.length}</strong>
          </article>
          <article className="config-summary-card">
            <span className="config-summary-label">Redes cargadas</span>
            <strong>{initialLoading ? "..." : redesCargadas}</strong>
          </article>
          <article className="config-summary-card">
            <span className="config-summary-label">Dias abiertos</span>
            <strong>{initialLoading ? "..." : diasAbiertos}</strong>
          </article>
        </div>
      </section>

      <div className="config-admin-sections">
        <Seccion
          title="Metodos de inicio de sesion"
          subtitle="Define que accesos pueden usar los clientes."
          open={open.auth}
          onToggle={() => toggle("auth")}
          loading={sectionLoading.auth}
        >
          <div className="config-note">
            Se recomienda mantener Google y correo electronico habilitados para
            evitar bloqueos de acceso.
          </div>

          <div className="config-switch-list">
            {[
              ["google", "Google"],
              ["email", "Correo electronico"],
              ["phone", "Telefono (SMS)"],
              ["facebook", "Facebook"],
            ].map(([key, label]) => (
              <label key={key} className="config-switch-item">
                <div>
                  <span className="config-switch-label">{label}</span>
                  {(key === "google" || key === "email") && (
                    <span className="config-pill">Obligatorio</span>
                  )}
                </div>

                <input
                  className="form-check-input"
                  type="checkbox"
                  checked={Boolean(authConfig[key])}
                  onChange={(event) =>
                    setAuthConfig((current) => ({
                      ...current,
                      [key]: event.target.checked,
                    }))
                  }
                  disabled={key === "google" || key === "email"}
                />
              </label>
            ))}
          </div>

          <div className="config-actions">
            <button
              className="btn swal-btn-confirm"
              onClick={guardarAuthConfig}
            >
              Guardar configuracion
            </button>
          </div>
        </Seccion>

        <Seccion
          title="Reglas de reserva"
          subtitle="Condiciones globales que aplican a la agenda publica."
          open={open.reservas}
          onToggle={() => toggle("reservas")}
          loading={sectionLoading.reservas}
        >
          <div className="config-note">
            Desde aca podes controlar reglas de anticipacion y el envio
            automatico de WhatsApp para pruebas y recordatorios.
          </div>

          <div className="config-switch-list">
            <label className="config-switch-item">
              <div>
                <span className="config-switch-label">
                  Exigir 12 horas de anticipacion para turnos antes de las 12:00
                </span>
              </div>

              <input
                className="form-check-input"
                type="checkbox"
                checked={Boolean(reservasConfig.bloquearTurnosMananaSin12h)}
                onChange={(event) =>
                  setReservasConfig((current) => ({
                    ...current,
                    bloquearTurnosMananaSin12h: event.target.checked,
                  }))
                }
              />
            </label>

            <label className="config-switch-item">
              <div>
                <span className="config-switch-label">
                  Permitir reprogramaciones por el usuario
                </span>
              </div>

              <input
                className="form-check-input"
                type="checkbox"
                checked={Boolean(reservasConfig.permitirReprogramacionUsuario)}
                onChange={(event) =>
                  setReservasConfig((current) => ({
                    ...current,
                    permitirReprogramacionUsuario: event.target.checked,
                  }))
                }
              />
            </label>

            <label className="config-field">
              <span>Se permiten X reprogramaciones por turno</span>
              <input
                className="form-control"
                type="number"
                min="0"
                step="1"
                value={Number(reservasConfig.maxReprogramacionesUsuario ?? 1)}
                onChange={(event) =>
                  setReservasConfig((current) => ({
                    ...current,
                    maxReprogramacionesUsuario: Math.max(
                      0,
                      Number(event.target.value || 0),
                    ),
                  }))
                }
                disabled={!Boolean(reservasConfig.permitirReprogramacionUsuario)}
              />
            </label>

            <label className="config-switch-item">
              <div>
                <span className="config-switch-label">
                  Activar WhatsApp automatico
                </span>
              </div>

              <input
                className="form-check-input"
                type="checkbox"
                checked={Boolean(reservasConfig.whatsappHabilitado)}
                onChange={(event) =>
                  setReservasConfig((current) => ({
                    ...current,
                    whatsappHabilitado: event.target.checked,
                  }))
                }
              />
            </label>

            <label className="config-switch-item">
              <div>
                <span className="config-switch-label">
                  Enviar mensaje de prueba al solicitar turno
                </span>
              </div>

              <input
                className="form-check-input"
                type="checkbox"
                checked={Boolean(reservasConfig.enviarWhatsappPendienteTest)}
                onChange={(event) =>
                  setReservasConfig((current) => ({
                    ...current,
                    enviarWhatsappPendienteTest: event.target.checked,
                  }))
                }
              />
            </label>
          </div>

          <div className="config-form-grid mt-3">
            <label className="config-field">
              <span>Hora del recordatorio del dia siguiente</span>
              <input
                className="form-control"
                type="time"
                value={reservasConfig.horaRecordatorioWhatsapp || "10:00"}
                onChange={(event) =>
                  setReservasConfig((current) => ({
                    ...current,
                    horaRecordatorioWhatsapp: event.target.value,
                  }))
                }
              />
            </label>

            <label className="config-field">
              <span>Codigo de pais WhatsApp</span>
              <input
                className="form-control"
                placeholder="54"
                value={reservasConfig.whatsappCodigoPais || ""}
                onChange={(event) =>
                  setReservasConfig((current) => ({
                    ...current,
                    whatsappCodigoPais: event.target.value,
                  }))
                }
              />
            </label>

            <label className="config-field">
              <span>Phone Number ID de WhatsApp Cloud</span>
              <input
                className="form-control"
                placeholder="Ej: 123456789012345"
                value={reservasConfig.whatsappPhoneNumberId || ""}
                onChange={(event) =>
                  setReservasConfig((current) => ({
                    ...current,
                    whatsappPhoneNumberId: event.target.value,
                  }))
                }
              />
            </label>

            <label className="config-field">
              <span>Idioma del template</span>
              <input
                className="form-control"
                placeholder="es_AR"
                value={reservasConfig.whatsappTemplateIdioma || ""}
                onChange={(event) =>
                  setReservasConfig((current) => ({
                    ...current,
                    whatsappTemplateIdioma: event.target.value,
                  }))
                }
              />
            </label>

            <label className="config-field">
              <span>Template solicitud (opcional)</span>
              <input
                className="form-control"
                placeholder="turno_pendiente"
                value={reservasConfig.whatsappTemplateSolicitud || ""}
                onChange={(event) =>
                  setReservasConfig((current) => ({
                    ...current,
                    whatsappTemplateSolicitud: event.target.value,
                  }))
                }
              />
            </label>

            <label className="config-field">
              <span>Template recordatorio (opcional)</span>
              <input
                className="form-control"
                placeholder="recordatorio_turno"
                value={reservasConfig.whatsappTemplateRecordatorio || ""}
                onChange={(event) =>
                  setReservasConfig((current) => ({
                    ...current,
                    whatsappTemplateRecordatorio: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <div className="config-note mt-3">
            El token de Meta se sigue cargando como secret en Firebase. Si no
            completas templates, el sistema intenta enviar texto simple para
            pruebas.
          </div>


          <div className="config-actions config-actions-inline">
            <button
              className="btn btn-outline-secondary"
              type="button"
              onClick={() => validarWhatsAppToken()}
              disabled={whatsappEstado.status === "checking"}
            >
              {whatsappEstado.status === "checking"
                ? "Validando token..."
                : "Validar token"}
            </button>

            <span
              className={`config-section-status ${
                whatsappEstado.status === "ok"
                  ? "ok"
                  : whatsappEstado.status === "error"
                    ? "pending"
                    : ""
              }`}
            >
              <span className="config-section-status-dot" />
              {whatsappEstado.message}
            </span>
          </div>

          <div className="config-actions">
            <button
              className="btn swal-btn-confirm"
              onClick={guardarReservasConfig}
            >
              Guardar reglas
            </button>
          </div>
        </Seccion>

        <Seccion
          title="Mercado Pago"
          subtitle="Conecta la cuenta del negocio para split de comision."
          open={open.mercadoPago}
          onToggle={() => toggle("mercadoPago")}
          loading={false}
        >
          <div className="config-note">
            Esta conexion habilita cobros con cuenta conectada y aplica
            `marketplace_fee` para enviar tu comision automaticamente.
          </div>

          <div className="config-actions config-actions-inline mt-3">
            <button
              className="btn btn-outline-secondary"
              type="button"
              onClick={() => conectarMercadoPago()}
              disabled={mpOauth.loading || mpOauth.connecting || mpOauth.disconnecting}
            >
              {mpOauth.connecting ? "Conectando..." : "Conectar Mercado Pago"}
            </button>

            <button
              className="btn btn-outline-secondary"
              type="button"
              onClick={() => cargarMpOauthEstado()}
              disabled={mpOauth.loading || mpOauth.connecting || mpOauth.disconnecting}
            >
              {mpOauth.loading ? "Consultando..." : "Actualizar estado"}
            </button>

            <button
              className="btn btn-outline-danger"
              type="button"
              onClick={() => desconectarMercadoPago()}
              disabled={!mpOauth.connected || mpOauth.loading || mpOauth.connecting || mpOauth.disconnecting}
              title="Desconectar Mercado Pago"
              aria-label="Desconectar Mercado Pago"
            >
              {mpOauth.disconnecting ? "..." : "X"}
            </button>

            <span
              className={`config-section-status ${
                mpOauth.connected ? "ok" : "pending"
              }`}
            >
              <span className="config-section-status-dot" />
              {mpOauth.message}
            </span>
          </div>

          {mpOauth.account ? (
            <div className="config-note mt-3">
              Cuenta conectada: {mpOauth.account?.mpNickname || "sin nickname"}{" "}
              {mpOauth.account?.mpUserId
                ? `(ID ${mpOauth.account.mpUserId})`
                : ""}
            </div>
          ) : null}
        </Seccion>

        <Seccion
          title="Redes sociales"
          subtitle="Canales de contacto y presencia online del negocio."
          open={open.redes}
          onToggle={() => toggle("redes")}
          completo={redesCompletas}
          loading={sectionLoading.redes}
        >
          <div className="config-form-grid">
            {[
              ["instagramContacto", "Instagram (URL)"],
              ["tiktokContacto", "TikTok (URL)"],
              ["facebookContacto", "Facebook (URL)"],
              ["xContacto", "X / Twitter (URL)"],
              ["webContacto", "Web (URL)"],
              ["whatsappContacto", "WhatsApp (solo numeros)"],
            ].map(([key, label]) => (
              <label key={key} className="config-field">
                <span>{label}</span>
                <input
                  className="form-control"
                  placeholder={label}
                  value={social[key] || ""}
                  onChange={(event) =>
                    setSocial((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}
          </div>

          <div className="config-actions">
            <button className="btn swal-btn-confirm" onClick={guardarRedes}>
              Guardar datos
            </button>
          </div>
        </Seccion>

        <Seccion
          title="Empleados"
          subtitle="El dueño puede crear, editar y quitar accesos del equipo."
          open={open.empleados}
          onToggle={() => toggle("empleados")}
          loading={false}
        >
          <EmpleadosPanel />
        </Seccion>

        <Seccion
          title="Profesionales"
          subtitle="Gestiona el equipo que se muestra en el panel y en la web."
          open={open.profesionales}
          onToggle={() => toggle("profesionales")}
          loading={sectionLoading.profesionales}
        >
          <div className="config-prof-layout">
            <div ref={profesionalFormRef} className="config-prof-form">
              <label className="config-field">
                <span>Nombre del profesional</span>
                <input
                  className="form-control"
                  placeholder="Ej: Paula Gomez"
                  value={nombreProfesional}
                  onChange={(event) => setNombreProfesional(event.target.value)}
                />
              </label>

              <label className="config-field">
                <span>Foto de perfil</span>
                <input
                  ref={fileInputProfesionalRef}
                  type="file"
                  accept="image/*"
                  className="form-control"
                  onChange={(event) =>
                    setFileProfesional(event.target.files?.[0] || null)
                  }
                />
              </label>

              <label className="config-field">
                <span>Avatar por defecto</span>
                <select
                  className="form-control"
                  value={generoProfesional}
                  onChange={(event) => setGeneroProfesional(event.target.value)}
                >
                  <option value="femenino">Profesional femenino</option>
                  <option value="masculino">Profesional masculino</option>
                </select>
              </label>

              <div className="config-prof-preview">
                {fileProfesionalPreview ||
                imagenProfesionalActual ||
                generoProfesional ? (
                  <ImageWithLoader
                    src={
                      fileProfesionalPreview ||
                      imagenProfesionalActual ||
                      getProfesionalFallback({ generoProfesional })
                    }
                    alt="Preview profesional"
                  />
                ) : (
                  <div className="config-prof-preview-empty">Sin imagen</div>
                )}
              </div>
            </div>

            <div className="config-actions config-actions-inline">
              <button
                className="btn swal-btn-confirm"
                onClick={
                  profesionalEditandoId
                    ? guardarEdicionProfesional
                    : agregarProfesional
                }
              >
                {profesionalEditandoId
                  ? "Guardar cambios"
                  : "Agregar profesional"}
              </button>
              {profesionalEditandoId && (
                <button
                  className="btn swal-btn-cancel"
                  onClick={resetProfesionalForm}
                >
                  Cancelar edicion
                </button>
              )}
            </div>
          </div>

          <div className="config-prof-grid">
            {profesionales.length ? (
              profesionales.map((profesional) => (
                <article key={profesional.id} className="config-prof-card">
                  <ImageWithLoader
                    src={getProfesionalFallback(profesional)}
                    alt={profesional.nombreProfesional}
                    className="config-prof-card-image"
                    wrapperClassName="config-prof-card-image-shell"
                  />

                  <strong>{profesional.nombreProfesional}</strong>

                  <div className="config-prof-card-actions">
                    <button
                      className="swal-btn-editar"
                      onClick={() => editarProfesional(profesional)}
                    >
                      Editar
                    </button>

                    <button
                      className="swal-btn-eliminar-sm"
                      onClick={() => eliminarProfesional(profesional.id)}
                    >
                      Eliminar
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className="config-empty-state">
                Todavia no hay profesionales cargados.
              </div>
            )}
          </div>
        </Seccion>

        <Seccion
          title="Visuales del home"
          subtitle="Cambia la imagen principal y la secundaria de la portada."
          open={open.homeVisuales}
          onToggle={() => toggle("homeVisuales")}
          completo={homeVisualesCompleto}
          loading={sectionLoading.homeVisuales}
        >
          <div className="config-home-media-grid">
            <div className="config-subcard config-home-reviews-card-shell">
              <div className="config-subcard-header">
                <h3>Imagen principal</h3>
                <span>Hero</span>
              </div>

              <label className="config-field">
                <span>Subir nueva imagen</span>
                <input
                  ref={fileInputHomePrincipalRef}
                  type="file"
                  accept="image/*"
                  className="form-control"
                  onChange={(event) =>
                    setFileHomePrincipal(event.target.files?.[0] || null)
                  }
                />
              </label>

              <div className="config-home-preview config-home-preview-main">
                {fileHomePrincipalPreview || homeVisuales.imgPrincipalHome ? (
                  <ImageWithLoader
                    src={
                      fileHomePrincipalPreview || homeVisuales.imgPrincipalHome
                    }
                    alt="Preview imagen principal"
                    wrapperClassName="config-home-preview-shell"
                  />
                ) : (
                  <div className="config-prof-preview-empty">Sin imagen</div>
                )}
              </div>
            </div>

            <div className="config-subcard">
              <div className="config-subcard-header">
                <h3>Imagen secundaria</h3>
                <span>Bloque lateral</span>
              </div>

              <label className="config-field">
                <span>Subir nueva imagen</span>
                <input
                  ref={fileInputHomeSecundariaRef}
                  type="file"
                  accept="image/*"
                  className="form-control"
                  onChange={(event) =>
                    setFileHomeSecundaria(event.target.files?.[0] || null)
                  }
                />
              </label>

              <div className="config-home-preview config-home-preview-soft">
                {fileHomeSecundariaPreview || homeVisuales.imgSecundariaHome ? (
                  <ImageWithLoader
                    src={
                      fileHomeSecundariaPreview ||
                      homeVisuales.imgSecundariaHome
                    }
                    alt="Preview imagen secundaria"
                    wrapperClassName="config-home-preview-shell"
                  />
                ) : (
                  <div className="config-prof-preview-empty">Sin imagen</div>
                )}
              </div>
            </div>

            <div className="config-subcard config-home-favicon-card">
              <div className="config-home-favicon-top">
                <div className="config-subcard-header">
                  <h3>Favicon</h3>
                  <span>Pestana del sitio</span>
                </div>
              </div>

              <p className="config-home-favicon-note">
                Usá un icono simple y cuadrado. Acá se muestra como se vería en
                una pestaña del navegador.
              </p>

              <div className="config-home-favicon-layout">
                <label className="config-field config-home-favicon-field">
                  <span>Subir favicon</span>
                  <input
                    ref={fileInputHomeFaviconRef}
                    type="file"
                    accept="image/png,image/x-icon,image/svg+xml,image/jpeg,image/webp"
                    className="form-control"
                    onChange={(event) =>
                      setFileHomeFavicon(event.target.files?.[0] || null)
                    }
                  />
                  <small className="config-field-help">
                    Recomendado: PNG o SVG cuadrado, idealmente 512x512.
                  </small>
                </label>

                <div className="config-home-preview config-home-preview-favicon">
                  {fileHomeFaviconPreview || homeVisuales.faviconUrl ? (
                    <ImageWithLoader
                      src={fileHomeFaviconPreview || homeVisuales.faviconUrl}
                      alt="Preview favicon"
                      wrapperClassName="config-home-preview-shell"
                    />
                  ) : (
                    <div className="config-home-favicon-empty">
                      <div className="config-home-favicon-empty-icon">ICO</div>
                      <strong>Sin favicon cargado</strong>
                      <span>
                        Cuando subas uno, se va a previsualizar aca.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="config-subcard">
              <div className="config-subcard-header">
                <h3>Link de reseñas</h3>
                <span>Google Maps</span>
              </div>

              <label className="config-field">
                <span>Enlace para Mostrar en Google</span>
                <input
                  type="url"
                  className="form-control"
                  placeholder="https://maps.app.goo.gl/..."
                  value={homeVisuales.googleReviewsUrl || ""}
                  onChange={(event) =>
                    setHomeVisuales((prev) => ({
                      ...prev,
                      googleReviewsUrl: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="config-field">
                <span>Google Place ID</span>
                <input
                  type="text"
                  className="form-control"
                  placeholder="ChIJ..."
                  value={homeVisuales.googlePlaceId || ""}
                  onChange={(event) =>
                    setHomeVisuales((prev) => ({
                      ...prev,
                      googlePlaceId: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="config-toggle-line config-toggle-line-card">
                <input
                  type="checkbox"
                  checked={homeVisuales.reviewsEnabled !== false}
                  onChange={(event) =>
                    setHomeVisuales((prev) => ({
                      ...prev,
                      reviewsEnabled: event.target.checked,
                    }))
                  }
                />
                <span>Mostrar bloque de reseñas en el home</span>
              </label>

              <label className="config-field">
                <span>Cantidad de reseñas a mostrar</span>
                <select
                  className="form-control"
                  value={homeVisuales.reviewsDisplayCount || "2"}
                  onChange={(event) =>
                    setHomeVisuales((prev) => ({
                      ...prev,
                      reviewsDisplayCount: event.target.value,
                    }))
                  }
                >
                  <option value="1">1 reseña</option>
                  <option value="2">2 reseñas</option>
                  <option value="3">3 reseñas</option>
                  <option value="4">4 reseñas</option>
                </select>
              </label>

              <small className="config-field-help">
                Si lo completas, las reseñas se sincronizan automáticamente desde Google.
              </small>

              {homeVisuales.googleReviewsUpdatedAt ? (
                <small className="config-field-help">
                  Ultima sincronizacion: {formatConfigDate(homeVisuales.googleReviewsUpdatedAt)}
                </small>
              ) : null}

              {homeVisuales.googleReviewsSyncError ? (
                <small className="config-field-help config-field-help-error">
                  Error de sincronizacion: {homeVisuales.googleReviewsSyncError}
                </small>
              ) : null}

              <div className="config-google-debug">
                <small className="config-field-help">
                  Rating sincronizado: {Number(homeVisuales.googleReviewsRating || 0) || 0}
                </small>
                <small className="config-field-help">
                  Total sincronizado: {Number(homeVisuales.googleReviewsTotal || 0) || 0}
                </small>
                <small className="config-field-help">
                  Reviews sincronizadas: {Array.isArray(homeVisuales.googleReviewsItems) ? homeVisuales.googleReviewsItems.length : 0}
                </small>

                {Array.isArray(homeVisuales.googleReviewsItems) &&
                homeVisuales.googleReviewsItems.length ? (
                  <pre className="config-google-debug-pre">
                    {formatConfigJson(homeVisuales.googleReviewsItems[0])}
                  </pre>
                ) : null}
              </div>
            </div>

            <div className="config-subcard config-home-manual-shell">
              <div className="config-subcard-header">
                <h3>Reseñas manuales</h3>
                <span>Resumen</span>
              </div>

              <div className="config-form-grid config-form-grid-compact">
                <label className="config-field">
                  <span>Puntaje</span>
                  <input
                    type="number"
                    min="0"
                    max="5"
                    step="0.1"
                    className="form-control"
                    placeholder="Ej: 4.9"
                    value={homeVisuales.manualReviewsRating || ""}
                    onChange={(event) =>
                      setHomeVisuales((prev) => ({
                        ...prev,
                        manualReviewsRating: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="config-field">
                  <span>Total de reseñas</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="form-control"
                    placeholder="Ej: 120"
                    value={homeVisuales.manualReviewsTotal || ""}
                    onChange={(event) =>
                      setHomeVisuales((prev) => ({
                        ...prev,
                        manualReviewsTotal: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>

              {normalizeManualReviews(homeVisuales.manualReviewsItems).map(
                (review, index) => (
                  <div
                    key={`manual-review-${index}`}
                    className="config-google-manual-card"
                  >
                    <strong>Reseña {index + 1}</strong>

                    <label className="config-field">
                      <span>Autor</span>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Ej: Maria"
                        value={review.autor}
                        onChange={(event) =>
                          setHomeVisuales((prev) => {
                            const nextItems = normalizeManualReviews(
                              prev.manualReviewsItems,
                            );
                            nextItems[index] = {
                              ...nextItems[index],
                              autor: event.target.value,
                            };
                            return {
                              ...prev,
                              manualReviewsItems: nextItems,
                            };
                          })
                        }
                      />
                    </label>

                    <label className="config-field">
                      <span>Fecha</span>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Ej: Hace 2 semanas"
                        value={review.fecha}
                        onChange={(event) =>
                          setHomeVisuales((prev) => {
                            const nextItems = normalizeManualReviews(
                              prev.manualReviewsItems,
                            );
                            nextItems[index] = {
                              ...nextItems[index],
                              fecha: event.target.value,
                            };
                            return {
                              ...prev,
                              manualReviewsItems: nextItems,
                            };
                          })
                        }
                      />
                    </label>

                    <label className="config-field">
                      <span>Texto</span>
                      <textarea
                        className="form-control"
                        rows="3"
                        placeholder="Escribe la reseña..."
                        value={review.texto}
                        onChange={(event) =>
                          setHomeVisuales((prev) => {
                            const nextItems = normalizeManualReviews(
                              prev.manualReviewsItems,
                            );
                            nextItems[index] = {
                              ...nextItems[index],
                              texto: event.target.value,
                            };
                            return {
                              ...prev,
                              manualReviewsItems: nextItems,
                            };
                          })
                        }
                      />
                    </label>
                  </div>
                ),
              )}
            </div>
          </div>

          <div className="config-actions">
            <button
              className="btn swal-btn-confirm"
              onClick={guardarHomeVisuales}
            >
              Guardar visuales
            </button>
          </div>
        </Seccion>

        <Seccion
          title="Informacion del negocio"
          subtitle="Configura horarios, direccion y mapa del local."
          open={open.ubicacion}
          onToggle={() => toggle("ubicacion")}
          completo={ubicacionCompleta}
          loading={sectionLoading.ubicacion || sectionLoading.horarios}
        >
          <div className="config-business-grid">
            <div className="config-subcard">
              <div className="config-subcard-header">
                <h3>Horarios de atencion</h3>
                <span>{diasAbiertos} dias activos</span>
              </div>

              <div className="config-hours-list">
                {DIAS_SEMANA.map(({ key, label }) => {
                  const data = horarios[key] || {
                    abierto: false,
                    desde: "",
                    hasta: "",
                  };

                  return (
                    <div key={key} className="config-hours-row">
                      <label className="config-hours-day">
                        <input
                          type="checkbox"
                          checked={Boolean(data.abierto)}
                          onChange={(event) =>
                            setHorarios((current) => ({
                              ...current,
                              [key]: {
                                ...data,
                                abierto: event.target.checked,
                              },
                            }))
                          }
                        />
                        <span>{label}</span>
                      </label>

                      <div className="config-hours-inputs">
                        <input
                          type="time"
                          value={data.desde}
                          disabled={!data.abierto}
                          onChange={(event) =>
                            setHorarios((current) => ({
                              ...current,
                              [key]: {
                                ...data,
                                desde: event.target.value,
                              },
                            }))
                          }
                        />
                        <span className="config-hours-separator">a</span>
                        <input
                          type="time"
                          value={data.hasta}
                          disabled={!data.abierto}
                          onChange={(event) =>
                            setHorarios((current) => ({
                              ...current,
                              [key]: {
                                ...data,
                                hasta: event.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="config-actions">
                <button
                  className="btn swal-btn-confirm"
                  onClick={guardarHorarios}
                >
                  Guardar horarios
                </button>
              </div>
            </div>

            <div className="config-subcard">
              <div className="config-subcard-header">
                <h3>Direccion y mapa</h3>
                <span>{ubicacionCompleta ? "Completo" : "Pendiente"}</span>
              </div>

              <div className="config-form-grid config-form-grid-single">
                <label className="config-field">
                  <span>Direccion visible</span>
                  <input
                    className="form-control"
                    placeholder="Ej: Av. Manuel Belgrano 622, Avellaneda"
                    value={ubicacion.mapsDireccion}
                    onChange={(event) =>
                      setUbicacion((current) => ({
                        ...current,
                        mapsDireccion: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="config-field">
                  <span>Google Maps embed URL</span>
                  <input
                    className="form-control"
                    placeholder="https://www.google.com/maps/embed?pb=..."
                    value={ubicacion.mapsEmbedUrl}
                    onChange={(event) =>
                      setUbicacion((current) => ({
                        ...current,
                        mapsEmbedUrl: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="config-field">
                  <span>Link publico de Maps</span>
                  <input
                    className="form-control"
                    placeholder="https://maps.app.goo.gl/..."
                    value={ubicacion.mapsLink}
                    onChange={(event) =>
                      setUbicacion((current) => ({
                        ...current,
                        mapsLink: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>

              {ubicacion.mapsEmbedUrl ? (
                <div className="config-map-preview">
                  <iframe
                    title="Vista previa del mapa"
                    src={ubicacion.mapsEmbedUrl}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              ) : null}

              <div className="config-actions">
                <button
                  className="btn swal-btn-confirm"
                  onClick={guardarUbicacion}
                >
                  Guardar ubicacion
                </button>
              </div>
            </div>
          </div>
        </Seccion>
      </div>
    </div>
  );
}

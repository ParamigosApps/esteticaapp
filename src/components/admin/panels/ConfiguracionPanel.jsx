import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

import { useAuth } from "../../../context/AuthContext.jsx";
import { db, storage } from "../../../Firebase.js";
import { swalError, swalSuccess } from "../../../public/utils/swalUtils.js";
import { hideLoading, showLoading } from "../../../services/loadingService.js";
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

function esUrlValida(value) {
  const text = toStr(value);
  return /^https?:\/\/.+\..+/i.test(text);
}

function esWhatsappValido(value) {
  const text = toStr(value);
  return /^[0-9]{8,15}$/.test(text);
}

function esCbuValido(value) {
  const text = toStr(value);
  return /^[0-9]{22}$/.test(text);
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

async function obtenerDatosBancarios() {
  const snap = await getDoc(doc(db, "configuracion", "datosBancarios"));
  return snap.exists() ? snap.data() : null;
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

function Seccion({
  title,
  subtitle,
  open,
  onToggle,
  completo = null,
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
        <div className="config-section-body-inner">{children}</div>
      </div>
    </section>
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

  const [profesionales, setProfesionales] = useState([]);
  const [nombreProfesional, setNombreProfesional] = useState("");
  const [fileProfesional, setFileProfesional] = useState(null);
  const [homeVisuales, setHomeVisuales] = useState({
    imgPrincipalHome: "",
    imgSecundariaHome: "",
  });
  const [fileHomePrincipal, setFileHomePrincipal] = useState(null);
  const [fileHomeSecundaria, setFileHomeSecundaria] = useState(null);

  const fileInputProfesionalRef = useRef(null);
  const fileInputHomePrincipalRef = useRef(null);
  const fileInputHomeSecundariaRef = useRef(null);

  const [open, setOpen] = useState({
    banco: true,
    redes: false,
    ubicacion: false,
    auth: true,
    empleados: false,
    profesionales: false,
    homeVisuales: false,
  });

  const [datosBanco, setDatosBanco] = useState({
    aliasBanco: "",
    cbuBanco: "",
    nombreBanco: "",
    titularBanco: "",
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

  useEffect(() => {
    return () => {
      if (fileProfesionalPreview) URL.revokeObjectURL(fileProfesionalPreview);
      if (fileHomePrincipalPreview)
        URL.revokeObjectURL(fileHomePrincipalPreview);
      if (fileHomeSecundariaPreview)
        URL.revokeObjectURL(fileHomeSecundariaPreview);
    };
  }, [
    fileProfesionalPreview,
    fileHomePrincipalPreview,
    fileHomeSecundariaPreview,
  ]);

  async function cargarProfesionales() {
    setProfesionales(await obtenerProfesionales());
  }

  useEffect(() => {
    if (loading) return;
    if (!user?.uid) return;
    if (Number(user.nivel) !== 4) return;

    let cancelled = false;

    async function cargarInicial() {
      const [
        authData,
        profesionalesData,
        bancoData,
        redesData,
        ubicacionData,
        horariosData,
        homeVisualesData,
      ] = await Promise.all([
        obtenerAuthConfig(),
        obtenerProfesionales(),
        obtenerDatosBancarios(),
        obtenerRedes(),
        obtenerUbicacion(),
        obtenerHorarios(),
        obtenerHomeVisuales(),
      ]);

      if (cancelled) return;

      setAuthConfig(authData);
      setProfesionales(profesionalesData);
      if (bancoData) setDatosBanco((prev) => ({ ...prev, ...bancoData }));
      if (redesData) setSocial((prev) => ({ ...prev, ...redesData }));
      if (ubicacionData)
        setUbicacion((prev) => ({ ...prev, ...ubicacionData }));
      if (horariosData) {
        setHorarios((prev) => ({
          ...prev,
          ...horariosData,
        }));
      }
      if (homeVisualesData) {
        setHomeVisuales((prev) => ({
          ...prev,
          ...homeVisualesData,
        }));
      }
    }

    void cargarInicial();

    return () => {
      cancelled = true;
    };
  }, [loading, user]);

  if (loading) return null;

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
          activo: true,
          creadoEn: new Date(),
        });

        setNombreProfesional("");
        setFileProfesional(null);

        if (fileInputProfesionalRef.current) {
          fileInputProfesionalRef.current.value = "";
        }

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

  async function guardarBanco() {
    if (!esCbuValido(datosBanco.cbuBanco)) {
      swalError({
        title: "Error",
        text: "CBU invalido. Debe tener 22 digitos.",
      });
      return;
    }

    await runWithLoading(
      () => setDoc(doc(db, "configuracion", "datosBancarios"), datosBanco),
      {
        title: "Guardando datos bancarios",
        text: "Actualizando informacion de cobro...",
      },
    );
    swalSuccess({
      title: "Datos bancarios",
      text: "Actualizados con exito",
    });
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

        const next = {
          imgPrincipalHome,
          imgSecundariaHome,
        };

        await setDoc(doc(db, "configuracion", "homeVisuales"), next);
        setHomeVisuales(next);
        setFileHomePrincipal(null);
        setFileHomeSecundaria(null);

        if (fileInputHomePrincipalRef.current) {
          fileInputHomePrincipalRef.current.value = "";
        }

        if (fileInputHomeSecundariaRef.current) {
          fileInputHomeSecundariaRef.current.value = "";
        }
      },
      {
        title: "Guardando imagenes",
        text: "Subiendo archivos y actualizando el home...",
      },
    );

    swalSuccess({
      title: "Imagenes del home",
      text: "Las imagenes fueron actualizadas correctamente",
    });
  }

  const bancoCompleto =
    Boolean(datosBanco.aliasBanco) &&
    esCbuValido(datosBanco.cbuBanco) &&
    Boolean(datosBanco.titularBanco) &&
    Boolean(datosBanco.nombreBanco);

  const redesCompletas = Object.entries(social).every(([key, value]) => {
    if (!value) return true;
    if (key === "whatsappContacto") return esWhatsappValido(value);
    return esUrlValida(value);
  });

  const ubicacionCompleta = Boolean(
    ubicacion.mapsEmbedUrl && ubicacion.mapsDireccion,
  );
  const metodosActivos = Object.values(authConfig).filter(Boolean).length;
  const redesCargadas = Object.values(social).filter((value) =>
    toStr(value),
  ).length;
  const diasAbiertos = Object.values(horarios).filter(
    (dia) => dia?.abierto,
  ).length;
  const homeVisualesCompleto = Boolean(
    homeVisuales.imgPrincipalHome && homeVisuales.imgSecundariaHome,
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
            <strong>{metodosActivos}</strong>
          </article>
          <article className="config-summary-card">
            <span className="config-summary-label">Profesionales</span>
            <strong>{profesionales.length}</strong>
          </article>
          <article className="config-summary-card">
            <span className="config-summary-label">Redes cargadas</span>
            <strong>{redesCargadas}</strong>
          </article>
          <article className="config-summary-card">
            <span className="config-summary-label">Dias abiertos</span>
            <strong>{diasAbiertos}</strong>
          </article>
        </div>
      </section>

      <div className="config-admin-sections">
        <Seccion
          title="Metodos de inicio de sesion"
          subtitle="Define que accesos pueden usar los clientes."
          open={open.auth}
          onToggle={() => toggle("auth")}
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
          title="Datos bancarios"
          subtitle="Cuenta visible para transferencias y pagos manuales."
          open={open.banco}
          onToggle={() => toggle("banco")}
          completo={bancoCompleto}
        >
          <div className="config-form-grid">
            {[
              ["cbuBanco", "CBU (22 digitos)"],
              ["aliasBanco", "Alias"],
              ["titularBanco", "Titular"],
              ["nombreBanco", "Banco"],
            ].map(([key, label]) => (
              <label key={key} className="config-field">
                <span>{label}</span>
                <input
                  className="form-control"
                  placeholder={label}
                  value={datosBanco[key] || ""}
                  onChange={(event) =>
                    setDatosBanco((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}
          </div>

          <div className="config-actions">
            <button className="btn swal-btn-confirm" onClick={guardarBanco}>
              Guardar datos
            </button>
          </div>
        </Seccion>

        <Seccion
          title="Redes sociales"
          subtitle="Canales de contacto y presencia online del negocio."
          open={open.redes}
          onToggle={() => toggle("redes")}
          completo={redesCompletas}
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
        >
          <EmpleadosPanel />
        </Seccion>

        <Seccion
          title="Profesionales"
          subtitle="Gestiona el equipo que se muestra en el panel y en la web."
          open={open.profesionales}
          onToggle={() => toggle("profesionales")}
        >
          <div className="config-prof-layout">
            <div className="config-prof-form">
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

              <div className="config-prof-preview">
                {fileProfesionalPreview ? (
                  <img src={fileProfesionalPreview} alt="Preview profesional" />
                ) : (
                  <div className="config-prof-preview-empty">Sin imagen</div>
                )}
              </div>
            </div>

            <div className="config-actions config-actions-inline">
              <button
                className="btn swal-btn-confirm"
                onClick={agregarProfesional}
              >
                Agregar profesional
              </button>
            </div>
          </div>

          <div className="config-prof-grid">
            {profesionales.length ? (
              profesionales.map((profesional) => (
                <article key={profesional.id} className="config-prof-card">
                  {profesional.imgProfesional ? (
                    <img
                      src={profesional.imgProfesional}
                      alt={profesional.nombreProfesional}
                      className="config-prof-card-image"
                    />
                  ) : (
                    <div className="config-prof-card-placeholder">
                      {profesional.nombreProfesional
                        ?.slice(0, 1)
                        ?.toUpperCase() || "P"}
                    </div>
                  )}

                  <strong>{profesional.nombreProfesional}</strong>

                  <button
                    className="swal-btn-eliminar"
                    onClick={() => eliminarProfesional(profesional.id)}
                  >
                    Eliminar
                  </button>
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
        >
          <div className="config-home-media-grid">
            <div className="config-subcard">
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

              <div className="config-home-preview">
                {fileHomePrincipalPreview || homeVisuales.imgPrincipalHome ? (
                  <img
                    src={
                      fileHomePrincipalPreview || homeVisuales.imgPrincipalHome
                    }
                    alt="Preview imagen principal"
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
                  <img
                    src={
                      fileHomeSecundariaPreview ||
                      homeVisuales.imgSecundariaHome
                    }
                    alt="Preview imagen secundaria"
                  />
                ) : (
                  <div className="config-prof-preview-empty">Sin imagen</div>
                )}
              </div>
            </div>
          </div>

          <div className="config-actions">
            <button
              className="btn swal-btn-confirm"
              onClick={guardarHomeVisuales}
            >
              Guardar imagenes
            </button>
          </div>
        </Seccion>

        <Seccion
          title="Informacion del negocio"
          subtitle="Configura horarios, direccion y mapa del local."
          open={open.ubicacion}
          onToggle={() => toggle("ubicacion")}
          completo={ubicacionCompleta}
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

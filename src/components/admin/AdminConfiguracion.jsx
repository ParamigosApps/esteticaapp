import { useAuth } from "../../context/AuthContext";

import { useEffect, useState } from "react";
import { db } from "../../Firebase.js";
import { doc, getDoc, setDoc } from "firebase/firestore";

import { swalSuccess, swalError } from "../../utils/swalUtils.js";
// ============================================================
// HELPERS VALIDACIÓN
// ============================================================
const toStr = (v) => (typeof v === "string" ? v.trim() : "");

const esUrlValida = (v) => {
  const s = toStr(v);
  if (!s) return false;
  return /^https?:\/\/.+\..+/i.test(s);
};

const esWhatsappValido = (v) => {
  const s = toStr(v);
  if (!s) return false;
  return /^[0-9]{8,15}$/.test(s);
};

const esCbuValido = (v) => {
  const s = toStr(v);
  if (!s) return false;
  return /^[0-9]{22}$/.test(s);
};

// ============================================================
// COMPONENTE SECCIÓN (ACORDEÓN)
// ============================================================
function Seccion({ title, open, onToggle, completo = null, children }) {
  return (
    <div className={`seccion-card ${open ? "open" : ""}`}>
      <div
        className="seccion-header"
        onClick={onToggle}
        role="button"
        aria-expanded={open}
      >
        <div className="seccion-title">{title}</div>
        {completo !== null && (
          <div className={`seccion-status ${completo ? "ok" : "pending"}`}>
            <span className="status-dot" />
            <span className="status-text">
              {completo ? "Completo" : "Incompleto"}
            </span>
            <span className="chevron">{open ? "▾" : "▸"}</span>
          </div>
        )}
      </div>

      <div
        className="seccion-body"
        style={{
          maxHeight: open ? "1200px" : "0",
          opacity: open ? 1 : 0,
        }}
      >
        <div className="seccion-body-inner">{children}</div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN
// ============================================================
export default function AdminConfiguracion() {
  const { user, loading } = useAuth();

  const [open, setOpen] = useState({
    banco: false,
    redes: false,
    ubicacion: false,
    auth: false,
  });

  const toggle = (key) => setOpen((o) => ({ ...o, [key]: !o[key] }));

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
    mapsEmbedUrl: "",
    mapsLink: "",
  });

  const [authConfig, setAuthConfig] = useState({
    google: true,
    email: true,
    phone: false,
    facebook: false,
  });

  if (loading) return null;
  if (!user || Number(user.nivel) !== 4) {
    return (
      <div className="alert alert-danger">
        ⛔ Solo el dueño puede acceder a la configuración del sistema.
      </div>
    );
  }

  async function cargarAuthConfig() {
    const ref = doc(db, "configuracion", "auth");
    const snap = await getDoc(ref);

    if (snap.exists()) {
      setAuthConfig(snap.data());
    } else {
      const base = {
        google: true,
        email: true,
        phone: false,
        facebook: false,
      };
      await setDoc(ref, base);
      setAuthConfig(base);
    }
  }

  async function cargarDatosBancarios() {
    const snap = await getDoc(doc(db, "configuracion", "datosBancarios"));
    if (snap.exists()) setDatosBanco(snap.data());
  }

  async function cargarRedes() {
    const snap = await getDoc(doc(db, "configuracion", "social"));
    if (snap.exists()) setSocial(snap.data());
  }

  async function cargarUbicacion() {
    const snap = await getDoc(doc(db, "configuracion", "ubicacion"));
    if (snap.exists()) setUbicacion(snap.data());
  }

  // ============================================================
  // CARGA INICIAL
  // ============================================================
  useEffect(() => {
    if (loading) return;
    if (!user?.uid) return;
    if (Number(user.nivel) !== 4) return;

    cargarAuthConfig();
    cargarDatosBancarios();
    cargarRedes();
    cargarUbicacion();
  }, [loading, user]);

  // ============================================================
  // GUARDAR
  // ============================================================
  async function guardarAuthConfig() {
    await setDoc(doc(db, "configuracion", "auth"), authConfig);

    swalSuccess({
      title: "Métodos de inicio de sesión",
      text: "Configuración actualizada correctamente",
    });
  }

  async function guardarBanco() {
    if (!esCbuValido(datosBanco.cbuBanco)) {
      swalError({
        title: "Error",
        text: "CBU inválido (22 dígitos)",
      });
      return;
    }

    await setDoc(doc(db, "configuracion", "datosBancarios"), datosBanco);
    swalSuccess({
      title: "Datos bancarios",
      text: "Actualizados con exito",
    });
  }

  async function guardarRedes() {
    await setDoc(doc(db, "configuracion", "social"), social);

    swalSuccess({
      title: "Redes sociales",
      text: "Actualizadas con exito",
    });
  }

  async function guardarUbicacion() {
    if (!ubicacion.mapsEmbedUrl) {
      swalError({
        title: "Error",
        text: "El link EMBED de Google Maps es obligatorio",
      });
      return;
    }

    await setDoc(doc(db, "configuracion", "ubicacion"), ubicacion);

    swalSuccess({
      title: "Ubicación",
      text: "Mapa actualizado correctamente",
    });
  }

  // ============================================================
  // INDICADORES
  // ============================================================
  const bancoCompleto =
    datosBanco.aliasBanco &&
    esCbuValido(datosBanco.cbuBanco) &&
    datosBanco.titularBanco &&
    datosBanco.nombreBanco;

  const redesCompletas = Object.entries(social).every(([k, v]) => {
    if (!v) return true;
    if (k === "whatsappContacto") return esWhatsappValido(v);
    return esUrlValida(v);
  });
  const ubicacionCompleta = !!ubicacion.mapsEmbedUrl;

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="container py-4">
      <h2 className="fw-bold mb-4">Configuración del sistema</h2>

      {/*METODOS INICIO DE SESIÓN*/}
      <Seccion
        title="Métodos de inicio de sesión"
        open={open.auth}
        onToggle={() => toggle("auth")}
      >
        <p className="text-muted mb-3" style={{ fontSize: 13 }}>
          Definí qué métodos pueden usar los clientes para iniciar sesión.
          <br />
          Se recomienda mantener Google y correo electrónico habilitados.
        </p>

        {[
          ["google", "Google"],
          ["email", "Correo electrónico"],
          ["phone", "Teléfono (SMS)"],
          ["facebook", "Facebook"],
        ].map(([key, label]) => (
          <div key={key} className="form-check mb-2">
            <input
              className="form-check-input"
              type="checkbox"
              checked={authConfig[key]}
              onChange={(e) =>
                setAuthConfig({
                  ...authConfig,
                  [key]: e.target.checked,
                })
              }
              disabled={key === "google" || key === "email"}
            />
            <label className="form-check-label">
              {label}
              {(key === "google" || key === "email") && (
                <span className="badge bg-success ms-2">Obligatorio</span>
              )}
            </label>
          </div>
        ))}

        <div className="form-divider my-3" />

        <div className="d-flex justify-content-center">
          <button className="btn swal-btn-confirm" onClick={guardarAuthConfig}>
            Guardar configuración
          </button>
        </div>
      </Seccion>

      {/*DATOS BANCARIOS*/}
      <Seccion
        title="Datos bancarios"
        open={open.banco}
        onToggle={() => toggle("banco")}
        completo={bancoCompleto}
      >
        {[
          ["cbuBanco", "CBU (22 dígitos)"],
          ["aliasBanco", "Alias"],
          ["titularBanco", "Titular"],
          ["nombreBanco", "Banco"],
        ].map(([k, label]) => (
          <input
            key={k}
            className="form-control mb-2"
            placeholder={label}
            value={datosBanco[k] || ""}
            onChange={(e) =>
              setDatosBanco({ ...datosBanco, [k]: e.target.value })
            }
          />
        ))}
        {/* SUBMIT */}
        <div className="form-divider my-3" />
        <div className="mt-1 d-flex justify-content-center">
          <button className="btn swal-btn-confirm " onClick={guardarBanco}>
            Guardar datos
          </button>
        </div>
      </Seccion>
      {/*REDES SOCIALES*/}
      <Seccion
        title="Redes sociales"
        open={open.redes}
        onToggle={() => toggle("redes")}
        completo={redesCompletas}
      >
        {[
          ["instagramContacto", "Instagram (URL)"],
          ["tiktokContacto", "TikTok (URL)"],
          ["facebookContacto", "Facebook (URL)"],
          ["xContacto", "X / Twitter (URL)"],
          ["webContacto", "Web (URL)"],
          ["whatsappContacto", "WhatsApp (solo números)"],
        ].map(([k, label]) => (
          <input
            key={k}
            className="form-control mb-2"
            placeholder={label}
            value={social[k] || ""}
            onChange={(e) => setSocial({ ...social, [k]: e.target.value })}
          />
        ))}
        {/* SUBMIT */}
        <div className="form-divider my-3" />
        <div className="mt-1 d-flex justify-content-center">
          <button className="btn swal-btn-confirm" onClick={guardarRedes}>
            Guardar datos
          </button>
        </div>
      </Seccion>
      {/* ===================================================== */}
      <Seccion
        title="Ubicación (Google Maps)"
        open={open.ubicacion}
        onToggle={() => toggle("ubicacion")}
        completo={ubicacionCompleta}
      >
        <input
          className="form-control mb-2"
          placeholder="EMBED URL - EJ: https://www.google.com/maps/embed?pb=!1..."
          value={ubicacion.mapsEmbedUrl}
          onChange={(e) =>
            setUbicacion({ ...ubicacion, mapsEmbedUrl: e.target.value })
          }
        />

        <input
          className="form-control mb-2"
          placeholder="LINK A MAPS - EJ: https://maps.app.goo.gl/4Lzckp6NUrDuo6..."
          value={ubicacion.mapsLink}
          onChange={(e) =>
            setUbicacion({ ...ubicacion, mapsLink: e.target.value })
          }
        />

        <div className="form-divider my-3" />
        <div className="mt-1 d-flex justify-content-center">
          <button className="btn swal-btn-confirm" onClick={guardarUbicacion}>
            Guardar ubicación
          </button>
        </div>
      </Seccion>
    </div>
  );
}

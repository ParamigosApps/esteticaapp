import { useAuth } from "../../../context/AuthContext.jsx";

import { useEffect, useRef, useState } from "react";
import { db, storage } from "../../../Firebase.js";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  deleteDoc,
  getDocs,
} from "firebase/firestore";

import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

import { swalSuccess, swalError } from "../../../public/utils/swalUtils.js";
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

  const [profesionales, setProfesionales] = useState([]);
  const [nombreProfesional, setNombreProfesional] = useState("");

  const [fileProfesional, setFileProfesional] = useState(null);
  const fileInputProfesionalRef = useRef(null);

  const [open, setOpen] = useState({
    banco: false,
    redes: false,
    ubicacion: false,
    auth: false,
    profesionales: false,
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
    mapsDireccion: "",
    mapsEmbedUrl: "",
    mapsLink: "",

    horarios: {
      lunes: { abierto: false, desde: "", hasta: "" },
      martes: { abierto: false, desde: "", hasta: "" },
      miercoles: { abierto: false, desde: "", hasta: "" },
      jueves: { abierto: false, desde: "", hasta: "" },
      viernes: { abierto: false, desde: "", hasta: "" },
      sabado: { abierto: false, desde: "", hasta: "" },
      domingo: { abierto: false, desde: "", hasta: "" },
    },
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

  async function cargarProfesionales() {
    const snap = await getDocs(collection(db, "profesionales"));
    setProfesionales(
      snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })),
    );
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

    if (!snap.exists()) return;

    const data = snap.data();

    setUbicacion((prev) => ({
      ...prev,
      ...data,
      horarios: {
        ...prev.horarios,
        ...(data.horarios || {}),
      },
    }));
  }

  // ============================================================
  // CARGA INICIAL
  // ============================================================
  useEffect(() => {
    if (loading) return;
    if (!user?.uid) return;
    if (Number(user.nivel) !== 4) return;

    cargarAuthConfig();
    cargarProfesionales();
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

  async function agregarProfesional() {
    if (!nombreProfesional.trim()) {
      swalError({
        title: "Error",
        text: "El nombre es obligatorio",
      });
      return;
    }

    let urlImagen = "";

    if (fileProfesional) {
      const nombreArchivo = Date.now() + "_" + fileProfesional.name;

      const storageRef = ref(storage, "profesionales/" + nombreArchivo);

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

    cargarProfesionales();

    swalSuccess({
      title: "Profesional agregado",
    });
  }

  async function eliminarProfesional(id) {
    await deleteDoc(doc(db, "profesionales", id));
    cargarProfesionales();
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

    if (!ubicacion.mapsDireccion) {
      swalError({
        title: "Error",
        text: "Completa la dirección de tu local.",
      });
      return;
    }
    await setDoc(doc(db, "configuracion", "ubicacion"), ubicacion);

    swalSuccess({
      title: "Ubicación",
      text: "Datos actualizado correctamente",
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

      <Seccion
        title="Profesionales"
        open={open.profesionales}
        onToggle={() => toggle("profesionales")}
      >
        <div className="admin-row mb-3">
          <input
            className="form-control"
            placeholder="Nombre profesional"
            value={nombreProfesional}
            onChange={(e) => setNombreProfesional(e.target.value)}
          />

          <input
            ref={fileInputProfesionalRef}
            type="file"
            accept="image/*"
            className="form-control"
            onChange={(e) => setFileProfesional(e.target.files[0] || null)}
          />

          {fileProfesional && (
            <img
              src={URL.createObjectURL(fileProfesional)}
              alt="Preview profesional"
              style={{
                width: 60,
                height: 60,
                borderRadius: "50%",
                objectFit: "cover",
                marginTop: 8,
              }}
            />
          )}
          <button className="btn swal-btn-confirm" onClick={agregarProfesional}>
            Agregar
          </button>
        </div>

        <div className="prof-admin-grid">
          {profesionales.map((p) => (
            <div key={p.id} className="prof-admin-card">
              {p.imgProfesional ? (
                <img src={p.imgProfesional} alt={p.nombreProfesional} />
              ) : null}

              <div>{p.nombreProfesional}</div>

              <button
                className="swal-btn-eliminar"
                onClick={() => eliminarProfesional(p.id)}
              >
                X
              </button>
            </div>
          ))}
        </div>
      </Seccion>

      {/* ===================================================== */}
      <Seccion
        title="Información del negocio"
        open={open.ubicacion}
        onToggle={() => toggle("ubicacion")}
        completo={ubicacionCompleta}
      >
        <div className="form-divider my-3" />

        <h6 className="mb-3">Horarios de atención</h6>

        {Object.entries(ubicacion.horarios || {}).map(([dia, data]) => (
          <div key={dia} className="d-flex align-items-center mb-2 gap-2">
            <div style={{ width: 90, textTransform: "capitalize" }}>{dia}</div>

            <input
              type="checkbox"
              checked={data.abierto}
              onChange={(e) =>
                setUbicacion({
                  ...ubicacion,
                  horarios: {
                    ...ubicacion.horarios,
                    [dia]: {
                      ...data,
                      abierto: e.target.checked,
                    },
                  },
                })
              }
            />

            <input
              type="time"
              disabled={!data.abierto}
              value={data.desde}
              onChange={(e) =>
                setUbicacion({
                  ...ubicacion,
                  horarios: {
                    ...ubicacion.horarios,
                    [dia]: {
                      ...data,
                      desde: e.target.value,
                    },
                  },
                })
              }
            />

            <span>a</span>

            <input
              type="time"
              disabled={!data.abierto}
              value={data.hasta}
              onChange={(e) =>
                setUbicacion({
                  ...ubicacion,
                  horarios: {
                    ...ubicacion.horarios,
                    [dia]: {
                      ...data,
                      hasta: e.target.value,
                    },
                  },
                })
              }
            />
          </div>
        ))}

        <h6 className="mb-3 mt-5">Dirección y mapa</h6>
        <input
          className="form-control mb-2"
          placeholder="EJ: Av. Manuel Belgrano 622, Avellaneda."
          value={ubicacion.mapsDireccion}
          onChange={(e) =>
            setUbicacion({ ...ubicacion, mapsDireccion: e.target.value })
          }
        />
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

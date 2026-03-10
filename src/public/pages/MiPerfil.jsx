// src/pages/MiPerfil.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { db } from "../../Firebase";
import { useAuth } from "../../context/AuthContext";

import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import Swal from "sweetalert2";

// Si ya tenés swalSuccess/swalError y querés usarlos, reemplazá los Swal.fire por tus helpers.

const toStr = (v) => (typeof v === "string" ? v.trim() : "");

const esTelValido = (v) => {
  const s = toStr(v);
  if (!s) return false;
  // Acepta números, espacios, +, guiones (simple y tolerante)
  return /^[0-9+\-\s]{8,20}$/.test(s);
};

export default function MiPerfil() {
  const { user, loading, logout } = useAuth(); // asumo que tu AuthContext expone logout()

  const [perfil, setPerfil] = useState({
    nombre: "",
    telefono: "",
    email: "",
    creadoEn: null,
    updatedAt: null,
  });

  const [social, setSocial] = useState(null);

  const [edit, setEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingPerfil, setLoadingPerfil] = useState(true);

  // ---- cargar perfil (clientes/{uid}) ----
  useEffect(() => {
    async function cargar() {
      if (!user?.uid) return;

      setLoadingPerfil(true);

      const ref = doc(db, "usuarios", user.uid);
      const snap = await getDoc(ref);

      // email lo tomamos siempre del auth si existe
      const emailAuth = toStr(user.email);

      if (snap.exists()) {
        const data = snap.data() || {};
        setPerfil({
          nombre: toStr(data.nombre) || toStr(user.displayName) || "",
          telefono: toStr(data.telefono) || toStr(user.phoneNumber) || "",
          email: emailAuth || toStr(data.email) || "",
          creadoEn: data.creadoEn || null,
          updatedAt: data.updatedAt || null,
        });
      } else {
        // crear base mínima
        const base = {
          nombre: toStr(user.displayName) || "",
          telefono: toStr(user.phoneNumber) || "",
          email: emailAuth || "",
          creadoEn: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        await setDoc(ref, base, { merge: true });

        setPerfil({
          nombre: base.nombre,
          telefono: base.telefono,
          email: base.email,
          creadoEn: null,
          updatedAt: null,
        });
      }

      setLoadingPerfil(false);
    }

    if (!loading) cargar();
  }, [loading, user?.uid]);

  // ---- cargar whatsapp negocio (configuracion/social) ----
  useEffect(() => {
    async function cargarSocial() {
      const snap = await getDoc(doc(db, "configuracion", "social"));
      if (snap.exists()) setSocial(snap.data());
    }
    cargarSocial();
  }, []);

  async function guardar() {
    if (!user?.uid) return;

    const nombre = toStr(perfil.nombre);
    const telefono = toStr(perfil.telefono);

    if (!nombre) {
      Swal.fire({
        icon: "error",
        title: "Nombre requerido",
        text: "Completá tu nombre para guardar el perfil.",
        confirmButtonText: "Ok",
        customClass: { confirmButton: "swal-btn-confirm" },
      });
      return;
    }

    if (telefono && !esTelValido(telefono)) {
      Swal.fire({
        icon: "error",
        title: "Teléfono inválido",
        text: "Usá un teléfono válido (solo números / + / espacios).",
        confirmButtonText: "Ok",
        customClass: { confirmButton: "swal-btn-confirm" },
      });
      return;
    }

    setSaving(true);

    await setDoc(
      doc(db, "usuarios", user.uid),
      {
        nombre,
        telefono,
        email: toStr(perfil.email) || toStr(user.email) || "",
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    setSaving(false);
    setEdit(false);

    Swal.fire({
      icon: "success",
      title: "Perfil actualizado",
      text: "Tus datos se guardaron correctamente.",
      confirmButtonText: "Genial",
      customClass: { confirmButton: "swal-btn-confirm" },
    });
  }

  async function salir() {
    const res = await Swal.fire({
      icon: "question",
      title: "Cerrar sesión",
      text: "¿Querés salir de tu cuenta?",
      showCancelButton: true,
      confirmButtonText: "Sí, salir",
      cancelButtonText: "Cancelar",
      customClass: {
        confirmButton: "swal-btn-confirm",
        cancelButton: "swal-btn-cancel",
      },
    });

    if (!res.isConfirmed) return;

    try {
      await logout?.();
    } catch (e) {
      console.error(e);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "No se pudo cerrar sesión.",
        confirmButtonText: "Ok",
        customClass: { confirmButton: "swal-btn-confirm" },
      });
    }
  }

  if (loading) return null;

  if (!user?.uid) {
    return (
      <div className="container py-4">
        <h4>Mi perfil</h4>
        <p className="text-muted">Iniciá sesión para ver tu perfil.</p>
      </div>
    );
  }

  if (loadingPerfil) {
    return (
      <div className="container py-4">
        <h4>Mi perfil</h4>
        <p>Cargando...</p>
      </div>
    );
  }

  const whatsappNro = toStr(social?.whatsappContacto);

  return (
    <div className="container py-4" style={{ maxWidth: 720 }}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="mb-0">Mi perfil</h4>

        {!edit ? (
          <button
            className="btn btn-outline-secondary btn-sm"
            onClick={() => setEdit(true)}
          >
            Editar
          </button>
        ) : (
          <div className="d-flex gap-2">
            <button
              className="btn btn-outline-secondary btn-sm"
              onClick={() => setEdit(false)}
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              className="btn swal-btn-confirm btn-sm"
              onClick={guardar}
              disabled={saving}
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        )}
      </div>

      {/* Tarjeta perfil */}
      <div className="card mb-3">
        <div className="card-body">
          <label className="text-muted" style={{ fontSize: 13 }}>
            Nombre
          </label>
          <input
            className="form-control mb-3"
            value={perfil.nombre}
            disabled={!edit}
            onChange={(e) => setPerfil({ ...perfil, nombre: e.target.value })}
            placeholder="Tu nombre"
          />

          <label className="text-muted" style={{ fontSize: 13 }}>
            Teléfono
          </label>
          <input
            className="form-control mb-3"
            value={perfil.telefono}
            disabled={!edit}
            onChange={(e) => setPerfil({ ...perfil, telefono: e.target.value })}
            placeholder="Ej: +54 9 11 1234-5678"
          />

          <label className="text-muted" style={{ fontSize: 13 }}>
            Email
          </label>
          <input
            className="form-control"
            value={perfil.email}
            disabled
            placeholder="Email"
          />

          <div className="text-muted mt-3" style={{ fontSize: 12 }}>
            Para cambiar el email, tenés que hacerlo desde el método de inicio
            de sesión.
          </div>
        </div>
      </div>

      {/* Acciones rápidas */}
      <div className="card mb-3">
        <div className="card-body d-flex flex-wrap gap-2">
          <Link to="/mis-turnos" className="btn btn-outline-secondary">
            Ver mis turnos
          </Link>

          {whatsappNro && (
            <a
              className="btn btn-outline-success"
              href={`https://wa.me/54${whatsappNro}`}
              target="_blank"
              rel="noreferrer"
            >
              Contactar por WhatsApp
            </a>
          )}

          <button className="btn btn-outline-danger ms-auto" onClick={salir}>
            Cerrar sesión
          </button>
        </div>
      </div>

      {/* Sugerencia tipo “app estética” */}
      <div className="text-muted" style={{ fontSize: 13 }}>
        Tip: revisá “Mis turnos” para confirmar fecha y hora antes de asistir.
      </div>
    </div>
  );
}

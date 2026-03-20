import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { db } from "../../Firebase";
import { useAuth } from "../../context/AuthContext";

import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import Swal from "sweetalert2";

const toStr = (v) => (typeof v === "string" ? v.trim() : "");

const esTelValido = (v) => {
  const s = toStr(v);
  if (!s) return false;
  return /^[0-9+\-\s]{8,20}$/.test(s);
};

export default function MiPerfil() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();

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

  useEffect(() => {
    async function cargar() {
      if (!user?.uid) return;

      setLoadingPerfil(true);

      const ref = doc(db, "usuarios", user.uid);
      const snap = await getDoc(ref);
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

    if (!loading) void cargar();
  }, [loading, user?.uid, user?.displayName, user?.phoneNumber, user?.email]);

  useEffect(() => {
    async function cargarSocial() {
      const snap = await getDoc(doc(db, "configuracion", "social"));
      if (snap.exists()) setSocial(snap.data());
    }

    void cargarSocial();
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
        title: "Telefono invalido",
        text: "Usa un telefono valido (solo numeros, +, espacios o guiones).",
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
      title: "Cerrar sesion",
      text: "¿Querés salir de tu cuenta?",
      showCancelButton: true,
      confirmButtonText: "Si, salir",
      cancelButtonText: "Cancelar",
      reverseButtons: true,
      customClass: {
        confirmButton: "swal-btn-confirm",
        cancelButton: "swal-btn-cancel",
      },
    });

    if (!res.isConfirmed) return;

    try {
      await logout?.();
      navigate("/");
    } catch (e) {
      console.error(e);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "No se pudo cerrar sesion.",
        confirmButtonText: "Ok",
        customClass: { confirmButton: "swal-btn-confirm" },
      });
    }
  }

  if (loading || loadingPerfil) {
    return (
      <div className="account-shell container py-4">
        <div className="profile-loading-shell" role="status" aria-live="polite">
          <span
            className="spinner-border profile-loading-spinner"
            aria-hidden="true"
          />
          <p className="profile-loading-text">Cargando tu perfil...</p>
        </div>
      </div>
    );
  }

  if (!user?.uid) {
    return (
      <div className="container py-4">
        <h4>Mi perfil</h4>
        <p className="text-muted">Iniciá sesión para ver tu perfil.</p>
      </div>
    );
  }

  const whatsappNro = toStr(social?.whatsappContacto);
  const inicialNombre = toStr(perfil.nombre || user?.displayName || user?.email)
    .slice(0, 1)
    .toUpperCase();

  return (
    <div className="account-shell container py-4">
      <section className="profile-hero">
        <div className="profile-hero-main">
          <div className="profile-avatar" aria-hidden="true">
            {inicialNombre || "U"}
          </div>

          <div className="profile-hero-copy">
            <p className="profile-eyebrow">Area personal</p>
            <h1 className="profile-title">Mi perfil</h1>
            <p className="profile-subtitle">
              Mantené tus datos actualizados y gestioná tu cuenta desde una
              vista más clara.
            </p>
          </div>
        </div>

        <div className="profile-hero-actions">
          {!edit ? (
            <button
              className="btn profile-btn-secondary"
              onClick={() => setEdit(true)}
            >
              Editar perfil
            </button>
          ) : (
            <>
              <button
                className="btn profile-btn-secondary"
                onClick={() => setEdit(false)}
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                className="btn swal-btn-confirm profile-btn-primary"
                onClick={guardar}
                disabled={saving}
              >
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
            </>
          )}
        </div>
      </section>

      <section className="profile-grid">
        <article className="profile-card profile-card-main">
          <div className="profile-card-head">
            <div>
              <p className="profile-card-kicker">Datos personales</p>
              <h2>Informacion de contacto</h2>
            </div>
            <span className={`profile-status-pill ${edit ? "editing" : ""}`}>
              {edit ? "Modo edicion" : "Perfil activo"}
            </span>
          </div>

          <div className="profile-form-grid">
            <label className="profile-field">
              <span>Nombre</span>
              <input
                className="form-control"
                value={perfil.nombre}
                disabled={!edit}
                onChange={(e) =>
                  setPerfil({ ...perfil, nombre: e.target.value })
                }
                placeholder="Tu nombre"
              />
            </label>

            <label className="profile-field">
              <span>Telefono</span>
              <input
                className="form-control"
                value={perfil.telefono}
                disabled={!edit}
                onChange={(e) =>
                  setPerfil({ ...perfil, telefono: e.target.value })
                }
                placeholder="Ej: +54 9 11 1234-5678"
              />
            </label>

            <label className="profile-field profile-field-full">
              <span>Email</span>
              <input
                className="form-control"
                value={perfil.email}
                disabled
                placeholder="Email"
              />
            </label>
          </div>

          <div className="profile-help-text">
            Para cambiar el email, hacelo desde el método de inicio de sesión
            asociado a tu cuenta.
          </div>
        </article>

        <aside className="profile-side">
          <article className="profile-card">
            <div className="profile-card-head">
              <div>
                <p className="profile-card-kicker">Accesos</p>
                <h2>Acciones rapidas</h2>
              </div>
            </div>

            <div className="profile-action-list">
              <Link to="/mis-turnos" className="btn profile-action-btn">
                Ver mis turnos
              </Link>

              {whatsappNro && (
                <a
                  className="btn profile-action-btn profile-action-btn-whatsapp"
                  href={`https://wa.me/54${whatsappNro}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Contactar por WhatsApp
                </a>
              )}

              <button
                className="btn profile-action-btn profile-action-btn-danger"
                onClick={salir}
              >
                Cerrar sesion
              </button>
            </div>
          </article>

          <article className="profile-card profile-tip-card">
            <p className="profile-card-kicker">Tip</p>
            <p className="profile-tip-text">
              Revisá tus turnos antes de asistir para confirmar fecha, horario y
              estado del pago.
            </p>
          </article>
        </aside>
      </section>
    </div>
  );
}

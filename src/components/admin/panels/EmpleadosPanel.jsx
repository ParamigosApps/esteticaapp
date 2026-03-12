import { useCallback, useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "../../../Firebase.js";
import { useAuth } from "../../../context/AuthContext.jsx";
import {
  swalConfirmDanger,
  swalError,
  swalInfo,
  swalSuccess,
} from "../../../public/utils/swalUtils.js";
import { hideLoading, showLoading } from "../../../services/loadingService.js";

const ROLES = {
  1: {
    label: "Nivel 1 - Profesional",
    desc: "Acceso al panel profesional y a sus servicios vinculados.",
  },
  2: {
    label: "Nivel 2 - Caja",
    desc: "Gestion operativa y cobros.",
  },
  3: {
    label: "Nivel 3 - Admin",
    desc: "Acceso a todos los turnos e historiales.",
  },
  4: {
    label: "Nivel 4 - Dueño",
    desc: "Acceso total al sistema.",
  },
};

const crearEmpleadoAdmin = httpsCallable(functions, "crearEmpleadoAdmin");
const actualizarEmpleadoAdmin = httpsCallable(
  functions,
  "actualizarEmpleadoAdmin",
);
const quitarEmpleadoAdmin = httpsCallable(functions, "quitarEmpleadoAdmin");
const listarInvitacionesEmpleadoAdmin = httpsCallable(
  functions,
  "listarInvitacionesEmpleadoAdmin",
);
const eliminarInvitacionEmpleadoAdmin = httpsCallable(
  functions,
  "eliminarInvitacionEmpleadoAdmin",
);

function normalizarEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export default function EmpleadosPanel() {
  const { user, loading } = useAuth();
  const nivelActual = Number(user?.nivel || 0);

  const [empleados, setEmpleados] = useState([]);
  const [invitados, setInvitados] = useState([]);
  const [modo, setModo] = useState("crear");
  const [editId, setEditId] = useState("");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [nivel, setNivel] = useState("");
  const [errores, setErrores] = useState({});

  const cargarInvitaciones = useCallback(async () => {
    if (!user?.uid || nivelActual !== 4) {
      setInvitados([]);
      return;
    }

    try {
      const result = await listarInvitacionesEmpleadoAdmin();
      setInvitados(
        Array.isArray(result?.data?.invitaciones)
          ? result.data.invitaciones
          : [],
      );
    } catch (error) {
      console.error("Error cargando invitaciones", error);
      setInvitados([]);
    }
  }, [nivelActual, user?.uid]);

  useEffect(() => {
    if (loading || !user?.uid || nivelActual !== 4) return undefined;

    const empleadosQuery = query(
      collection(db, "usuarios"),
      where("esEmpleado", "==", true),
    );

    return onSnapshot(empleadosQuery, (snap) => {
      setEmpleados(
        snap.docs
          .map((item) => ({
            id: item.id,
            ...item.data(),
          }))
          .sort((a, b) =>
            String(a.nombre || a.email || "").localeCompare(
              String(b.nombre || b.email || ""),
              "es",
            ),
          ),
      );
    });
  }, [loading, nivelActual, user?.uid]);

  useEffect(() => {
    if (loading || !user?.uid || nivelActual !== 4) {
      setInvitados([]);
      return undefined;
    }

    cargarInvitaciones();
    return undefined;
  }, [cargarInvitaciones, loading, nivelActual, user?.uid]);

  function limpiarFormulario() {
    setModo("crear");
    setEditId("");
    setNombre("");
    setEmail("");
    setNivel("");
    setErrores({});
  }

  function validarCampos() {
    const nextErrores = {
      nombre: !nombre.trim(),
      email: !email.trim(),
      nivel: !nivel,
    };

    setErrores(nextErrores);
    return !Object.values(nextErrores).some(Boolean);
  }

  async function handleCrearEmpleado(event) {
    event.preventDefault();
    if (!validarCampos()) return;

    try {
      showLoading({
        title: "Guardando empleado",
        text: "Preparando acceso por Google...",
      });

      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("No autenticado");
      await currentUser.getIdToken(true);

      const result = await crearEmpleadoAdmin({
        email: normalizarEmail(email),
        nombre: nombre.trim(),
        nivel: Number(nivel),
      });

      hideLoading();
      swalSuccess({
        title: result?.data?.invitado
          ? "Invitacion creada"
          : "Empleado habilitado",
        text: result?.data?.invitado
          ? "El empleado podra entrar con Google y se activara en su primer login."
          : "El acceso del empleado fue habilitado correctamente.",
      });
      await cargarInvitaciones();
      limpiarFormulario();
    } catch (error) {
      console.error("Error creando empleado", error);
      hideLoading();
      swalError({
        title: "No se pudo guardar",
        text:
          error?.message ||
          error?.details ||
          "Ocurrio un error al crear el empleado.",
      });
    }
  }

  function cargarEdicion(empleado) {
    setModo("editar");
    setEditId(empleado.id);
    setNombre(empleado.nombre || "");
    setEmail(empleado.email || "");
    setNivel(String(empleado.nivel || ""));
    setErrores({});
  }

  async function handleGuardarEdicion(event) {
    event.preventDefault();
    if (!validarCampos() || !editId) return;

    try {
      showLoading({
        title: "Guardando cambios",
        text: "Actualizando datos del empleado...",
      });

      await actualizarEmpleadoAdmin({
        uid: editId,
        email: normalizarEmail(email),
        nombre: nombre.trim(),
        nivel: Number(nivel),
      });

      hideLoading();
      swalSuccess({
        title: "Empleado actualizado",
        text: "Los cambios se guardaron correctamente y se actualizaron los servicios vinculados.",
      });
      limpiarFormulario();
    } catch (error) {
      console.error("Error actualizando empleado", error);
      hideLoading();
      swalError({
        title: "No se pudo guardar",
        text: error?.message || "Ocurrio un error al actualizar el empleado.",
      });
    }
  }

  async function handleEliminarEmpleado(empleado) {
    const duenos = empleados.filter((item) => Number(item.nivel) === 4);
    if (Number(empleado.nivel) === 4 && duenos.length <= 1) {
      swalInfo({
        title: "Accion no permitida",
        text: "Debe existir al menos un dueño activo en el sistema.",
        confirmText: "Entendido",
      });
      return;
    }

    const confirmacion = await swalConfirmDanger({
      title: "Eliminar empleado",
      html: `Se eliminara a <b>${empleado.nombre || empleado.email}</b>.`,
      confirmText: "Eliminar",
    });

    if (!confirmacion.isConfirmed) return;

    try {
      showLoading({
        title: "Eliminando empleado",
        text: "Quitando acceso y perfil...",
      });

      await quitarEmpleadoAdmin({ uid: empleado.id });

      hideLoading();
      swalSuccess({
        title: "Empleado eliminado",
        text: "El acceso fue removido correctamente.",
      });
      if (editId === empleado.id) limpiarFormulario();
    } catch (error) {
      console.error("Error eliminando empleado", error);
      hideLoading();
      swalError({
        title: "No se pudo eliminar",
        text:
          error?.message ||
          error?.details ||
          "Ocurrio un error al eliminar el empleado.",
      });
    }
  }

  async function handleEliminarInvitacion(invitado) {
    const confirmacion = await swalConfirmDanger({
      title: "Eliminar invitacion",
      html: `Se eliminara la invitacion de <b>${invitado.email}</b>.`,
      confirmText: "Eliminar",
    });

    if (!confirmacion.isConfirmed) return;

    try {
      await eliminarInvitacionEmpleadoAdmin({
        id: invitado.id,
      });
      swalSuccess({
        title: "Invitacion eliminada",
      });
      await cargarInvitaciones();
    } catch (error) {
      console.error("Error eliminando invitacion", error);
      swalError({
        title: "No se pudo eliminar",
        text: "Ocurrio un error al eliminar la invitacion.",
      });
    }
  }

  if (nivelActual !== 4) {
    return (
      <div className="config-empty-state">
        Solo el dueño puede administrar empleados.
      </div>
    );
  }

  return (
    <div className="config-team-shell">
      <div className="config-note">
        Crea empleados usando solo email y nivel. Si esa cuenta ya existe en
        Firebase, se habilita al instante. Si todavia no entro, queda una
        invitacion pendiente y se activa automaticamente cuando inicie sesion
        con Google.
      </div>

      <div className="config-team-grid">
        <form
          onSubmit={
            modo === "crear" ? handleCrearEmpleado : handleGuardarEdicion
          }
          className="config-subcard"
        >
          <div className="config-subcard-header">
            <h3>{modo === "crear" ? "Nuevo empleado" : "Editar empleado"}</h3>
            <span>{modo === "crear" ? "Alta" : "Edicion"}</span>
          </div>

          <div className="config-form-grid">
            <label className="config-field">
              <span>Nombre</span>
              <input
                className={`form-control ${errores.nombre ? "is-invalid" : ""}`}
                value={nombre}
                onChange={(event) => setNombre(event.target.value)}
                placeholder="Ej: Paula Gomez"
              />
            </label>

            <label className="config-field">
              <span>Email de Google</span>
              <input
                className={`form-control ${errores.email ? "is-invalid" : ""}`}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="empleado@estetica.com"
                disabled={modo === "editar"}
              />
            </label>

            <label className="config-field">
              <span>Nivel de permiso</span>
              <select
                className={`form-control ${errores.nivel ? "is-invalid" : ""}`}
                value={nivel}
                onChange={(event) => setNivel(event.target.value)}
              >
                <option value="">Seleccionar</option>
                {Object.entries(ROLES).map(([key, role]) => (
                  <option key={key} value={key}>
                    {role.label}
                  </option>
                ))}
              </select>
              {nivel ? <small>{ROLES[nivel]?.desc}</small> : null}
            </label>
          </div>

          <div className="config-actions">
            <button className="btn swal-btn-confirm" type="submit">
              {modo === "crear" ? "Guardar empleado" : "Guardar cambios"}
            </button>
            {modo === "editar" ? (
              <button
                className="btn btn-outline-secondary"
                type="button"
                onClick={limpiarFormulario}
              >
                Cancelar
              </button>
            ) : null}
          </div>
        </form>

        <div className="config-subcard">
          <div className="config-subcard-header">
            <h3>Empleados activos</h3>
            <span>{empleados.length} activos</span>
          </div>

          <div className="config-team-list">
            {empleados.map((empleado) => (
              <article key={empleado.id} className="config-team-item">
                <div className="config-team-copy">
                  <strong>{empleado.nombre || "Sin nombre"}</strong>
                  <span>{empleado.email || empleado.id}</span>
                  <small>{ROLES[empleado.nivel]?.label || "Sin rol"}</small>
                </div>

                <div className="config-team-actions">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => cargarEdicion(empleado)}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm swal-btn-eliminar"
                    onClick={() => handleEliminarEmpleado(empleado)}
                  >
                    Eliminar
                  </button>
                </div>
              </article>
            ))}

            {!empleados.length ? (
              <div className="config-empty-state">
                Todavia no hay empleados activos.
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="config-subcard">
        <div className="config-subcard-header">
          <h3>Invitaciones pendientes</h3>
          <span>{invitados.length} pendientes</span>
        </div>

        <div className="config-team-list">
          {invitados.map((invitado) => (
            <article key={invitado.id} className="config-team-item">
              <div className="config-team-copy">
                <strong>{invitado.nombre || "Sin nombre"}</strong>
                <span>{invitado.email}</span>
                <small>
                  {ROLES[invitado.nivel]?.label || "Sin rol"} | pendiente de
                  primer login
                </small>
              </div>

              <div className="config-team-actions">
                <button
                  type="button"
                  className="btn btn-sm swal-btn-eliminar"
                  onClick={() => handleEliminarInvitacion(invitado)}
                >
                  Eliminar
                </button>
              </div>
            </article>
          ))}

          {!invitados.length ? (
            <div className="config-empty-state">
              No hay invitaciones pendientes.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

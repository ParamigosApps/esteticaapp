// --------------------------------------------------
// CategoriasServiciosPanel.jsx
// Admin de categorías de servicios
// --------------------------------------------------

import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import {
  swalSuccess,
  swalError,
  swalConfirmWarning,
  swalConfirmDanger,
} from "../../../public/utils/swalUtils";

import { db } from "../../../Firebase";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
} from "firebase/firestore";

function normalizar(str) {
  return (str || "").trim().toLowerCase();
}

export default function CategoriasServiciosPanel() {
  const [categorias, setCategorias] = useState([]);
  const [nombreNueva, setNombreNueva] = useState("");
  const [loading, setLoading] = useState(true);
  const [abierto, setAbierto] = useState(true);

  // =============================
  // Snapshot categorías
  // =============================
  useEffect(() => {
    const q = query(
      collection(db, "categorias_servicio"),
      orderBy("nombre", "asc"),
    );

    return onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      setCategorias(data);
      setLoading(false);
    });
  }, []);

  // =============================
  // Crear categoría
  // =============================
  async function crearCategoria() {
    try {
      const nombre = nombreNueva.trim();
      if (!nombre) {
        await swalError({
          title: "Nombre requerido",
          text: "Ingresá un nombre para la categoría.",
        });
        return;
      }

      const yaExiste = categorias.some(
        (c) => normalizar(c.nombre) === normalizar(nombre),
      );

      if (yaExiste) {
        await swalError({
          title: "Categoría duplicada",
          text: "Ya existe una categoría con ese nombre.",
        });
        return;
      }

      await addDoc(collection(db, "categorias_servicio"), {
        nombre,
        nombreNormalizado: normalizar(nombre),
        activo: true,
        creadoEn: serverTimestamp(),
        actualizadoEn: serverTimestamp(),
      });

      setNombreNueva("");

      await swalSuccess({
        title: "Categoría creada",
        text: "La categoría se creó correctamente.",
      });
    } catch (error) {
      console.error("Error creando categoría:", error);
      await swalError({
        title: "No se pudo crear",
        text: "Ocurrió un error al crear la categoría.",
      });
    }
  }

  // =============================
  // Editar categoría
  // =============================
  async function editarCategoria(cat) {
    try {
      const res = await Swal.fire({
        title: "Editar categoría",
        input: "text",
        inputValue: cat.nombre || "",
        inputPlaceholder: "Nuevo nombre",
        showCancelButton: true,
        confirmButtonText: "Guardar",
        cancelButtonText: "Cancelar",
        customClass: {
          confirmButton: "swal-btn-confirm",
          cancelButton: "swal-btn-cancel",
        },
        buttonsStyling: false,
        reverseButtons: true,
        inputValidator: (value) => {
          const limpio = String(value || "").trim();

          if (!limpio) return "Ingresá un nombre válido";

          const yaExiste = categorias.some(
            (c) =>
              c.id !== cat.id &&
              normalizar(c.nombreNormalizado || c.nombre) ===
                normalizar(limpio),
          );

          if (yaExiste) return "Ya existe una categoría con ese nombre";

          return null;
        },
      });

      if (!res.isConfirmed) return;

      const limpio = String(res.value || "").trim();

      await updateDoc(doc(db, "categorias_servicio", cat.id), {
        nombre: limpio,
        nombreNormalizado: normalizar(limpio),
        actualizadoEn: serverTimestamp(),
      });

      await swalSuccess({
        title: "Categoría actualizada",
        text: "El nombre se actualizó correctamente.",
      });
    } catch (error) {
      console.error("Error editando categoría:", error);
      await swalError({
        title: "No se pudo editar",
        text: "Ocurrió un error al actualizar la categoría.",
      });
    }
  }

  // =============================
  // Activar / Desactivar
  // =============================
  async function toggleActivo(cat) {
    try {
      const accion = cat.activo ? "desactivar" : "activar";

      const res = await swalConfirmWarning({
        title: `¿${cat.activo ? "Desactivar" : "Activar"} categoría?`,
        html: `
        <div style="text-align:left;font-size:14px;">
          <div><b>Categoría:</b> ${cat.nombre}</div>
          <div style="margin-top:8px;">
            Se va a ${accion} esta categoría.
          </div>
        </div>
      `,
        confirmText: cat.activo ? "Desactivar" : "Activar",
        cancelText: "Cancelar",
      });

      if (!res.isConfirmed) return;

      await updateDoc(doc(db, "categorias_servicio", cat.id), {
        activo: !cat.activo,
        actualizadoEn: serverTimestamp(),
      });

      await swalSuccess({
        title: cat.activo ? "Categoría desactivada" : "Categoría activada",
        text: `La categoría "${cat.nombre}" fue actualizada.`,
      });
    } catch (error) {
      console.error("Error cambiando estado categoría:", error);
      await swalError({
        title: "No se pudo actualizar",
        text: "Ocurrió un error al cambiar el estado de la categoría.",
      });
    }
  }

  // =============================
  // Eliminar (soft delete)
  // =============================
  async function eliminarCategoria(cat) {
    try {
      const res = await swalConfirmDanger({
        title: "¿Eliminar categoría?",
        html: `
    <div style="text-align:left;font-size:14px;">
      <div><b>Categoría:</b> ${cat.nombre}</div>
      <div style="margin-top:8px;color:#b02a37;">
        Esta acción elimina la categoría.
      </div>
      <div style="margin-top:6px;">
        No elimina automáticamente los servicios asociados.
      </div>
    </div>
  `,
        confirmText: "Eliminar",
        cancelText: "Cancelar",
        customClass: {
          confirmButton: "swal-btn-confirm",
          cancelButton: "swal-btn-cancel",
        },
      });

      if (!res.isConfirmed) return;

      await deleteDoc(doc(db, "categorias_servicio", cat.id));

      await swalSuccess({
        title: "Categoría eliminada",
        text: `La categoría "${cat.nombre}" fue eliminada.`,
      });
    } catch (error) {
      console.error("Error eliminando categoría:", error);
      await swalError({
        title: "No se pudo eliminar",
        text: "Ocurrió un error al eliminar la categoría.",
      });
    }
  }

  return (
    <div className="admin-categorias-panel">
      <div className="admin-panel-container categorias-panel-card">
        <div className="admin-categorias-header categorias-header-pro">
          <h5 className="fw-bold mb-0">CATEGORÍAS DE SERVICIOS</h5>
        </div>

        <div className="categorias-create-row">
          <input
            className="admin-input categorias-create-input"
            placeholder="Ej: Masajes"
            value={nombreNueva}
            onChange={(e) => setNombreNueva(e.target.value)}
          />
          <button
            className="swal-btn-confirm categorias-create-btn"
            onClick={crearCategoria}
          >
            Crear
          </button>
        </div>

        <div
          className="admin-categorias-sub categorias-subheader"
          onClick={() => setAbierto(!abierto)}
        >
          <h6 className="fw-bold mb-0">
            CATEGORÍAS CREADAS ({categorias.length})
          </h6>
          <span className="collapse-icon">{abierto ? "▾" : "▸"}</span>
        </div>

        {abierto && (
          <>
            {loading && <p className="admin-loading">Cargando categorías...</p>}

            {!loading && (
              <div className="categorias-grid">
                {categorias.map((cat) => (
                  <div
                    key={cat.id}
                    className={`categoria-card ${cat.activo ? "" : "inactive"}`}
                  >
                    <div className="categoria-card-top">
                      <div className="categoria-nombre-pro">
                        <span>{cat.nombre}</span>

                        {!cat.activo && (
                          <span className="categoria-badge">
                            Fuera de servicio
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="categoria-actions categoria-actions-pro">
                      <button
                        className="swal-btn-editar btn-editar-nombre"
                        onClick={() => editarCategoria(cat)}
                      >
                        Editar
                      </button>

                      <button
                        className="swal-btn-desactivar btn-desactivar"
                        onClick={() => toggleActivo(cat)}
                      >
                        {cat.activo ? "Desactivar" : "Activar"}
                      </button>

                      <button
                        className="categoria-btn-delete"
                        onClick={() => eliminarCategoria(cat)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

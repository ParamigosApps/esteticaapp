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
  const [descripcionNueva, setDescripcionNueva] = useState("");
  const [loading, setLoading] = useState(true);
  const [crearAbierto, setCrearAbierto] = useState(false);
  const [abierto, setAbierto] = useState(true);

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

  async function crearCategoria() {
    try {
      const nombre = nombreNueva.trim();
      const descripcion = descripcionNueva.trim();

      if (!nombre) {
        await swalError({
          title: "Nombre requerido",
          text: "Ingresa un nombre para la categoria.",
        });
        return;
      }

      const yaExiste = categorias.some(
        (c) => normalizar(c.nombre) === normalizar(nombre),
      );

      if (yaExiste) {
        await swalError({
          title: "Categoría duplicada",
          text: "Ya existe una categoria con ese nombre.",
        });
        return;
      }

      await addDoc(collection(db, "categorias_servicio"), {
        nombre,
        nombreNormalizado: normalizar(nombre),
        descripcion,
        activo: true,
        creadoEn: serverTimestamp(),
        actualizadoEn: serverTimestamp(),
      });

      setNombreNueva("");
      setDescripcionNueva("");
      setCrearAbierto(false);

      await swalSuccess({
        title: "Categoría creada",
        text: "La categoría se creo correctamente.",
      });
    } catch (error) {
      console.error("Error creando categoría:", error);
      await swalError({
        title: "No se pudo crear",
        text: "Ocurrio un error al crear la categoría.",
      });
    }
  }

  async function editarCategoria(cat) {
    try {
      const res = await Swal.fire({
        title: "Editar categoria",
        html: `
          <div style="display:grid;gap:12px;text-align:left;">
            <div>
              <label for="swal-categoria-nombre" style="display:block;margin:0 0 6px;font-weight:700;">Nombre</label>
              <input id="swal-categoria-nombre" class="swal2-input" style="margin:0;" placeholder="Nuevo nombre" value="${String(cat.nombre || "").replace(/"/g, "&quot;")}">
            </div>
            <div>
              <label for="swal-categoria-descripcion" style="display:block;margin:0 0 6px;font-weight:700;">Descripcion</label>
              <textarea id="swal-categoria-descripcion" class="swal2-textarea" style="margin:0;min-height:110px;" placeholder="Descripcion de la categoria">${String(cat.descripcion || "")}</textarea>
            </div>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: "Guardar",
        cancelButtonText: "Cancelar",
        customClass: {
          confirmButton: "swal-btn-confirm",
          cancelButton: "swal-btn-cancel",
        },
        buttonsStyling: false,
        reverseButtons: true,
        preConfirm: () => {
          const nombreInput = document.getElementById("swal-categoria-nombre");
          const descripcionInput = document.getElementById(
            "swal-categoria-descripcion",
          );
          const limpio = String(nombreInput?.value || "").trim();

          if (!limpio) {
            Swal.showValidationMessage("Ingresa un nombre valido");
            return false;
          }

          const yaExiste = categorias.some(
            (c) =>
              c.id !== cat.id &&
              normalizar(c.nombreNormalizado || c.nombre) ===
                normalizar(limpio),
          );

          if (yaExiste) {
            Swal.showValidationMessage(
              "Ya existe una categoria con ese nombre",
            );
            return false;
          }

          return {
            nombre: limpio,
            descripcion: String(descripcionInput?.value || "").trim(),
          };
        },
      });

      if (!res.isConfirmed) return;

      await updateDoc(doc(db, "categorias_servicio", cat.id), {
        nombre: String(res.value?.nombre || "").trim(),
        nombreNormalizado: normalizar(res.value?.nombre),
        descripcion: String(res.value?.descripcion || "").trim(),
        actualizadoEn: serverTimestamp(),
      });

      await swalSuccess({
        title: "Categoría actualizada",
        text: "La categoria se actualizo correctamente.",
      });
    } catch (error) {
      console.error("Error editando categoria:", error);
      await swalError({
        title: "No se pudo editar",
        text: "Ocurrio un error al actualizar la categoria.",
      });
    }
  }

  async function toggleActivo(cat) {
    try {
      const accion = cat.activo ? "desactivar" : "activar";

      const res = await swalConfirmWarning({
        title: `¿${cat.activo ? "Desactivar" : "Activar"} categoria?`,
        html: `
          <div style="text-align:left;font-size:14px;">
            <div><b>Categoría:</b> ${cat.nombre}</div>
            <div style="margin-top:8px;">
              Se va a ${accion} esta categoria.
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
        text: "Ocurrio un error al cambiar el estado de la categoria.",
      });
    }
  }

  async function eliminarCategoria(cat) {
    try {
      const res = await swalConfirmDanger({
        title: "¿Eliminar categoria?",
        html: `
          <div style="text-align:left;font-size:14px;">
            <div><b>Categoría:</b> ${cat.nombre}</div>
            <div style="margin-top:8px;color:#b02a37;">
              Esta accion elimina la categoria.
            </div>
            <div style="margin-top:6px;">
              No elimina automaticamente los servicios asociados.
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
        text: "Ocurrio un error al eliminar la categoria.",
      });
    }
  }

  return (
    <div className="admin-categorias-panel">
      <div className="admin-panel-container categorias-panel-card">
        <div className="admin-categorias-header categorias-header-pro">
          <h5 className="fw-bold mb-0">CATEGORIAS DE SERVICIOS</h5>
        </div>

        <div className="categorias-create-shell">
          <button
            type="button"
            className="admin-categorias-sub categorias-subheader categorias-create-toggle"
            onClick={() => setCrearAbierto((prev) => !prev)}
            aria-expanded={crearAbierto}
          >
            <div>
              <h6 className="fw-bold mb-0">CREAR CATEGORIA</h6>
              <p className="categorias-create-copy mb-0">
                Agrega una nueva categoria con nombre y descripcion opcional.
              </p>
            </div>
            <span className="collapse-icon" aria-hidden="true">
              {crearAbierto ? "\u25BE" : "\u25B8"}
            </span>
          </button>

          {crearAbierto && (
            <div className="categorias-create-card">
              <div className="categorias-create-row">
                <label className="categorias-create-field">
                  <span>Nombre</span>
                  <input
                    className="admin-input categorias-create-input"
                    placeholder="Ej: Masajes"
                    value={nombreNueva}
                    onChange={(e) => setNombreNueva(e.target.value)}
                  />
                </label>

                <label className="categorias-create-field categorias-create-field-wide">
                  <span>Descripcion</span>
                  <textarea
                    className="admin-input categorias-create-input categorias-create-textarea"
                    placeholder="Descripcion de la categoria"
                    value={descripcionNueva}
                    onChange={(e) => setDescripcionNueva(e.target.value)}
                  />
                </label>
              </div>

              <div className="categorias-create-actions">
                <button
                  className="swal-btn-confirm categorias-create-btn"
                  onClick={crearCategoria}
                >
                  Crear categoria
                </button>
              </div>
            </div>
          )}
        </div>

        <div
          className="admin-categorias-sub categorias-subheader"
          onClick={() => setAbierto(!abierto)}
          aria-expanded={abierto}
          role="button"
        >
          <h6 className="fw-bold mb-0">
            CATEGORIAS CREADAS ({categorias.length})
          </h6>
          <span className="collapse-icon" aria-hidden="true">
            {abierto ? "\u25BE" : "\u25B8"}
          </span>
        </div>

        {abierto && (
          <>
            {loading && <p className="admin-loading">Cargando categorias...</p>}

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

                    <p
                      className={`categoria-card-descripcion ${
                        cat.descripcion
                          ? ""
                          : "categoria-card-descripcion-empty"
                      }`}
                    >
                      {cat.descripcion || "Sin descripcion."}
                    </p>

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

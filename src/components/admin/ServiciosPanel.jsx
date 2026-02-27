// --------------------------------------------------
// ServiciosPanel.jsx — LIMPIO (SIN HORARIOS)
// --------------------------------------------------

import { useEffect, useState } from "react";
import { db } from "../../Firebase";
import {
  collection,
  addDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  doc,
} from "firebase/firestore";

import { getFunctions, httpsCallable } from "firebase/functions";

function normalizar(str) {
  return str.trim().toLowerCase();
}

// ===================================================
// ITEM EDITABLE
// ===================================================
function ServicioItem({ servicio, gabinetes }) {
  const [editando, setEditando] = useState(false);

  const [nombre, setNombre] = useState(servicio.nombre);
  const [duracion, setDuracion] = useState(servicio.duracionMin);
  const [precio, setPrecio] = useState(servicio.precio);
  const [requiereSenaOnline, setRequiereSenaOnline] = useState(
    servicio.requiereSenaOnline || false,
  );

  const [porcentajeSena, setPorcentajeSena] = useState(
    servicio.porcentajeSena || 30,
  );

  const [seleccionados, setSeleccionados] = useState(
    servicio.gabinetes?.map((g) => g.id) ?? [],
  );

  function toggleGabinete(id) {
    setSeleccionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function guardarCambios() {
    if (!nombre.trim()) return alert("El servicio necesita nombre");
    if (seleccionados.length === 0)
      return alert("Debe tener al menos un gabinete");

    await updateDoc(doc(db, "servicios", servicio.id), {
      nombre: nombre.trim(),
      duracionMin: Number(duracion),
      precio: Number(precio),
      requiereSenaOnline,
      porcentajeSena: requiereSenaOnline ? Number(porcentajeSena) : null,
      gabinetes: seleccionados
        .map((id) => {
          const g = gabinetes.find((x) => x.id === id);
          if (!g) return null;
          return {
            id: g.id,
            nombre: g.nombre ?? "",
          };
        })
        .filter(Boolean),
      actualizadoEn: serverTimestamp(),
    });

    setEditando(false);
  }

  async function desactivarServicio() {
    const confirmar = window.confirm(
      `¿Desactivar el servicio "${servicio.nombre}"?`,
    );
    if (!confirmar) return;

    try {
      const fn = httpsCallable(getFunctions(), "desactivarServicio");
      await fn({ servicioId: servicio.id });
    } catch (e) {
      alert(e.message);
    }
  }

  async function eliminarServicio() {
    const confirmar = window.confirm(
      "¿Eliminar definitivamente este servicio?\n\nEsta acción no se puede deshacer.",
    );
    if (!confirmar) return;

    try {
      const fn = httpsCallable(getFunctions(), "eliminarServicioDefinitivo");
      await fn({ servicioId: servicio.id });
    } catch (e) {
      alert(e.message);
    }
  }

  return (
    <div className={`service-card ${servicio.activo ? "" : "inactive"}`}>
      {/* HEADER */}
      <div className="service-header">
        <div className="service-title">
          {servicio.nombre}
          {!servicio.activo && <span className="badge inactive">Inactivo</span>}
        </div>

        <div className="service-actions">
          <button
            className="admin-button secondary"
            onClick={() => setEditando(!editando)}
          >
            ✏ Editar
          </button>

          {servicio.activo ? (
            <button
              className="admin-button danger"
              onClick={desactivarServicio}
            >
              Desactivar
            </button>
          ) : (
            <>
              <button
                className="admin-button success"
                onClick={async () => {
                  await updateDoc(doc(db, "servicios", servicio.id), {
                    activo: true,
                    actualizadoEn: serverTimestamp(),
                  });
                }}
              >
                Reactivar
              </button>

              <button
                className="admin-button danger"
                onClick={eliminarServicio}
                style={{ marginLeft: 8 }}
              >
                Eliminar
              </button>
            </>
          )}
        </div>
      </div>

      {/* INFO */}
      <div className="service-info">
        <span>
          <strong>{servicio.duracionMin}</strong> min
        </span>
        <span>
          <strong>${servicio.precio}</strong>
        </span>
        <span>
          Gabinetes:{" "}
          {servicio.gabinetes?.map((g) => g.nombre).join(", ") || "—"}
        </span>
      </div>

      {/* EDITOR */}
      {editando && (
        <div className="service-editor">
          {/* FILA 1 */}
          <div className="service-row">
            <div className="field-group">
              <label>Nombre:</label>
              <input
                className="admin-input"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Limpieza facial profunda"
              />
            </div>

            <div className="field-group">
              <label>Duración (min):</label>
              <input
                type="number"
                className="admin-input"
                value={duracion}
                onChange={(e) => setDuracion(e.target.value)}
                placeholder="60"
                min={1}
              />
            </div>

            <div className="field-group">
              <label>Precio:</label>
              <div className="price-input">
                <span>$</span>
                <input
                  type="number"
                  className="admin-input"
                  value={precio}
                  onChange={(e) => setPrecio(e.target.value)}
                  placeholder="12000"
                  min={0}
                />
              </div>
            </div>
          </div>

          {/* FILA 2 — SEÑA */}
          <div className="service-row service-sena-row">
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={requiereSenaOnline}
                onChange={(e) => setRequiereSenaOnline(e.target.checked)}
              />
              Pedir seña online
            </label>

            {requiereSenaOnline && (
              <div className="sena-percentage">
                <span>% de la seña:</span>
                <input
                  type="number"
                  className="admin-input small-input"
                  value={porcentajeSena}
                  onChange={(e) => setPorcentajeSena(e.target.value)}
                  placeholder="50"
                  min={5}
                  max={100}
                />
              </div>
            )}
          </div>

          {/* GABINETES */}
          <div className="service-gabinetes">
            {gabinetes.map((g) => (
              <label key={g.id} className="gabinete-checkbox">
                <input
                  type="checkbox"
                  checked={seleccionados.includes(g.id)}
                  onChange={() => toggleGabinete(g.id)}
                />
                {g.nombre}
              </label>
            ))}
          </div>

          {/* BOTONES */}
          <div className="service-editor-actions">
            <button className="admin-button primary" onClick={guardarCambios}>
              Guardar cambios
            </button>

            <button
              className="admin-button secondary"
              onClick={() => setEditando(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ===================================================
// PANEL PRINCIPAL
// ===================================================
export default function ServiciosPanel() {
  const [gabinetes, setGabinetes] = useState([]);
  const [servicios, setServicios] = useState([]);

  const [nombre, setNombre] = useState("");
  const [duracion, setDuracion] = useState(60);
  const [precio, setPrecio] = useState(0);
  const [seleccionados, setSeleccionados] = useState([]);

  useEffect(() => {
    return onSnapshot(collection(db, "gabinetes"), (snap) => {
      setGabinetes(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((g) => g.activo),
      );
    });
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, "servicios"), (snap) => {
      const data = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      data.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setServicios(data);
    });
  }, []);

  function toggleGabinete(id) {
    setSeleccionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function crearServicio() {
    if (!nombre.trim() || seleccionados.length === 0) return;

    const yaExisteActivo = servicios.some(
      (s) => s.activo && normalizar(s.nombre) === normalizar(nombre),
    );

    if (yaExisteActivo)
      return alert("Ya existe un servicio activo con ese nombre");

    if (duracion <= 0) return alert("Duración inválida");
    if (precio < 0) return alert("Precio inválido");

    await addDoc(collection(db, "servicios"), {
      nombre: nombre.trim(),
      nombreNormalizado: normalizar(nombre),
      duracionMin: Number(duracion),
      precio: Number(precio),
      gabinetes: seleccionados
        .map((id) => {
          const g = gabinetes.find((x) => x.id === id);
          if (!g) return null;

          return {
            id: g.id,
            nombre: g.nombre ?? "",
          };
        })
        .filter(Boolean),
      activo: true,
      creadoEn: serverTimestamp(),
    });

    setNombre("");
    setDuracion(60);
    setPrecio(0);
    setSeleccionados([]);
  }

  return (
    <div className="admin-panel">
      <div className="admin-title">Servicios</div>

      <div className="admin-card">
        <div className="admin-row">
          <input
            className="admin-input"
            placeholder="Nombre del servicio"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />

          <input
            className="admin-input"
            type="number"
            value={duracion}
            onChange={(e) => setDuracion(e.target.value)}
            placeholder="Duración (min)"
          />

          <input
            className="admin-input"
            type="number"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            placeholder="Precio"
          />

          <button className="admin-button primary" onClick={crearServicio}>
            Crear
          </button>
        </div>

        <div className="admin-row" style={{ marginTop: 8 }}>
          {gabinetes.map((g) => (
            <label key={g.id}>
              <input
                type="checkbox"
                checked={seleccionados.includes(g.id)}
                onChange={() => toggleGabinete(g.id)}
              />
              {g.nombre}
            </label>
          ))}
        </div>
      </div>

      {servicios.map((s) => (
        <ServicioItem key={s.id} servicio={s} gabinetes={gabinetes} />
      ))}
    </div>
  );
}

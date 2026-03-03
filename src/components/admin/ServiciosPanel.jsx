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

  const [nombreServicio, setNombreServicio] = useState(
    servicio.nombreServicio || "",
  );
  const [nombreProfesional, setNombreProfesional] = useState(
    servicio.nombreProfesional || "",
  );
  const [descripcion, setDescripcion] = useState(servicio.descripcion || "");
  const [duracion, setDuracion] = useState(servicio.duracionMin);
  const [precio, setPrecio] = useState(servicio.precio);
  const [modoReserva, setModoReserva] = useState(
    servicio.modoReserva || "automatico",
  );

  const [pedirAnticipo, setPedirAnticipo] = useState(
    servicio.pedirAnticipo || false,
  );

  const [porcentajeAnticipo, setPorcentajeAnticipo] = useState(
    servicio.porcentajeAnticipo || 50,
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
    if (!nombreServicio.trim()) return alert("El servicio necesita nombre");
    if (seleccionados.length === 0)
      return alert("Debe tener al menos un gabinete");

    await updateDoc(doc(db, "servicios", servicio.id), {
      nombreServicio: nombreServicio.trim(),
      nombreProfesional: nombreProfesional.trim(),
      descripcion: descripcion,
      duracionMin: Number(duracion),
      precio: Number(precio),
      modoReserva,
      pedirAnticipo,
      porcentajeAnticipo: pedirAnticipo ? Number(porcentajeAnticipo) : null,
      gabinetes: seleccionados
        .map((id) => {
          const g = gabinetes.find((x) => x.id === id);
          if (!g) return null;

          return {
            id: g.id,
            nombreGabinete: g.nombreGabinete ?? "",
          };
        })
        .filter(Boolean),
      actualizadoEn: serverTimestamp(),
    });

    setEditando(false);
  }

  async function desactivarServicio() {
    const confirmar = window.confirm(
      `¿Desactivar el servicio "${servicio.nombreServicio}"?`,
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
          Servicio: <b>{servicio.nombreServicio}</b>
          {!servicio.activo && <span className="badge inactive">Inactivo</span>}
        </div>

        <div className="service-actions">
          <button
            className="swal-btn-editar"
            onClick={() => setEditando(!editando)}
          >
            Editar
          </button>

          {servicio.activo ? (
            <button
              className="swal-btn-desactivar"
              onClick={desactivarServicio}
            >
              Desactivar
            </button>
          ) : (
            <>
              <button
                className="swal-btn-desactivar"
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
                className="swal-btn-eliminar"
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
        {servicio.nombreProfesional && (
          <span>
            Profesional: <strong>{servicio.nombreProfesional}</strong>
          </span>
        )}
        <span>
          Duración: <strong>{servicio.duracionMin}</strong> min
        </span>
        <span>
          Valor: <strong>${servicio.precio}</strong>
        </span>
        <span>
          Gabinetes:{" "}
          <strong>
            {servicio.gabinetes?.map((g) => g.nombreGabinete).join(", ") || "—"}
          </strong>
        </span>
      </div>

      {/* EDITOR */}
      {editando && (
        <div className="service-editor">
          {/* FILA 1 */}
          <div className="service-row">
            <div className="field-group">
              <label>Servicio:</label>
              <input
                className="admin-input servicio"
                value={nombreServicio}
                onChange={(e) => setNombreServicio(e.target.value)}
              />

              <label>Profesional:</label>
              <input
                className="admin-input profesional"
                value={nombreProfesional}
                onChange={(e) => setNombreProfesional(e.target.value)}
              />

              <label>Descripción:</label>
              <input
                className="admin-input profesional"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            </div>

            <div className="field-group">
              <label>Duración (min):</label>
              <input
                type="number"
                className="admin-input duracion"
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
                  className="admin-input precio-admin"
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
            <label className="checkbox-inline text-muted">
              <input
                type="checkbox"
                checked={pedirAnticipo}
                onChange={(e) => setPedirAnticipo(e.target.checked)}
              />
              {pedirAnticipo == true ? "Solicitando seña" : "No pedir seña"}
            </label>

            {pedirAnticipo && (
              <div className="field-group">
                <label>Modo de reserva:</label>
                <input
                  type="number"
                  className="admin-input seña"
                  value={porcentajeAnticipo}
                  onChange={(e) => setPorcentajeAnticipo(e.target.value)}
                  placeholder="50"
                  min={5}
                  max={100}
                />
              </div>
            )}
            {/* MODO DE RESERVA */}
            <div className="service-row">
              <div className="field-group">
                <label>Modo de reserva:</label>
                <select
                  className="admin-input reserva"
                  value={modoReserva}
                  onChange={(e) => setModoReserva(e.target.value)}
                >
                  <option value="automatico">Confirmación automática</option>
                  <option value="reserva">Requiere aprobación</option>
                </select>
              </div>
            </div>
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
                {g.nombreGabinete}
              </label>
            ))}
          </div>

          {/* BOTONES */}
          <div className="service-editor-actions">
            <button className="swal-btn-guardar" onClick={guardarCambios}>
              Guardar cambios
            </button>

            <button
              className="swal-btn-cancel"
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

  const [nombreServicio, setNombreServicio] = useState("");
  const [nombreProfesional, setNombreProfesional] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [duracion, setDuracion] = useState(60);
  const [precio, setPrecio] = useState(0);
  const [modoReserva, setModoReserva] = useState("reserva");
  const [pedirAnticipo, setPedirAnticipo] = useState(false);
  const [porcentajeAnticipo, setPorcentajeAnticipo] = useState(50);

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
      data.sort((a, b) => a.nombreServicio.localeCompare(b.nombreServicio));
      setServicios(data);
    });
  }, []);

  function toggleGabinete(id) {
    setSeleccionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function crearServicio() {
    if (!nombreServicio.trim() || seleccionados.length === 0) return;

    const yaExisteActivo = servicios.some(
      (s) =>
        s.activo && normalizar(s.nombreServicio) === normalizar(nombreServicio),
    );

    if (yaExisteActivo)
      return alert("Ya existe un servicio activo con ese nombreServicio");

    if (duracion <= 0) return alert("Duración inválida");
    if (precio < 0) return alert("Precio inválido");

    console.log(descripcion);
    await addDoc(collection(db, "servicios"), {
      nombreServicio: nombreServicio.trim(),
      nombreServicioNormalizado: normalizar(nombreServicio),
      nombreProfesional: nombreProfesional.trim(),
      descripcion: descripcion,
      duracionMin: Number(duracion),
      precio: Number(precio),
      modoReserva,
      pedirAnticipo,
      porcentajeAnticipo: pedirAnticipo ? Number(porcentajeAnticipo) : null,
      gabinetes: seleccionados
        .map((id) => {
          const g = gabinetes.find((x) => x.id === id);
          if (!g) return null;

          return {
            id: g.id,
            nombreGabinete: g.nombreGabinete ?? "",
          };
        })
        .filter(Boolean),
      activo: true,
      creadoEn: serverTimestamp(),
    });

    setNombreServicio("");
    setNombreProfesional("");
    setDescripcion("");
    setDuracion(60);
    setPrecio(0);
    setPedirAnticipo(false);
    setPorcentajeAnticipo(50);
    setSeleccionados([]);
  }

  return (
    <div className="admin-panel">
      <div className="admin-title">Servicios</div>

      <h6 className="fw-bold">NUEVO SERVICIO</h6>
      <div className="admin-row form-servicio-grid">
        <div className="form-field">
          <label className="admin-label">Servicio</label>
          <input
            className="admin-input servicio"
            placeholder="Nombre del servicio"
            value={nombreServicio}
            onChange={(e) => setNombreServicio(e.target.value)}
          />
        </div>

        <div className="form-field">
          <label>Profesional</label>
          <input
            className="admin-input profesional"
            placeholder="Nombre del profesional"
            value={nombreProfesional}
            onChange={(e) => setNombreProfesional(e.target.value)}
          />
        </div>

        <div className="form-field">
          <label>Descripción</label>
          <input
            className="admin-input profesional"
            placeholder="Descripción breve"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </div>
        <div className="form-field">
          <label>Duración (min)</label>
          <input
            className="admin-input duracion"
            type="number"
            value={duracion}
            onChange={(e) => setDuracion(e.target.value)}
            placeholder="Ej: 60"
          />
        </div>

        <div className="form-field">
          <label>Precio</label>
          <input
            className="admin-input precio-admin"
            type="number"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            placeholder="$"
          />
        </div>

        <div className="form-field">
          <label>Modo de reserva</label>
          <select
            className="admin-input reserva"
            value={modoReserva}
            onChange={(e) => setModoReserva(e.target.value)}
          >
            <option value="automatico">Confirmación automática</option>
            <option value="reserva">Requiere aprobación</option>
          </select>
        </div>
        {/* FILA 2 — SEÑA */}
        <div className="service-row service-sena-row">
          <div className="field-group">
            <label>¿Pedir seña?</label>
            <label className="checkbox-inline text-muted">
              <input
                type="checkbox"
                checked={pedirAnticipo}
                onChange={(e) => setPedirAnticipo(e.target.checked)}
              />
              {pedirAnticipo == true ? "Solicitando seña" : "No pedir seña"}
            </label>
          </div>

          <div className="field-group">
            <label>Porcentaje seña</label>
            <input
              type="number"
              className="admin-input anticipo"
              value={porcentajeAnticipo}
              onChange={(e) => setPorcentajeAnticipo(e.target.value)}
              placeholder="50"
              min={5}
              max={100}
              disabled={!pedirAnticipo}
            />
          </div>
        </div>

        {/* GABINETES */}
        <div className="field-group">
          <label>Gabinetes a utilizar</label>
          <div className="service-gabinetes">
            {gabinetes.map((g) => (
              <label key={g.id} className="gabinete-checkbox">
                <input
                  type="checkbox"
                  checked={seleccionados.includes(g.id)}
                  onChange={() => toggleGabinete(g.id)}
                />
                {g.nombreGabinete}
              </label>
            ))}
          </div>
        </div>
        <div className="form-field button-field">
          <button className="swal-btn-agregar" onClick={crearServicio}>
            Crear servicio
          </button>
        </div>
      </div>

      <h6 className="fw-bold">SERVICIOS CREADOS</h6>
      {servicios.map((s) => (
        <ServicioItem key={s.id} servicio={s} gabinetes={gabinetes} />
      ))}
    </div>
  );
}

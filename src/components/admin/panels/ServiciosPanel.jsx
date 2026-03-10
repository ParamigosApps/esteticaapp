// --------------------------------------------------
// ServiciosPanel.jsx — LIMPIO (SIN HORARIOS)
// --------------------------------------------------

import { useEffect, useState } from "react";
import { db } from "../../../Firebase";
import {
  collection,
  addDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  doc,
} from "firebase/firestore";

import { getFunctions, httpsCallable } from "firebase/functions";
import CategoriasServiciosPanel from "./CategoriasServiciosPanel";

function normalizar(str) {
  return str.trim().toLowerCase();
}

function obtenerCategoriaServicio(valor) {
  const categoria = (valor || "").trim();
  return categoria || "General";
}

function getCategoriaLabel(servicio) {
  return (
    (servicio.categoriaNombre || "").trim() ||
    obtenerCategoriaServicio(servicio.categoriaServicio)
  );
}

const DIAS_SEMANA = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
];

function crearFranjaBase() {
  return {
    desde: "09:00",
    hasta: "18:00",
  };
}

function crearHorariosServicioBase() {
  return DIAS_SEMANA.map((d) => ({
    diaSemana: d.value,
    activo: false,
    franjas: [crearFranjaBase()],
  }));
}

function normalizarFranjas(lista = []) {
  const base = Array.isArray(lista) ? lista : [];

  const limpias = base
    .map((f) => ({
      desde: f?.desde || "09:00",
      hasta: f?.hasta || "18:00",
    }))
    .filter((f) => typeof f.desde === "string" && typeof f.hasta === "string");

  return limpias.length ? limpias : [crearFranjaBase()];
}

function normalizarHorariosServicio(lista = []) {
  const base = crearHorariosServicioBase();

  return base.map((diaBase) => {
    const encontrado = Array.isArray(lista)
      ? lista.find((x) => Number(x?.diaSemana) === Number(diaBase.diaSemana))
      : null;

    return encontrado
      ? {
          diaSemana: Number(encontrado.diaSemana),
          activo: Boolean(encontrado.activo),
          franjas: normalizarFranjas(encontrado.franjas),
        }
      : diaBase;
  });
}

function serializarHorariosServicio(lista = []) {
  return normalizarHorariosServicio(lista).map((h) => ({
    diaSemana: Number(h.diaSemana),
    activo: Boolean(h.activo),
    franjas: h.activo
      ? (h.franjas || [])
          .map((f) => ({
            desde: f?.desde || "09:00",
            hasta: f?.hasta || "18:00",
          }))
          .filter((f) => f.desde && f.hasta && f.desde < f.hasta)
      : [],
  }));
}

function tieneHorariosServicioValidos(lista = []) {
  return serializarHorariosServicio(lista).every(
    (h) => !h.activo || h.franjas.length > 0,
  );
}

function HorariosServicioEditor({ horarios, setHorarios }) {
  function updateDia(diaSemana, patch) {
    setHorarios((prev) =>
      prev.map((h) =>
        Number(h.diaSemana) === Number(diaSemana) ? { ...h, ...patch } : h,
      ),
    );
  }

  function updateFranja(diaSemana, index, patch) {
    setHorarios((prev) =>
      prev.map((h) => {
        if (Number(h.diaSemana) !== Number(diaSemana)) return h;

        const nuevasFranjas = (h.franjas || []).map((f, i) =>
          i === index ? { ...f, ...patch } : f,
        );

        return { ...h, franjas: nuevasFranjas };
      }),
    );
  }

  function agregarFranja(diaSemana) {
    setHorarios((prev) =>
      prev.map((h) =>
        Number(h.diaSemana) === Number(diaSemana)
          ? {
              ...h,
              activo: true,
              franjas: [...(h.franjas || []), crearFranjaBase()],
            }
          : h,
      ),
    );
  }

  function eliminarFranja(diaSemana, index) {
    setHorarios((prev) =>
      prev.map((h) => {
        if (Number(h.diaSemana) !== Number(diaSemana)) return h;

        const nuevasFranjas = (h.franjas || []).filter((_, i) => i !== index);

        return {
          ...h,
          franjas: nuevasFranjas.length ? nuevasFranjas : [crearFranjaBase()],
        };
      }),
    );
  }

  return (
    <div>
      <label className="horarios-servicio-label mt-3">
        Horarios semanales del servicio
      </label>

      <div className="service-horarios-servicio">
        {DIAS_SEMANA.map((dia) => {
          const item = horarios.find(
            (h) => Number(h.diaSemana) === Number(dia.value),
          ) || {
            diaSemana: dia.value,
            activo: false,
            franjas: [crearFranjaBase()],
          };

          return (
            <div key={dia.value} className="horario-dia-card">
              <div className="horario-dia-header">
                <label className="checkbox-inline text-muted horario-dia-check">
                  <input
                    type="checkbox"
                    checked={item.activo}
                    onChange={(e) =>
                      updateDia(dia.value, { activo: e.target.checked })
                    }
                  />
                  {dia.label}
                </label>

                <button
                  type="button"
                  className="swal-btn-editar btn-editar-nombre"
                  onClick={() => agregarFranja(dia.value)}
                  disabled={!item.activo}
                >
                  Añadir horario
                </button>
              </div>

              {!item.activo ? (
                <div className="horario-dia-inactivo">
                  No disponible este día
                </div>
              ) : (
                <div className="horario-franjas-list">
                  {(item.franjas || []).map((franja, index) => (
                    <div
                      key={`${dia.value}-${index}`}
                      className="horario-franja-row"
                    >
                      <input
                        type="time"
                        className="admin-input horario-franja-input"
                        value={franja.desde}
                        onChange={(e) =>
                          updateFranja(dia.value, index, {
                            desde: e.target.value,
                          })
                        }
                      />

                      <input
                        type="time"
                        className="admin-input horario-franja-input"
                        value={franja.hasta}
                        onChange={(e) =>
                          updateFranja(dia.value, index, {
                            hasta: e.target.value,
                          })
                        }
                      />

                      <button
                        type="button"
                        className="swal-btn-eliminar horario-btn-quitar"
                        onClick={() => eliminarFranja(dia.value, index)}
                        disabled={(item.franjas || []).length <= 1}
                        title={
                          (item.franjas || []).length <= 1
                            ? "Debe quedar al menos una franja"
                            : ""
                        }
                      >
                        Quitar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===================================================
// ITEM EDITABLE
// ===================================================
function ServicioItem({ servicio, gabinetes }) {
  const [editando, setEditando] = useState(false);

  // ==============================
  // CATEGORÍAS (para editar)
  // ==============================
  const [categorias, setCategorias] = useState([]);
  const [categoriaId, setCategoriaId] = useState(servicio.categoriaId || "");

  useEffect(() => {
    return onSnapshot(collection(db, "categorias_servicio"), (snap) => {
      const data = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((c) => c.activo)
        .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
      setCategorias(data);
    });
  }, []);

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

  const [agendaMaxDias, setAgendaMaxDias] = useState(
    Number(servicio.agendaMaxDias || 14),
  );

  const [horariosServicio, setHorariosServicio] = useState(
    normalizarHorariosServicio(servicio.horariosServicio || []),
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

    if (!categoriaId) return alert("Debes elegir una categoría");
    const cat = categorias.find((c) => c.id === categoriaId);
    if (!cat) return alert("Categoría inválida");
    const categoriaNombre = (cat.nombre || "").trim();

    if (precio <= 0) return alert("Precio inválido");

    if (!tieneHorariosServicioValidos(horariosServicio)) {
      return alert(
        "Revisá los horarios del servicio. Cada día activo debe tener al menos una franja válida.",
      );
    }

    await updateDoc(doc(db, "servicios", servicio.id), {
      categoriaId,
      categoriaNombre,
      categoriaNombreNormalizado: normalizar(categoriaNombre),

      nombreServicio: nombreServicio.trim(),
      nombreServicioNormalizado: normalizar(nombreServicio),
      nombreProfesional: nombreProfesional.trim(),
      descripcion: descripcion,
      duracionMin: Number(duracion),
      precio: Number(precio),
      modoReserva,
      pedirAnticipo,
      porcentajeAnticipo: pedirAnticipo ? Number(porcentajeAnticipo) : null,
      agendaMaxDias: Math.max(1, Number(agendaMaxDias || 7)),
      horariosServicio: serializarHorariosServicio(horariosServicio),

      gabinetes: seleccionados
        .map((id) => {
          const g = gabinetes.find((x) => x.id === id);
          if (!g) return null;
          return { id: g.id, nombreGabinete: g.nombreGabinete ?? "" };
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
        <div className="service-title-wrap">
          <div className="service-kicker">{getCategoriaLabel(servicio)}</div>
          <div className="service-title">
            <b>{servicio.nombreServicio}</b>
            {!servicio.activo && (
              <span className="badge inactive">Inactivo</span>
            )}
          </div>
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
              className="swal-btn-desactivar btn-desactivar"
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
      {/* EDITOR */}
      {editando && (
        <div className="service-editor">
          <div className="service-editor-grid">
            {/* BLOQUE 1: DATOS */}
            <section className="service-editor-block service-editor-block-main">
              <div className="service-editor-block-title">
                Datos principales
              </div>

              <div className="service-editor-fields service-editor-fields-2">
                <div className="field-group">
                  <label>Servicio madre</label>
                  <select
                    className="admin-input servicio"
                    value={categoriaId}
                    onChange={(e) => setCategoriaId(e.target.value)}
                  >
                    <option value="">Elegí una categoría</option>
                    {categorias.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field-group">
                  <label>Subservicio</label>
                  <input
                    className="admin-input servicio"
                    value={nombreServicio}
                    onChange={(e) => setNombreServicio(e.target.value)}
                  />
                </div>

                <div className="field-group">
                  <label>Profesional</label>
                  <input
                    className="admin-input profesional"
                    value={nombreProfesional}
                    onChange={(e) => setNombreProfesional(e.target.value)}
                  />
                </div>

                <div className="field-group">
                  <label>Descripción</label>
                  <input
                    className="admin-input profesional"
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                  />
                </div>
              </div>
            </section>

            {/* BLOQUE 2: CONFIGURACIÓN */}
            <section className="service-editor-block">
              <div className="service-editor-block-title">Configuración</div>

              <div className="service-editor-fields service-editor-fields-3">
                <div className="field-group">
                  <label>Duración (min)</label>
                  <input
                    type="number"
                    className="admin-input duracion"
                    value={duracion}
                    onChange={(e) => setDuracion(e.target.value)}
                    min={1}
                  />
                </div>

                <div className="field-group">
                  <label>Precio</label>
                  <input
                    type="number"
                    className="admin-input precio-admin"
                    value={precio}
                    onChange={(e) => setPrecio(e.target.value)}
                    min={0}
                  />
                </div>

                <div className="field-group">
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
              </div>
            </section>

            {/* BLOQUE 3: SEÑA */}
            <section className="service-editor-block">
              <div className="service-editor-block-title">Reserva y pago</div>

              <div className="service-editor-fields service-editor-fields-2">
                <div className="field-group">
                  <label>¿Pedir seña?</label>
                  <label className="checkbox-inline text-muted service-check-row">
                    <input
                      type="checkbox"
                      checked={pedirAnticipo}
                      onChange={(e) => setPedirAnticipo(e.target.checked)}
                    />
                    {pedirAnticipo ? "Solicitando seña" : "No pedir seña"}
                  </label>
                </div>

                <div className="field-group">
                  <label>Porcentaje seña</label>
                  <input
                    type="number"
                    className="admin-input seña"
                    value={porcentajeAnticipo}
                    onChange={(e) => setPorcentajeAnticipo(e.target.value)}
                    min={5}
                    max={100}
                    disabled={!pedirAnticipo}
                  />
                </div>
              </div>
            </section>

            {/* BLOQUE 4: AGENDA */}
            <section className="service-editor-block service-editor-block-full">
              <div className="service-editor-block-title">
                Agenda del servicio
              </div>

              <div className="service-editor-fields service-editor-fields-1">
                <div className="field-group service-field-sm">
                  <label>Anticipación máxima (días)</label>
                  <input
                    type="number"
                    className="admin-input"
                    value={agendaMaxDias}
                    onChange={(e) => setAgendaMaxDias(e.target.value)}
                    min={1}
                    max={180}
                  />
                </div>
              </div>

              <HorariosServicioEditor
                horarios={horariosServicio}
                setHorarios={setHorariosServicio}
              />
            </section>

            {/* BLOQUE 5: GABINETES */}
            <section className="service-editor-block service-editor-block-full">
              <div className="service-editor-block-title">
                Gabinetes asignados
              </div>

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
            </section>
          </div>

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

  const [categorias, setCategorias] = useState([]);
  const [categoriaId, setCategoriaId] = useState("");

  const [nombreServicio, setNombreServicio] = useState("");
  const [nombreProfesional, setNombreProfesional] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [duracion, setDuracion] = useState(60);
  const [precio, setPrecio] = useState(0);
  const [modoReserva, setModoReserva] = useState("reserva");
  const [pedirAnticipo, setPedirAnticipo] = useState(false);
  const [porcentajeAnticipo, setPorcentajeAnticipo] = useState(50);
  const [agendaMaxDias, setAgendaMaxDias] = useState(7);
  const [horariosServicio, setHorariosServicio] = useState(
    crearHorariosServicioBase(),
  );

  const [seleccionados, setSeleccionados] = useState([]);
  const [abierto, setAbierto] = useState(true);

  // Categorías (catálogo)
  useEffect(() => {
    return onSnapshot(collection(db, "categorias_servicio"), (snap) => {
      const data = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((c) => c.activo)
        .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
      setCategorias(data);
    });
  }, []);

  // Gabinetes
  useEffect(() => {
    return onSnapshot(collection(db, "gabinetes"), (snap) => {
      setGabinetes(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((g) => g.activo),
      );
    });
  }, []);

  // Servicios
  useEffect(() => {
    return onSnapshot(collection(db, "servicios"), (snap) => {
      const data = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      data.sort((a, b) =>
        (a.nombreServicio || "").localeCompare(b.nombreServicio || ""),
      );
      setServicios(data);
    });
  }, []);

  function toggleGabinete(id) {
    setSeleccionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function crearServicio() {
    if (!nombreServicio.trim()) return alert("El servicio necesita nombre");
    if (!categoriaId) return alert("Debes elegir una categoria de servicio");
    if (seleccionados.length === 0)
      return alert("Debe tener al menos un gabinete");

    const yaExisteActivo = servicios.some(
      (s) =>
        s.activo &&
        normalizar(s.nombreServicio) === normalizar(nombreServicio) &&
        (s.categoriaId || "") === categoriaId,
    );

    if (yaExisteActivo)
      return alert(
        "Ya existe un subservicio activo con ese nombre en ese servicio madre",
      );

    if (Number(duracion) <= 0) return alert("Duración inválida");
    if (Number(precio) < 0) return alert("Precio inválido");

    if (!tieneHorariosServicioValidos(horariosServicio)) {
      return alert(
        "Revisá los horarios del servicio. Cada día activo debe tener al menos una franja válida.",
      );
    }

    const cat = categorias.find((c) => c.id === categoriaId);
    if (!cat) return alert("Categoría inválida");
    const categoriaNombre = (cat.nombre || "").trim();

    await addDoc(collection(db, "servicios"), {
      categoriaId,
      categoriaNombre,
      categoriaNombreNormalizado: normalizar(categoriaNombre),

      nombreServicio: nombreServicio.trim(),
      nombreServicioNormalizado: normalizar(nombreServicio),
      nombreProfesional: nombreProfesional.trim(),
      descripcion,
      duracionMin: Number(duracion),
      precio: Number(precio),
      modoReserva,
      pedirAnticipo,
      porcentajeAnticipo: pedirAnticipo ? Number(porcentajeAnticipo) : null,
      agendaMaxDias: Math.max(1, Number(agendaMaxDias || 7)),
      horariosServicio: serializarHorariosServicio(horariosServicio),

      gabinetes: seleccionados
        .map((id) => {
          const g = gabinetes.find((x) => x.id === id);
          if (!g) return null;
          return { id: g.id, nombreGabinete: g.nombreGabinete ?? "" };
        })
        .filter(Boolean),

      activo: true,
      creadoEn: serverTimestamp(),
    });

    setCategoriaId("");
    setNombreServicio("");
    setNombreProfesional("");
    setDescripcion("");
    setDuracion(60);
    setPrecio(0);
    setModoReserva("reserva");
    setPedirAnticipo(false);
    setPorcentajeAnticipo(50);
    setAgendaMaxDias(14);
    setHorariosServicio(crearHorariosServicioBase());
    setSeleccionados([]);
  }

  return (
    <div className="admin-panel servicios-admin-page">
      <div className="admin-title servicios-page-title">Servicios</div>

      <div className="servicios-admin-layout">
        <section className="servicios-admin-section servicios-admin-section-categorias">
          <CategoriasServiciosPanel />
        </section>

        <section className="servicios-admin-section servicios-admin-section-form">
          <div className="admin-panel-container servicios-panel-card">
            <div className="admin-categorias-header servicios-section-header">
              <div>
                <h5 className="fw-bold mb-1">Nuevo servicio</h5>
                <p className="servicios-section-desc mb-0">
                  Configurá categoría, datos, seña, agenda y gabinetes.
                </p>
              </div>
            </div>

            <div className="admin-servicios-create servicios-form-shell">
              <div className="servicios-form-block">
                <div className="servicios-form-block-title">
                  Datos principales
                </div>

                <div className="admin-row form-servicio-grid servicios-form-grid">
                  <div className="form-field">
                    <label className="admin-label">Servicio madre</label>
                    <select
                      className="admin-input servicio"
                      value={categoriaId}
                      onChange={(e) => setCategoriaId(e.target.value)}
                    >
                      <option value="">Elegí una categoría</option>
                      {categorias.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-field">
                    <label className="admin-label">Subservicio</label>
                    <input
                      className="admin-input servicio"
                      placeholder="Ej: Masajes deportivos"
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
                      min={1}
                    />
                  </div>

                  <div className="form-field">
                    <label>Precio</label>
                    <input
                      className="admin-input precio-admin"
                      type="number"
                      value={precio}
                      onChange={(e) => setPrecio(e.target.value)}
                      min={0}
                    />
                  </div>

                  <div className="form-field">
                    <label>Modo de reserva</label>
                    <select
                      className="admin-input reserva"
                      value={modoReserva}
                      onChange={(e) => setModoReserva(e.target.value)}
                    >
                      <option value="automatico">
                        Confirmación automática
                      </option>
                      <option value="reserva">Requiere aprobación</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="servicios-form-block">
                <div className="servicios-form-block-title">Reserva y pago</div>
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
                      {pedirAnticipo ? "Solicitando seña" : "No pedir seña"}
                    </label>
                  </div>

                  <div className="field-group">
                    <label>Porcentaje seña</label>
                    <input
                      type="number"
                      className="admin-input anticipo"
                      value={porcentajeAnticipo}
                      onChange={(e) => setPorcentajeAnticipo(e.target.value)}
                      min={5}
                      max={100}
                      disabled={!pedirAnticipo}
                    />
                  </div>
                </div>
              </div>

              <div className="servicios-form-block">
                <div className="servicios-form-block-title">
                  Agenda del servicio
                </div>
                {/* GABINETES */}
                <div className="form-field">
                  <label>Anticipación máxima (días)</label>
                  <input
                    className="admin-input"
                    type="number"
                    value={agendaMaxDias}
                    onChange={(e) => setAgendaMaxDias(e.target.value)}
                    min={1}
                    max={180}
                  />
                </div>

                <HorariosServicioEditor
                  horarios={horariosServicio}
                  setHorarios={setHorariosServicio}
                />
              </div>

              <div className="servicios-form-block">
                <div className="servicios-form-block-title">Gabinetes</div>

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
              </div>

              <div className="servicios-form-actions-wrap">
                <div className="form-field button-field">
                  <button className="swal-btn-agregar" onClick={crearServicio}>
                    Crear servicio
                  </button>
                </div>
              </div>
            </div>

            <div
              className="admin-categorias-sub mt-5"
              onClick={() => setAbierto(!abierto)}
            >
              <h6 className="fw-bold">
                SERVICIOS CREADOS ({servicios.length})
                <span className="collapse-icon">{abierto ? "▾" : "▸"}</span>
              </h6>
            </div>
            {abierto && (
              <>
                <section className="admin-servicios-create">
                  <div className="">
                    {Object.entries(
                      servicios.reduce((acc, servicio) => {
                        const categoria = getCategoriaLabel(servicio);
                        if (!acc[categoria]) acc[categoria] = [];
                        acc[categoria].push(servicio);
                        return acc;
                      }, {}),
                    )
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([categoria, items]) => (
                        <div
                          key={categoria}
                          className="servicios-categoria-bloque"
                        >
                          <div className="servicios-categoria-header">
                            <h6 className="fw-bold mb-0">{categoria}</h6>
                            <span className="servicios-categoria-count">
                              {items.length}
                            </span>
                          </div>
                          {items
                            .sort((a, b) =>
                              (a.nombreServicio || "").localeCompare(
                                b.nombreServicio || "",
                              ),
                            )
                            .map((s) => (
                              <ServicioItem
                                key={s.id}
                                servicio={s}
                                gabinetes={gabinetes}
                              />
                            ))}
                        </div>
                      ))}
                  </div>
                </section>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

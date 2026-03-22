// --------------------------------------------------
// ServiciosPanel.jsx — LIMPIO (SIN HORARIOS)
// --------------------------------------------------

import { useEffect, useState } from "react";
import { db, storage } from "../../../Firebase.js";
import {
  collection,
  addDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  doc,
  getDocs,
  deleteField,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

import { getFunctions, httpsCallable } from "firebase/functions";
import CategoriasServiciosPanel from "./CategoriasServiciosPanel";
import { hideLoading, showLoading } from "../../../services/loadingService.js";
import {
  swalConfirmDanger,
  swalError,
  swalSuccess,
} from "../../../public/utils/swalUtils.js";

function normalizar(str) {
  return str.trim().toLowerCase();
}

function normalizarFechaAgendaDesde(value) {
  const text = String(value || "").trim();
  if (!text || text === "null" || text === "undefined") return "";
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
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

function getPrecioEfectivo(servicio) {
  const precio = Number(servicio?.precio || 0);
  const precioEfectivo = Number(servicio?.precioEfectivo || 0);

  if (precioEfectivo > 0 && precioEfectivo < precio) {
    return precioEfectivo;
  }

  return 0;
}

function getServicioImageUrl(servicio = {}) {
  return String(servicio?.imagenUrl || "").trim();
}

function crearNombreArchivoServicio(file) {
  const baseName = String(file?.name || "servicio")
    .replace(/\s+/g, "_")
    .replace(/[^\w.-]/g, "");

  return `${Date.now()}_${baseName || "servicio"}`;
}

async function subirImagenServicio(file) {
  if (!file) return "";

  const nombreArchivo = crearNombreArchivoServicio(file);
  const storageRef = ref(storage, `servicios/${nombreArchivo}`);

  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

function leerArchivoComoDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () =>
      reject(new Error("No se pudo leer la imagen seleccionada."));

    reader.readAsDataURL(file);
  });
}

function crearItemPrecioVariableBase() {
  return {
    nombre: "",
    monto: 0,
    activo: true,
  };
}

function normalizarItemsPrecioVariable(lista = []) {
  if (!Array.isArray(lista)) return [];

  return lista.map((item) => ({
    nombre: String(item?.nombre || "").trim(),
    monto: Math.max(0, Number(item?.monto || 0)),
    activo: item?.activo !== false,
  }));
}

function serializarItemsPrecioVariable(lista = []) {
  return normalizarItemsPrecioVariable(lista).filter(
    (item) => item.nombre && Number(item.monto) > 0,
  );
}

function tieneItemsPrecioVariableValidos(lista = []) {
  return serializarItemsPrecioVariable(lista).length > 0;
}

function getResumenPrecioVariable(servicio = {}) {
  const items = serializarItemsPrecioVariable(
    servicio.itemsPrecioVariable || [],
  );
  if (!items.length) return "Sin adicionales configurados";

  return items
    .map(
      (item) =>
        `${item.nombre} +$${Number(item.monto).toLocaleString("es-AR")}`,
    )
    .join(" · ");
}

function servicioTienePrecioVariableActivo(servicio = {}) {
  return (
    Boolean(servicio?.precioVariable) &&
    serializarItemsPrecioVariable(servicio.itemsPrecioVariable || []).length > 0
  );
}

function getPrecioVariableModo(servicio = {}) {
  return servicio?.precioVariableModo === "single" ? "single" : "multiple";
}

function getPrecioVariableModoLabel(servicio = {}) {
  return getPrecioVariableModo(servicio) === "single"
    ? "Un adicional"
    : "Varios adicionales";
}

function getModoReservaServicio(servicio = {}) {
  const modo = String(servicio?.modoReserva || "")
    .trim()
    .toLowerCase();
  return modo === "reserva" ? "reserva" : "automatico";
}

function getModoReservaLabel(servicio = {}) {
  return getModoReservaServicio(servicio) === "reserva"
    ? "Requiere aprobación"
    : "Confirmación automática";
}

function getTipoServicioReserva(servicio = {}) {
  return Boolean(servicio?.esPack) ? "pack" : "individual";
}

function getTipoServicioReservaLabel(servicio = {}) {
  return getTipoServicioReserva(servicio) === "pack"
    ? "Pack de turnos"
    : "Turno individual";
}

function getPackCantidadTurnos(servicio = {}) {
  const cantidad = Number(servicio?.packCantidadTurnos || 1);
  return Math.max(2, cantidad);
}

function getPackFrecuenciaDias(servicio = {}) {
  const frecuencia = Number(servicio?.packFrecuenciaDias || 7);
  return Math.max(1, frecuencia);
}

function getAgendaMinimaSugeridaPack(cantidadTurnos = 2, frecuenciaDias = 7) {
  const cantidad = Math.max(2, Number(cantidadTurnos || 2));
  const frecuencia = Math.max(1, Number(frecuenciaDias || 1));
  return frecuencia * (cantidad + 1);
}

function getServicioDupKey({ nombreServicio, categoriaId, profesionalId }) {
  return [
    normalizar(nombreServicio || ""),
    String(categoriaId || "").trim(),
    String(profesionalId || "").trim(),
  ].join("::");
}

function showError(text) {
  return swalError({ text });
}

function confirmDanger(config) {
  return swalConfirmDanger(config);
}

function getEmpleadoRoleLabel(empleado) {
  const nivel = Number(empleado?.nivel || 0);

  if (nivel === 4) return "Dueño";
  if (nivel === 3) return "Admin";
  if (nivel === 2) return "Caja";
  if (nivel === 1) return "Profesional";
  return "Equipo";
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

const AGENDA_TIPOS = [
  { value: "semanal", label: "Semanal" },
  { value: "mensual", label: "Dias especificos del mes" },
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

function tieneAgendaSemanalConfigurada(lista = []) {
  return serializarHorariosServicio(lista).some(
    (horario) =>
      horario.activo &&
      Array.isArray(horario.franjas) &&
      horario.franjas.length > 0,
  );
}

function crearAgendaMensualBase() {
  return [];
}

function normalizarAgendaMensual(lista = []) {
  if (!Array.isArray(lista)) return [];

  return lista
    .map((item) => ({
      diaMes: Math.min(31, Math.max(1, Number(item?.diaMes || 1))),
      activo: item?.activo !== false,
      franjas: normalizarFranjas(item?.franjas),
    }))
    .sort((a, b) => Number(a.diaMes) - Number(b.diaMes));
}

function serializarAgendaMensual(lista = []) {
  return normalizarAgendaMensual(lista).map((item) => ({
    diaMes: Math.min(31, Math.max(1, Number(item?.diaMes || 1))),
    activo: item?.activo !== false,
    franjas: item.activo
      ? (item.franjas || [])
          .map((f) => ({
            desde: f?.desde || "09:00",
            hasta: f?.hasta || "18:00",
          }))
          .filter((f) => f.desde && f.hasta && f.desde < f.hasta)
      : [],
  }));
}

function tieneAgendaMensualValida(lista = []) {
  const serializada = serializarAgendaMensual(lista);
  if (!serializada.length) return false;

  return serializada.every(
    (item) =>
      Number(item.diaMes) >= 1 &&
      Number(item.diaMes) <= 31 &&
      (!item.activo || item.franjas.length > 0),
  );
}

function getAgendaTipoServicio(servicio = {}) {
  if (servicio?.agendaTipo === "mensual") return "mensual";
  if (Array.isArray(servicio?.agendaMensual) && servicio.agendaMensual.length) {
    return "mensual";
  }
  return "semanal";
}

function getAgendaMensualModoServicio(servicio = {}) {
  const modo = String(servicio?.agendaMensualModo || "mes_actual");
  return modo === "mes_siguiente" ? "mes_siguiente" : "mes_actual";
}

function getAgendaMensualRepiteMesSiguiente(servicio = {}) {
  return Boolean(servicio?.agendaMensualRepiteMesSiguiente);
}

function getAgendaMensualMesOffset(servicio = {}) {
  return getAgendaMensualModoServicio(servicio) === "mes_siguiente" ? 1 : 0;
}

function getMesAgendaLabel(mesOffset = 0) {
  const fecha = new Date();
  fecha.setMonth(fecha.getMonth() + Number(mesOffset || 0));
  return String(fecha.getMonth() + 1).padStart(2, "0");
}

function getMesAgendaNombre(mesOffset = 0) {
  const fecha = new Date();
  fecha.setMonth(fecha.getMonth() + Number(mesOffset || 0));
  return fecha.toLocaleDateString("es-AR", { month: "long" });
}

function servicioMensualSinFechasPendientes(servicio = {}) {
  if (getAgendaTipoServicio(servicio) !== "mensual") return false;

  const agendaMensual = serializarAgendaMensual(
    servicio.agendaMensual || [],
  ).filter((item) => item.activo && item.franjas.length);

  const hoy = new Date();
  const mesOffset = getAgendaMensualMesOffset(servicio);
  const mesesARevisar = [mesOffset];

  if (getAgendaMensualRepiteMesSiguiente(servicio)) {
    mesesARevisar.push(mesOffset + 1);
  }

  return !mesesARevisar.some((offset) =>
    agendaMensual.some((item) => {
      const fechaItem = new Date(
        hoy.getFullYear(),
        hoy.getMonth() + offset,
        Number(item.diaMes || 1),
      );
      fechaItem.setHours(23, 59, 59, 999);
      return fechaItem >= hoy;
    }),
  );
}

function formatDiaMesLabel(diaMes, repetirMesSiguiente = false, mesOffset = 0) {
  return repetirMesSiguiente
    ? `${diaMes} de cada mes`
    : `${diaMes} / ${getMesAgendaLabel(mesOffset)}`;
}

function compactarDiasMes(dias = []) {
  return [...new Set(dias)]
    .map((dia) => Number(dia))
    .filter((dia) => Number.isFinite(dia) && dia >= 1 && dia <= 31)
    .sort((a, b) => a - b)
    .join(", ");
}

function getAgendaMensualToggleLabel(
  agendaMensual = [],
  repetirMesSiguiente = false,
) {
  if (!repetirMesSiguiente) {
    return "Repetir estas mismas fechas en el mes siguiente";
  }

  const dias = compactarDiasMes(
    (agendaMensual || []).map((item) => Number(item?.diaMes || 0)),
  );

  if (!dias) {
    return "Repetir estas mismas fechas X de cada mes";
  }

  return `Repetir estas mismas fechas: ${dias} de cada mes`;
}

function getResumenAgendaServicio(servicio = {}) {
  const agendaTipo = getAgendaTipoServicio(servicio);

  if (agendaTipo === "mensual") {
    const agendaMensual = serializarAgendaMensual(servicio.agendaMensual || []);
    if (!agendaMensual.length) return "Sin agenda mensual configurada";
    const mesOffset = getAgendaMensualMesOffset(servicio);

    const gruposPorRango = new Map();

    agendaMensual.forEach((item) => {
      (item.franjas || []).forEach((franja) => {
        const key = `${franja.desde}-${franja.hasta}`;
        if (!gruposPorRango.has(key)) gruposPorRango.set(key, []);
        gruposPorRango.get(key).push(Number(item.diaMes));
      });
    });

    return Array.from(gruposPorRango.entries())
      .map(([rango, dias]) => {
        const [desde, hasta] = rango.split("-");
        return `Dias ${compactarDiasMes(dias)} / ${getMesAgendaLabel(mesOffset)} ${desde}-${hasta}`;
      })
      .join(" · ");
  }

  const horarios = serializarHorariosServicio(
    servicio.horariosServicio || [],
  ).filter((item) => item.activo && item.franjas.length);

  if (!horarios.length) return "Sin agenda semanal configurada";

  return horarios
    .map((item) => {
      const dia = DIAS_SEMANA.find((d) => d.value === Number(item.diaSemana));
      const rangos = item.franjas.map(
        (franja) => `${franja.desde}-${franja.hasta}`,
      );
      return `${dia?.label || "Dia"} ${rangos.join(", ")}`;
    })
    .join(" · ");
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
                  {" "}
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
                  Sumar horario
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
                        X
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

function AgendaMensualEditor({
  agendaMensual,
  setAgendaMensual,
  agendaMensualModo,
  setAgendaMensualModo,
  repetirMesSiguiente,
  setRepetirMesSiguiente,
}) {
  function agregarDiaMes() {
    setAgendaMensual((prev) => [
      ...prev,
      {
        diaMes: 1,
        activo: true,
        franjas: [crearFranjaBase()],
      },
    ]);
  }

  function updateDia(index, patch) {
    setAgendaMensual((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  }

  function updateFranja(index, franjaIndex, patch) {
    setAgendaMensual((prev) =>
      prev.map((item, itemIndex) => {
        if (itemIndex !== index) return item;

        return {
          ...item,
          franjas: (item.franjas || []).map((franja, currentIndex) =>
            currentIndex === franjaIndex ? { ...franja, ...patch } : franja,
          ),
        };
      }),
    );
  }

  function agregarFranja(index) {
    setAgendaMensual((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              activo: true,
              franjas: [...(item.franjas || []), crearFranjaBase()],
            }
          : item,
      ),
    );
  }

  function eliminarFranja(index, franjaIndex) {
    setAgendaMensual((prev) =>
      prev.map((item, itemIndex) => {
        if (itemIndex !== index) return item;

        const nuevasFranjas = (item.franjas || []).filter(
          (_, currentIndex) => currentIndex !== franjaIndex,
        );

        return {
          ...item,
          franjas: nuevasFranjas.length ? nuevasFranjas : [crearFranjaBase()],
        };
      }),
    );
  }

  function eliminarDia(index) {
    setAgendaMensual((prev) =>
      prev.filter((_, itemIndex) => itemIndex !== index),
    );
  }

  return (
    <div>
      <div className="agenda-tipo-header">
        <label className="horarios-servicio-label mt-3 mb-0">
          Agenda mensual del servicio
        </label>

        <button
          type="button"
          className="swal-btn-editar btn-editar-nombre"
          onClick={agregarDiaMes}
        >
          Añadir dia del mes
        </button>
      </div>

      <div className="field-group service-field-sm">
        <label>Mes de agenda</label>
        <select
          className="admin-input"
          value={agendaMensualModo}
          onChange={(e) => setAgendaMensualModo(e.target.value)}
        >
          <option value="mes_actual">
            Mes actual ({getMesAgendaNombre(0)})
          </option>
          <option value="mes_siguiente">
            Mes siguiente ({getMesAgendaNombre(1)})
          </option>
        </select>
      </div>

      <label className="checkbox-inline text-muted service-check-row agenda-repeat-toggle">
        <input
          type="checkbox"
          checked={repetirMesSiguiente}
          onChange={(e) => setRepetirMesSiguiente(e.target.checked)}
        />
        {getAgendaMensualToggleLabel(agendaMensual, repetirMesSiguiente)}
      </label>

      {!agendaMensual.length ? (
        <div className="horario-dia-inactivo">
          Añadir 1, 2 o 3 dias del mes con sus horarios. Ejemplo: 5, 15 y 25.
        </div>
      ) : (
        <div className="service-horarios-servicio">
          {agendaMensual.map((item, index) => (
            <div
              key={`${item.diaMes}-${index}`}
              className="horario-dia-card horario-dia-card-mensual"
            >
              <div className="horario-dia-header">
                <div className="agenda-mensual-dia-head">
                  <label>Dia del mes</label>
                  <input
                    type="number"
                    className="admin-input agenda-dia-mes-input"
                    min={1}
                    max={31}
                    value={item.diaMes}
                    onChange={(e) =>
                      updateDia(index, { diaMes: Number(e.target.value || 1) })
                    }
                  />
                  <small>
                    {formatDiaMesLabel(
                      item.diaMes,
                      repetirMesSiguiente,
                      agendaMensualModo === "mes_siguiente" ? 1 : 0,
                    )}
                  </small>
                </div>

                <button
                  type="button"
                  className="swal-btn-eliminar horario-btn-quitar"
                  onClick={() => eliminarDia(index)}
                >
                  X
                </button>
              </div>

              <div className="horario-dia-header">
                <label className="checkbox-inline text-muted horario-dia-check">
                  <input
                    type="checkbox"
                    checked={item.activo}
                    onChange={(e) =>
                      updateDia(index, { activo: e.target.checked })
                    }
                  />
                  Disponible
                </label>

                <button
                  type="button"
                  className="swal-btn-editar btn-editar-nombre"
                  onClick={() => agregarFranja(index)}
                  disabled={!item.activo}
                >
                  Sumar horario
                </button>
              </div>

              {!item.activo ? (
                <div className="horario-dia-inactivo">
                  Este dia del mes no ofrece turnos
                </div>
              ) : (
                <div className="horario-franjas-list">
                  {(item.franjas || []).map((franja, franjaIndex) => (
                    <div
                      key={`${item.diaMes}-${index}-${franjaIndex}`}
                      className="horario-franja-row"
                    >
                      <input
                        type="time"
                        className="admin-input horario-franja-input"
                        value={franja.desde}
                        onChange={(e) =>
                          updateFranja(index, franjaIndex, {
                            desde: e.target.value,
                          })
                        }
                      />

                      <input
                        type="time"
                        className="admin-input horario-franja-input"
                        value={franja.hasta}
                        onChange={(e) =>
                          updateFranja(index, franjaIndex, {
                            hasta: e.target.value,
                          })
                        }
                      />

                      <button
                        type="button"
                        className="swal-btn-eliminar horario-btn-quitar"
                        onClick={() => eliminarFranja(index, franjaIndex)}
                        disabled={(item.franjas || []).length <= 1}
                      >
                        X
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PrecioVariableEditor({
  precioVariable,
  setPrecioVariable,
  precioVariableModo,
  setPrecioVariableModo,
  itemsPrecioVariable,
  setItemsPrecioVariable,
}) {
  function agregarItem() {
    setItemsPrecioVariable((prev) => [...prev, crearItemPrecioVariableBase()]);
  }

  function updateItem(index, patch) {
    setItemsPrecioVariable((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  }

  function eliminarItem(index) {
    setItemsPrecioVariable((prev) =>
      prev.filter((_, itemIndex) => itemIndex !== index),
    );
  }

  return (
    <div className="service-variable-shell">
      <label className="checkbox-inline text-muted service-check-row">
        <input
          type="checkbox"
          checked={precioVariable}
          onChange={(e) => setPrecioVariable(e.target.checked)}
        />
        Este servicio tiene precio variable con adicionales
      </label>

      {precioVariable && (
        <div className="service-variable-box">
          <div className="field-group service-field-sm">
            <label>Seleccion de adicionales</label>
            <select
              className="admin-input reserva"
              value={precioVariableModo}
              onChange={(e) => setPrecioVariableModo(e.target.value)}
            >
              <option value="multiple">Permitir varios items</option>
              <option value="single">Permitir solo uno</option>
            </select>
          </div>

          <div className="agenda-tipo-header">
            <label className="horarios-servicio-label mb-0">
              Items que suman al valor total
            </label>

            <button
              type="button"
              className="swal-btn-editar btn-editar-nombre"
              onClick={agregarItem}
            >
              Anadir item
            </button>
          </div>

          {!itemsPrecioVariable.length ? (
            <div className="horario-dia-inactivo">
              Crea opciones como diseno simple, nail art o piedras.
            </div>
          ) : (
            <div className="service-variable-list">
              {itemsPrecioVariable.map((item, index) => (
                <div
                  key={`item-variable-${index}`}
                  className="service-variable-row"
                >
                  <input
                    className="admin-input"
                    placeholder="Nombre del item"
                    value={item.nombre}
                    onChange={(e) =>
                      updateItem(index, { nombre: e.target.value })
                    }
                  />

                  <input
                    type="number"
                    min={0}
                    className="admin-input precio-admin"
                    placeholder="Monto"
                    value={item.monto}
                    onChange={(e) =>
                      updateItem(index, { monto: Number(e.target.value || 0) })
                    }
                  />

                  <label className="checkbox-inline text-muted service-variable-check">
                    <input
                      type="checkbox"
                      checked={item.activo}
                      onChange={(e) =>
                        updateItem(index, { activo: e.target.checked })
                      }
                    />
                    Activo
                  </label>

                  <button
                    type="button"
                    className="swal-btn-eliminar horario-btn-quitar"
                    onClick={() => eliminarItem(index)}
                  >
                    X
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AgendaCadaXDiasEditor({ agendaCadaXDias, setAgendaCadaXDias }) {
  function updateAgenda(patch) {
    setAgendaCadaXDias((prev) => ({ ...prev, ...patch }));
  }

  function updateFranja(index, patch) {
    setAgendaCadaXDias((prev) => ({
      ...prev,
      franjas: (prev?.franjas || []).map((franja, currentIndex) =>
        currentIndex === index ? { ...franja, ...patch } : franja,
      ),
    }));
  }

  function agregarFranja() {
    setAgendaCadaXDias((prev) => ({
      ...prev,
      franjas: [...(prev?.franjas || []), crearFranjaBase()],
    }));
  }

  function eliminarFranja(index) {
    setAgendaCadaXDias((prev) => {
      const nuevasFranjas = (prev?.franjas || []).filter(
        (_, currentIndex) => currentIndex !== index,
      );

      return {
        ...prev,
        franjas: nuevasFranjas.length ? nuevasFranjas : [crearFranjaBase()],
      };
    });
  }

  return (
    <div>
      <label className="horarios-servicio-label mt-3">Agenda automatica</label>

      <div className="agenda-cada-xdias-grid">
        <div className="field-group service-field-sm">
          <label>Cada cuantos dias</label>
          <input
            type="number"
            min={1}
            className="admin-input"
            value={agendaCadaXDias.intervaloDias}
            onChange={(e) =>
              updateAgenda({ intervaloDias: Number(e.target.value || 1) })
            }
          />
        </div>

        <div className="field-group">
          <label>Fecha de inicio</label>
          <input
            type="date"
            className="admin-input"
            value={agendaCadaXDias.fechaInicio}
            onChange={(e) => updateAgenda({ fechaInicio: e.target.value })}
          />
        </div>
      </div>

      <div className="agenda-tipo-header">
        <label className="horarios-servicio-label mt-3 mb-0">
          Horarios de cada repeticion
        </label>

        <button
          type="button"
          className="swal-btn-editar btn-editar-nombre"
          onClick={agregarFranja}
        >
          AÃ±adir horario
        </button>
      </div>

      <div className="horario-franjas-list agenda-cada-xdias-franjas">
        {(agendaCadaXDias.franjas || []).map((franja, index) => (
          <div key={`cada-x-${index}`} className="horario-franja-row">
            <input
              type="time"
              className="admin-input horario-franja-input"
              value={franja.desde}
              onChange={(e) =>
                updateFranja(index, {
                  desde: e.target.value,
                })
              }
            />

            <input
              type="time"
              className="admin-input horario-franja-input"
              value={franja.hasta}
              onChange={(e) =>
                updateFranja(index, {
                  hasta: e.target.value,
                })
              }
            />

            <button
              type="button"
              className="swal-btn-eliminar horario-btn-quitar"
              onClick={() => eliminarFranja(index)}
              disabled={(agendaCadaXDias.franjas || []).length <= 1}
            >
              X
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AgendaServicioEditor({
  agendaTipo,
  setAgendaTipo,
  agendaMaxDias,
  setAgendaMaxDias,
  agendaDisponibleDesde,
  setAgendaDisponibleDesde,
  horariosServicio,
  setHorariosServicio,
  agendaMensual,
  setAgendaMensual,
  agendaMensualModo,
  setAgendaMensualModo,
  repetirMesSiguiente,
  setRepetirMesSiguiente,
}) {
  return (
    <div className="agenda-tipo-shell">
      <div className="service-agenda-toprow">
        <div className="field-group service-field-sm">
          <label>Tipo de agenda</label>
          <select
            className="admin-input"
            value={agendaTipo}
            onChange={(e) => setAgendaTipo(e.target.value)}
          >
            {AGENDA_TIPOS.map((tipo) => (
              <option key={tipo.value} value={tipo.value}>
                {tipo.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field-group service-field-sm">
          <label>Habilitar agenda desde</label>
          <input
            type="date"
            className="admin-input"
            value={agendaDisponibleDesde}
            onChange={(e) =>
              setAgendaDisponibleDesde(
                normalizarFechaAgendaDesde(e.target.value),
              )
            }
          />
        </div>

        {agendaTipo !== "mensual" && (
          <div className="field-group service-field-sm">
            <label>Días a mostrar en la agenda</label>
            <input
              type="number"
              className="admin-input"
              value={agendaMaxDias}
              onChange={(e) => setAgendaMaxDias(e.target.value)}
              min={1}
              max={180}
            />
          </div>
        )}
      </div>

      {agendaTipo === "mensual" ? (
        <AgendaMensualEditor
          agendaMensual={agendaMensual}
          setAgendaMensual={setAgendaMensual}
          agendaMensualModo={agendaMensualModo}
          setAgendaMensualModo={setAgendaMensualModo}
          repetirMesSiguiente={repetirMesSiguiente}
          setRepetirMesSiguiente={setRepetirMesSiguiente}
        />
      ) : (
        <HorariosServicioEditor
          horarios={horariosServicio}
          setHorarios={setHorariosServicio}
        />
      )}
    </div>
  );
}

function getResumenHorarioGabinete(gabinete) {
  const horarios = Array.isArray(gabinete?.horarios) ? gabinete.horarios : [];

  const activos = horarios
    .filter(
      (h) =>
        h?.activo &&
        typeof h?.desde === "string" &&
        typeof h?.hasta === "string",
    )
    .sort((a, b) => {
      const diaA = Number(a?.diaSemana ?? 99);
      const diaB = Number(b?.diaSemana ?? 99);
      if (diaA !== diaB) return diaA - diaB;
      return String(a?.desde || "").localeCompare(String(b?.desde || ""));
    });

  if (!activos.length) return "Sin horarios configurados";

  const DIAS_LABEL = {
    0: "DO",
    1: "LU",
    2: "MA",
    3: "MI",
    4: "JU",
    5: "VI",
    6: "SÁ",
  };

  function compactarDias(dias = []) {
    const unicos = [...new Set(dias)].sort((a, b) => a - b);
    if (!unicos.length) return "";

    const grupos = [];
    let inicio = unicos[0];
    let fin = unicos[0];

    for (let i = 1; i < unicos.length; i++) {
      const actual = unicos[i];

      if (actual === fin + 1) {
        fin = actual;
      } else {
        grupos.push([inicio, fin]);
        inicio = actual;
        fin = actual;
      }
    }

    grupos.push([inicio, fin]);

    return grupos
      .map(([a, b]) => {
        if (a === b) return DIAS_LABEL[a] || `Día ${a}`;
        return `${DIAS_LABEL[a]} a ${DIAS_LABEL[b]}`;
      })
      .join(", ");
  }

  const gruposPorRango = new Map();

  activos.forEach((h) => {
    const key = `${h.desde}-${h.hasta}`;
    if (!gruposPorRango.has(key)) {
      gruposPorRango.set(key, []);
    }
    gruposPorRango.get(key).push(Number(h.diaSemana));
  });

  return Array.from(gruposPorRango.entries())
    .map(([rango, dias]) => {
      const [desde, hasta] = rango.split("-");
      const diasTexto = compactarDias(dias);

      return `${diasTexto} ${desde.slice(0, 2)} a ${hasta.slice(0, 2)}`;
    })
    .join(" · ");
}

// ===================================================
// ITEM EDITABLE
// ===================================================
function ServicioItem({ servicio, servicios, gabinetes, empleados }) {
  const [editando, setEditando] = useState(false);
  const empleadoVinculado =
    empleados.find((item) => item.id === servicio.profesionalId) || null;

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
  const [profesionalId, setProfesionalId] = useState(
    servicio.profesionalId || "",
  );
  const [descripcion, setDescripcion] = useState(servicio.descripcion || "");
  const [imagenUrl, setImagenUrl] = useState(getServicioImageUrl(servicio));
  const [imagenFile, setImagenFile] = useState(null);
  const [duracion, setDuracion] = useState(servicio.duracionMin);
  const [precio, setPrecio] = useState(servicio.precio);
  const [precioEfectivo, setPrecioEfectivo] = useState(
    servicio.precioEfectivo || 0,
  );
  const [precioVariable, setPrecioVariable] = useState(
    Boolean(servicio.precioVariable),
  );
  const [precioVariableModo, setPrecioVariableModo] = useState(
    getPrecioVariableModo(servicio),
  );
  const [itemsPrecioVariable, setItemsPrecioVariable] = useState(
    normalizarItemsPrecioVariable(servicio.itemsPrecioVariable || []),
  );
  const [responsableGestion, setResponsableGestion] = useState(
    servicio.responsableGestion || "admin",
  );
  const [tipoServicioReserva, setTipoServicioReserva] = useState(
    getTipoServicioReserva(servicio),
  );
  const [packCantidadTurnos, setPackCantidadTurnos] = useState(
    getPackCantidadTurnos(servicio),
  );
  const [packFrecuenciaDias, setPackFrecuenciaDias] = useState(
    getPackFrecuenciaDias(servicio),
  );
  const [modoReserva, setModoReserva] = useState(
    getModoReservaServicio(servicio),
  );

  const [pedirAnticipo, setPedirAnticipo] = useState(
    servicio.pedirAnticipo || true,
  );

  const [porcentajeAnticipo, setPorcentajeAnticipo] = useState(
    servicio.porcentajeAnticipo || 50,
  );

  const [agendaMaxDias, setAgendaMaxDias] = useState(
    Number(servicio.agendaMaxDias || 14),
  );
  const [agendaDisponibleDesde, setAgendaDisponibleDesde] = useState(
    normalizarFechaAgendaDesde(servicio.agendaDisponibleDesde),
  );
  const [agendaTipo, setAgendaTipo] = useState(getAgendaTipoServicio(servicio));
  const [agendaMensualModo, setAgendaMensualModo] = useState(
    getAgendaMensualModoServicio(servicio),
  );
  const agendaCadaXDias = null;
  const [agendaMensualRepiteMesSiguiente, setAgendaMensualRepiteMesSiguiente] =
    useState(getAgendaMensualRepiteMesSiguiente(servicio));

  const [horariosServicio, setHorariosServicio] = useState(
    normalizarHorariosServicio(servicio.horariosServicio || []),
  );
  const [agendaMensual, setAgendaMensual] = useState(
    normalizarAgendaMensual(servicio.agendaMensual || []),
  );

  const [seleccionados, setSeleccionados] = useState(
    servicio.gabinetes?.map((g) => g.id) ?? [],
  );
  const agendaMinimaSugeridaPack = getAgendaMinimaSugeridaPack(
    packCantidadTurnos,
    packFrecuenciaDias,
  );
  const packAgendaSugeridaInsuficiente =
    tipoServicioReserva === "pack" &&
    Number(agendaMaxDias || 0) < Number(agendaMinimaSugeridaPack || 0);

  function abrirEditor() {
    setCategoriaId(servicio.categoriaId || "");
    setNombreServicio(servicio.nombreServicio || "");
    setNombreProfesional(servicio.nombreProfesional || "");
    setProfesionalId(servicio.profesionalId || "");
    setDescripcion(servicio.descripcion || "");
    setImagenUrl(getServicioImageUrl(servicio));
    setImagenFile(null);
    setDuracion(servicio.duracionMin ?? 60);
    setPrecio(servicio.precio ?? 0);
    setPrecioEfectivo(servicio.precioEfectivo ?? 0);
    setPrecioVariable(Boolean(servicio.precioVariable));
    setPrecioVariableModo(getPrecioVariableModo(servicio));
    setItemsPrecioVariable(
      normalizarItemsPrecioVariable(servicio.itemsPrecioVariable || []),
    );
    setResponsableGestion(servicio.responsableGestion || "admin");
    setTipoServicioReserva(getTipoServicioReserva(servicio));
    setPackCantidadTurnos(getPackCantidadTurnos(servicio));
    setPackFrecuenciaDias(getPackFrecuenciaDias(servicio));
    setModoReserva(getModoReservaServicio(servicio));
    setPedirAnticipo(Boolean(servicio.pedirAnticipo));
    setPorcentajeAnticipo(servicio.porcentajeAnticipo ?? 50);
    setAgendaMaxDias(Number(servicio.agendaMaxDias || 14));
    setAgendaDisponibleDesde(
      normalizarFechaAgendaDesde(servicio.agendaDisponibleDesde),
    );
    setAgendaTipo(getAgendaTipoServicio(servicio));
    setAgendaMensualModo(getAgendaMensualModoServicio(servicio));
    setAgendaMensualRepiteMesSiguiente(
      getAgendaMensualRepiteMesSiguiente(servicio),
    );
    setHorariosServicio(
      normalizarHorariosServicio(servicio.horariosServicio || []),
    );
    setAgendaMensual(normalizarAgendaMensual(servicio.agendaMensual || []));
    setSeleccionados(servicio.gabinetes?.map((g) => g.id) ?? []);
    setEditando(true);
  }

  async function handleImagenChange(file) {
    if (!file) {
      setImagenFile(null);
      setImagenUrl(getServicioImageUrl(servicio));
      return;
    }

    setImagenFile(file);
    const previewUrl = await leerArchivoComoDataUrl(file);
    setImagenUrl(previewUrl);
  }

  function limpiarImagen() {
    setImagenFile(null);
    setImagenUrl("");
  }

  function toggleGabinete(id) {
    setSeleccionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function handleProfesionalChange(value) {
    setProfesionalId(value);

    const profesional = empleados.find((item) => item.id === value);
    if (profesional) {
      setNombreProfesional(profesional.nombre || profesional.email || "");
    }
  }

  async function guardarCambios() {
    if (!nombreServicio.trim()) return showError("El servicio necesita nombre");
    if (seleccionados.length === 0)
      return showError("Debe tener al menos un gabinete");

    if (!categoriaId) return showError("Debes elegir una categoría");
    const cat = categorias.find((c) => c.id === categoriaId);
    if (!cat) return showError("Categoría inválida");
    const categoriaNombre = (cat.nombre || "").trim();

    const yaExisteActivo = servicios.some(
      (item) =>
        item.id !== servicio.id &&
        item.activo &&
        getServicioDupKey(item) ===
          getServicioDupKey({
            nombreServicio,
            categoriaId,
            profesionalId,
          }),
    );

    if (yaExisteActivo) {
      return showError(
        "Ya existe un servicio activo con ese nombre para ese profesional en esta categoria",
      );
    }

    if (precio <= 0) return showError("Precio inválido");
    if (Number(precioEfectivo) < 0)
      return showError("Precio en efectivo inválido");
    if (
      Number(precioEfectivo) > 0 &&
      Number(precioEfectivo) >= Number(precio)
    ) {
      return showError(
        "El precio en efectivo debe ser menor al precio general o dejar vacio si no aplica.",
      );
    }
    if (responsableGestion === "profesional" && !profesionalId) {
      return showError(
        "Debes vincular un profesional si el servicio sera gestionado por profesionales",
      );
    }
    if (tipoServicioReserva === "pack" && Number(packCantidadTurnos) < 2) {
      return showError("En un pack la cantidad de turnos debe ser al menos 2.");
    }
    if (tipoServicioReserva === "pack" && Number(packFrecuenciaDias) < 1) {
      return showError("La frecuencia del pack debe ser de al menos 1 dia.");
    }
    if (
      tipoServicioReserva === "pack" &&
      agendaTipo !== "mensual" &&
      Number(agendaMaxDias || 0) < Number(agendaMinimaSugeridaPack || 0)
    ) {
      return showError(
        `Para este pack recomendamos al menos ${agendaMinimaSugeridaPack} dias de agenda maxima.`,
      );
    }
    if (
      precioVariable &&
      !tieneItemsPrecioVariableValidos(itemsPrecioVariable)
    ) {
      return showError(
        "Si activas precio variable, debes cargar al menos un adicional valido.",
      );
    }

    if (agendaTipo === "mensual" && !tieneAgendaMensualValida(agendaMensual)) {
      return showError(
        "RevisÃ¡ la agenda mensual. Debe haber al menos un dia del mes con una franja valida.",
      );
    }

    if (agendaTipo === "mensual" && !tieneAgendaMensualValida(agendaMensual)) {
      return showError(
        "RevisÃ¡ la agenda automatica. Debe tener fecha de inicio, intervalo y horarios validos.",
      );
    }

    if (
      agendaTipo === "mensual" &&
      agendaMensualModo === "mes_actual" &&
      !tieneAgendaMensualValida(agendaMensual)
    ) {
      return showError(
        "RevisÃ¡ la agenda mensual. Debe haber al menos un dia del mes con una franja vÃ¡lida.",
      );
    }

    if (
      agendaTipo !== "mensual" &&
      !tieneAgendaSemanalConfigurada(horariosServicio)
    ) {
      return showError("Sin agenda semanal configurada");
    }

    if (
      agendaTipo !== "mensual" &&
      !tieneHorariosServicioValidos(horariosServicio)
    ) {
      return showError(
        "Revisá los horarios del servicio. Cada día activo debe tener al menos una franja válida.",
      );
    }

    try {
      showLoading({
        title: "Guardando servicio",
        text: "Actualizando datos e imagen...",
      });

      const imagenServicioUrl =
        imagenFile != null
          ? await subirImagenServicio(imagenFile)
          : String(imagenUrl || "").trim();

      await updateDoc(doc(db, "servicios", servicio.id), {
        categoriaId,
        categoriaNombre,
        categoriaNombreNormalizado: normalizar(categoriaNombre),

        nombreServicio: nombreServicio.trim(),
        nombreServicioNormalizado: normalizar(nombreServicio),
        profesionalId: profesionalId || null,
        nombreProfesional: nombreProfesional.trim(),
        descripcion: descripcion,
        imagenUrl: imagenServicioUrl || null,
        duracionMin: Number(duracion),
        precio: Number(precio),
        precioEfectivo: Number(precioEfectivo || 0),
        precioVariable,
        precioVariableModo: precioVariable ? precioVariableModo : "multiple",
        itemsPrecioVariable: precioVariable
          ? serializarItemsPrecioVariable(itemsPrecioVariable)
          : [],
        responsableGestion,
        esPack: tipoServicioReserva === "pack",
        packCantidadTurnos:
          tipoServicioReserva === "pack"
            ? Math.max(2, Number(packCantidadTurnos || 2))
            : null,
        packFrecuenciaDias:
          tipoServicioReserva === "pack"
            ? Math.max(1, Number(packFrecuenciaDias || 1))
            : null,
        modoReserva,
        pedirAnticipo,
        porcentajeAnticipo: pedirAnticipo ? Number(porcentajeAnticipo) : null,
        agendaMaxDias: Math.max(1, Number(agendaMaxDias || 7)),
        agendaDisponibleDesde:
          normalizarFechaAgendaDesde(agendaDisponibleDesde) || null,
        agendaTipo,
        agendaMensualModo,
        horariosServicio: serializarHorariosServicio(horariosServicio),
        agendaMensual:
          agendaTipo === "mensual"
            ? serializarAgendaMensual(agendaMensual)
            : [],
        agendaMensualRepiteMesSiguiente,
        agendaCadaXDias: null,

        gabinetes: seleccionados
          .map((id) => {
            const g = gabinetes.find((x) => x.id === id);
            if (!g) return null;
            return { id: g.id, nombreGabinete: g.nombreGabinete ?? "" };
          })
          .filter(Boolean),

        actualizadoEn: serverTimestamp(),
        ...(servicio.activo
          ? {
              eliminadoEn: deleteField(),
              desactivadoPor: deleteField(),
            }
          : {}),
      });

      setEditando(false);
      await swalSuccess({
        title: "Servicio actualizado",
        text: "Los cambios se guardaron correctamente.",
      });
    } catch (error) {
      console.error("Error guardando servicio", error);
      await swalError({
        title: "No se pudo guardar",
        text: "Ocurrio un error al actualizar el servicio.",
      });
    } finally {
      hideLoading();
    }
  }

  async function desactivarServicio() {
    const confirmar = await confirmDanger({
      title: "Desactivar servicio",
      html: `Se desactivara <b>${servicio.nombreServicio}</b>.`,
      confirmText: "Desactivar",
    });
    if (!confirmar?.isConfirmed) return;

    try {
      showLoading({
        title: "Desactivando servicio",
        text: "Actualizando disponibilidad del servicio...",
      });
      const fn = httpsCallable(getFunctions(), "desactivarServicio");
      await fn({ servicioId: servicio.id });
      hideLoading();
      swalSuccess({
        title: "Servicio desactivado",
        text: "El servicio fue desactivado correctamente.",
      });
    } catch (e) {
      hideLoading();
      swalError({
        title: "No se pudo desactivar",
        text: e?.message || "Ocurrio un error al desactivar el servicio.",
      });
    }
  }

  async function eliminarServicio() {
    const confirmar = await confirmDanger({
      title: "Eliminar servicio",
      html: "Esta accion no se puede deshacer.",
      confirmText: "Eliminar",
    });
    if (!confirmar?.isConfirmed) return;

    try {
      showLoading({
        title: "Eliminando servicio",
        text: "Quitando el servicio del sistema...",
      });
      const fn = httpsCallable(getFunctions(), "eliminarServicio");
      await fn({ servicioId: servicio.id });
      hideLoading();
      swalSuccess({
        title: "Servicio eliminado",
        text: "El servicio fue eliminado correctamente.",
      });
    } catch (e) {
      hideLoading();
      swalError({
        title: "No se pudo eliminar",
        text: e?.message || "Ocurrio un error al eliminar el servicio.",
      });
    }
  }

  return (
    <div className={`service-card ${servicio.activo ? "" : "inactive"}`}>
      {/* HEADER */}
      <div className="service-header">
        <div className="service-header-main">
          {getServicioImageUrl(servicio) ? (
            <div className="service-card-thumb">
              <img
                src={getServicioImageUrl(servicio)}
                alt={servicio.nombreServicio || "Servicio"}
                className="service-card-thumb-img"
              />
            </div>
          ) : null}

          <div className="service-title-wrap">
            <div className="service-kicker">{getCategoriaLabel(servicio)}</div>
            <div className="service-title">
              <b>{servicio.nombreServicio}</b>
              {!servicio.activo && (
                <span className="badge inactive">Inactivo</span>
              )}
              {servicioMensualSinFechasPendientes(servicio) && (
                <span className="badge service-alert-badge">
                  Agenda agotada
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="service-actions">
          <button
            className="swal-btn-editar"
            onClick={() => (editando ? setEditando(false) : abrirEditor())}
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
                    eliminadoEn: deleteField(),
                    desactivadoPor: deleteField(),
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
        {servicio.profesionalId && (
          <span>
            Vinculado a empleado:{" "}
            <strong>
              {empleadoVinculado?.nombre ||
                empleadoVinculado?.email ||
                servicio.profesionalId}
            </strong>
          </span>
        )}
        <span>
          Gestion:{" "}
          <strong>
            {servicio.responsableGestion === "profesional"
              ? "Profesional"
              : "Administrador"}
          </strong>
        </span>
        <span>
          Tipo: <strong>{getTipoServicioReservaLabel(servicio)}</strong>
        </span>
        {getTipoServicioReserva(servicio) === "pack" && (
          <span>
            Pack:{" "}
            <strong>
              {getPackCantidadTurnos(servicio)} turnos cada{" "}
              {getPackFrecuenciaDias(servicio)} dia(s)
            </strong>
          </span>
        )}
        <span>
          Reserva: <strong>{getModoReservaLabel(servicio)}</strong>
        </span>
        <span>
          Duración: <strong>{servicio.duracionMin}</strong> min
        </span>
        <span>
          {servicioTienePrecioVariableActivo(servicio)
            ? "Precio desde:"
            : "Valor:"}{" "}
          <strong>${servicio.precio}</strong>
        </span>
        {getPrecioEfectivo(servicio) > 0 && (
          <span>
            {servicioTienePrecioVariableActivo(servicio)
              ? "Efectivo desde:"
              : "Efectivo:"}{" "}
            <strong>${getPrecioEfectivo(servicio)}</strong>
          </span>
        )}
        {servicio.precioVariable && (
          <span title={getResumenPrecioVariable(servicio)}>
            Precio variable:{" "}
            <strong>{getResumenPrecioVariable(servicio)}</strong>
          </span>
        )}
        {servicio.precioVariable && (
          <span>
            Seleccion de adicionales:{" "}
            <strong>{getPrecioVariableModoLabel(servicio)}</strong>
          </span>
        )}
        <span>
          Gabinetes:{" "}
          <strong>
            {servicio.gabinetes?.map((g) => g.nombreGabinete).join(", ") || "—"}
          </strong>
        </span>
        <span>
          Agenda:{" "}
          <strong>
            {getAgendaTipoServicio(servicio) === "mensual"
              ? getAgendaMensualRepiteMesSiguiente(servicio)
                ? `Mes ${getMesAgendaLabel(getAgendaMensualMesOffset(servicio))} + ${getMesAgendaLabel(getAgendaMensualMesOffset(servicio) + 1)}`
                : `Solo ${getMesAgendaLabel(getAgendaMensualMesOffset(servicio))}`
              : "Semanal"}
          </strong>
        </span>
        {servicio.agendaDisponibleDesde && (
          <span>
            Disponible desde: <strong>{servicio.agendaDisponibleDesde}</strong>
          </span>
        )}
        <span title={getResumenAgendaServicio(servicio)}>
          Disponibilidad: <strong>{getResumenAgendaServicio(servicio)}</strong>
        </span>
        {servicioMensualSinFechasPendientes(servicio) && (
          <span className="service-alert-text">
            Este servicio ya no tiene fechas disponibles para este mes. Quieres
            anadir nuevas fechas?
          </span>
        )}
        {servicioMensualSinFechasPendientes(servicio) && !editando && (
          <button
            type="button"
            className="swal-btn-editar service-alert-action"
            onClick={abrirEditor}
          >
            Anadir fechas
          </button>
        )}
      </div>

      {/* EDITOR */}
      {editando && (
        <div className="service-editor">
          <div className="service-editor-grid">
            {/* BLOQUE 1: DATOS */}
            <section className="service-editor-block service-editor-block-main">
              <div className="service-editor-block-title">
                Datos principales
              </div>

              <div className="service-image-panel">
                <div className="service-image-panel-copy">
                  <label>Imagen del servicio</label>
                  <span className="service-image-help">
                    Opcional. Se muestra en la agenda de servicios.
                  </span>
                  <label className="service-image-uploader">
                    <input
                      type="file"
                      accept="image/*"
                      className="service-image-input"
                      onChange={(event) =>
                        void handleImagenChange(event.target.files?.[0] || null)
                      }
                    />
                    <span className="service-image-uploader-title">
                      {imagenFile
                        ? "Cambiar imagen"
                        : "Subir o reemplazar imagen"}
                    </span>
                    <small>
                      {imagenFile?.name ||
                        (getServicioImageUrl(servicio)
                          ? "Usando la imagen actual del servicio."
                          : "JPG, PNG o WEBP. Se adapta sola.")}
                    </small>
                  </label>
                </div>

                {imagenUrl ? (
                  <div className="service-image-preview-card">
                    <img
                      src={imagenUrl}
                      alt={nombreServicio || "Preview del servicio"}
                      className="service-image-preview"
                    />
                    <button
                      type="button"
                      className="swal-btn-cancel service-image-clear"
                      onClick={limpiarImagen}
                    >
                      Quitar imagen
                    </button>
                  </div>
                ) : (
                  <div className="service-image-empty">Sin imagen cargada</div>
                )}
              </div>

              <div className="service-editor-fields service-editor-fields-2">
                <div className="field-group">
                  <label>Modo de reserva</label>
                  <select
                    className="admin-input reserva"
                    value={modoReserva}
                    onChange={(e) => setModoReserva(e.target.value)}
                  >
                    <option value="automatico">Confirmacion automatica</option>
                    <option value="reserva">Requiere aprobación</option>
                  </select>
                </div>
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
                  <label>Empleado vinculado</label>
                  <select
                    className="admin-input servicio"
                    value={profesionalId}
                    onChange={(e) => handleProfesionalChange(e.target.value)}
                  >
                    <option value="">Sin vincular</option>
                    {empleados.map((empleado) => (
                      <option key={empleado.id} value={empleado.id}>
                        {empleado.nombre || empleado.email} |{" "}
                        {getEmpleadoRoleLabel(empleado)}
                      </option>
                    ))}
                  </select>
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
                  <label>Precio en efectivo</label>
                  <input
                    type="number"
                    className="admin-input precio-admin"
                    value={precioEfectivo}
                    onChange={(e) => setPrecioEfectivo(e.target.value)}
                    min={0}
                  />
                </div>

                <div className="field-group service-field-full">
                  <label>Precio variable</label>
                  <PrecioVariableEditor
                    precioVariable={precioVariable}
                    setPrecioVariable={setPrecioVariable}
                    precioVariableModo={precioVariableModo}
                    setPrecioVariableModo={setPrecioVariableModo}
                    itemsPrecioVariable={itemsPrecioVariable}
                    setItemsPrecioVariable={setItemsPrecioVariable}
                  />
                </div>

                <div className="field-group">
                  <label>Quien gestiona este servicio</label>
                  <select
                    className="admin-input reserva"
                    value={responsableGestion}
                    onChange={(e) => setResponsableGestion(e.target.value)}
                  >
                    <option value="admin">Administrador</option>
                    <option value="profesional">Profesional vinculado</option>
                  </select>
                </div>

                <div className="field-group">
                  <label>Tipo de reserva</label>
                  <select
                    className="admin-input reserva"
                    value={tipoServicioReserva}
                    onChange={(e) => setTipoServicioReserva(e.target.value)}
                  >
                    <option value="individual">Turno individual</option>
                    <option value="pack">Pack de turnos</option>
                  </select>
                </div>

                {tipoServicioReserva === "pack" && (
                  <>
                    <div className="field-group">
                      <label>Cantidad de turnos del pack</label>
                      <input
                        type="number"
                        min={2}
                        className="admin-input"
                        value={packCantidadTurnos}
                        onChange={(e) =>
                          setPackCantidadTurnos(Number(e.target.value || 2))
                        }
                      />
                      <small className="text-muted">
                        Para frecuencia de {packFrecuenciaDias} día
                        {packFrecuenciaDias > 1 ? "s" : ""}, sugerimos una
                        agenda de al menos {agendaMinimaSugeridaPack} días.
                      </small>
                    </div>

                    <div className="field-group">
                      <label>Frecuencia entre turnos (dias)</label>
                      <input
                        type="number"
                        min={1}
                        className="admin-input"
                        value={packFrecuenciaDias}
                        onChange={(e) =>
                          setPackFrecuenciaDias(Number(e.target.value || 1))
                        }
                      />
                      <small className="text-muted">
                        Ejemplo: pack de {packCantidadTurnos} turnos cada{" "}
                        {packFrecuenciaDias} día
                        {packFrecuenciaDias > 1 ? "s" : ""}.
                      </small>
                    </div>
                  </>
                )}
              </div>
            </section>

            {/* BLOQUE 3: SEÑA */}
            <section className="service-editor-block">
              <div className="service-editor-block-title">Reserva y pago</div>

              <div className="service-editor-fields service-editor-fields-2">
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

                <div className="field-group">
                  <label>¿Pedir seña?</label>
                  <label className="checkbox-inline text-muted service-check-row">
                    <input
                      type="checkbox"
                      checked={pedirAnticipo}
                      onChange={(e) => setPedirAnticipo(e.target.checked)}
                    />
                    {pedirAnticipo
                      ? "Solicitando seña"
                      : "No se esta solicitando seña"}
                  </label>
                </div>

                <div className="field-group">
                  <label>Porcentaje seña</label>
                  <input
                    type="number"
                    className={`admin-input seña ${!pedirAnticipo ? "is-muted" : ""}`}
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
            <section className="service-editor-block service-editor-block-full service-agenda-block">
              <div className="service-editor-block-title">
                Agenda del servicio
              </div>

              {agendaTipo !== "mensual" && (
                <div className="service-editor-fields service-editor-fields-1 service-agenda-maxdias">
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
                    {tipoServicioReserva === "pack" && (
                      <small
                        className={
                          packAgendaSugeridaInsuficiente
                            ? "text-danger"
                            : "text-muted"
                        }
                      >
                        Agenda sugerida para este pack: al menos{" "}
                        {agendaMinimaSugeridaPack} dias.
                      </small>
                    )}
                  </div>
                </div>
              )}

              <AgendaServicioEditor
                agendaTipo={agendaTipo}
                setAgendaTipo={setAgendaTipo}
                agendaMaxDias={agendaMaxDias}
                setAgendaMaxDias={setAgendaMaxDias}
                agendaDisponibleDesde={agendaDisponibleDesde}
                setAgendaDisponibleDesde={setAgendaDisponibleDesde}
                horariosServicio={horariosServicio}
                setHorariosServicio={setHorariosServicio}
                agendaMensual={agendaMensual}
                setAgendaMensual={setAgendaMensual}
                agendaMensualModo={agendaMensualModo}
                setAgendaMensualModo={setAgendaMensualModo}
                repetirMesSiguiente={agendaMensualRepiteMesSiguiente}
                setRepetirMesSiguiente={setAgendaMensualRepiteMesSiguiente}
              />
            </section>

            {/* BLOQUE 5: GABINETES */}
            <section className="service-editor-block service-editor-block-full">
              <div className="service-editor-block-title">
                Gabinetes asignados
              </div>

              <div className="service-gabinetes">
                {gabinetes.map((g) => (
                  <label
                    key={g.id}
                    className="gabinete-checkbox gabinete-checkbox-card"
                  >
                    <input
                      type="checkbox"
                      checked={seleccionados.includes(g.id)}
                      onChange={() => toggleGabinete(g.id)}
                    />

                    <div className="gabinete-checkbox-content">
                      <span className="gabinete-checkbox-title">
                        {g.nombreGabinete}
                      </span>
                      <span className="gabinete-checkbox-sub">
                        {getResumenHorarioGabinete(g)}
                      </span>
                    </div>
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
  const [empleados, setEmpleados] = useState([]);
  const [filtroServicios, setFiltroServicios] = useState("");

  const [categorias, setCategorias] = useState([]);
  const [categoriaId, setCategoriaId] = useState("");

  const [nombreServicio, setNombreServicio] = useState("");
  const [nombreProfesional, setNombreProfesional] = useState("");
  const [profesionalId, setProfesionalId] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [imagenUrl, setImagenUrl] = useState("");
  const [imagenFile, setImagenFile] = useState(null);
  const [duracion, setDuracion] = useState(60);
  const [precio, setPrecio] = useState(0);
  const [precioEfectivo, setPrecioEfectivo] = useState(0);
  const [precioVariable, setPrecioVariable] = useState(false);
  const [precioVariableModo, setPrecioVariableModo] = useState("multiple");
  const [itemsPrecioVariable, setItemsPrecioVariable] = useState([]);
  const [responsableGestion, setResponsableGestion] = useState("admin");
  const [tipoServicioReserva, setTipoServicioReserva] = useState("individual");
  const [packCantidadTurnos, setPackCantidadTurnos] = useState(4);
  const [packFrecuenciaDias, setPackFrecuenciaDias] = useState(7);
  const [modoReserva, setModoReserva] = useState("reserva");
  const [pedirAnticipo, setPedirAnticipo] = useState(true);
  const [porcentajeAnticipo, setPorcentajeAnticipo] = useState(50);
  const [agendaMaxDias, setAgendaMaxDias] = useState(14);
  const [agendaDisponibleDesde, setAgendaDisponibleDesde] = useState("");
  const [agendaTipo, setAgendaTipo] = useState("semanal");
  const [agendaMensualModo, setAgendaMensualModo] = useState("mes_actual");
  const agendaCadaXDias = null;
  const [agendaMensualRepiteMesSiguiente, setAgendaMensualRepiteMesSiguiente] =
    useState(false);
  const [horariosServicio, setHorariosServicio] = useState(
    crearHorariosServicioBase(),
  );
  const [agendaMensual, setAgendaMensual] = useState(crearAgendaMensualBase());
  const agendaMinimaSugeridaPack = getAgendaMinimaSugeridaPack(
    packCantidadTurnos,
    packFrecuenciaDias,
  );
  const packAgendaSugeridaInsuficiente =
    tipoServicioReserva === "pack" &&
    Number(agendaMaxDias || 0) < Number(agendaMinimaSugeridaPack || 0);

  const [seleccionados, setSeleccionados] = useState([]);
  const [nuevoServicioAbierto, setNuevoServicioAbierto] = useState(false);
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
    let mounted = true;

    async function cargarGabinetesConHorarios() {
      try {
        const gabinetesSnap = await getDocs(collection(db, "gabinetes"));

        const baseGabinetes = gabinetesSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((g) => g.activo);

        const gabinetesConHorarios = await Promise.all(
          baseGabinetes.map(async (g) => {
            try {
              const horariosSnap = await getDocs(
                collection(db, "gabinetes", g.id, "horarios"),
              );

              const horarios = horariosSnap.docs
                .map((d) => ({ id: d.id, ...d.data() }))
                .filter((h) => h?.activo)
                .sort((a, b) => {
                  const diaA = Number(a?.diaSemana ?? 99);
                  const diaB = Number(b?.diaSemana ?? 99);
                  if (diaA !== diaB) return diaA - diaB;
                  return String(a?.desde || "").localeCompare(
                    String(b?.desde || ""),
                  );
                });

              return {
                ...g,
                horarios,
              };
            } catch (error) {
              console.error("gabinete ERROR:", g.nombreGabinete, g.id, error);

              return {
                ...g,
                horarios: [],
              };
            }
          }),
        );

        if (mounted) {
          setGabinetes(gabinetesConHorarios);
        }
      } catch (error) {
        console.error("Error cargando gabinetes con horarios:", error);
      }
    }

    cargarGabinetesConHorarios();

    return () => {
      mounted = false;
    };
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

  useEffect(() => {
    return onSnapshot(collection(db, "usuarios"), (snap) => {
      setEmpleados(
        snap.docs
          .map((d) => ({
            id: d.id,
            ...d.data(),
          }))
          .filter((empleado) => {
            return (
              Boolean(empleado.esEmpleado) || Number(empleado.nivel || 0) === 4
            );
          })
          .sort((a, b) =>
            String(a.nombre || a.email || "").localeCompare(
              String(b.nombre || b.email || ""),
              "es",
            ),
          ),
      );
    });
  }, []);

  function toggleGabinete(id) {
    setSeleccionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function handleProfesionalChange(value) {
    setProfesionalId(value);

    const profesional = empleados.find((item) => item.id === value);
    if (profesional) {
      setNombreProfesional(profesional.nombre || profesional.email || "");
    }
  }

  async function handleNuevaImagenChange(file) {
    if (!file) {
      setImagenFile(null);
      setImagenUrl("");
      return;
    }

    setImagenFile(file);
    const previewUrl = await leerArchivoComoDataUrl(file);
    setImagenUrl(previewUrl);
  }

  function limpiarNuevaImagen() {
    setImagenFile(null);
    setImagenUrl("");
  }

  async function crearServicio() {
    if (!nombreServicio.trim()) return showError("El servicio necesita nombre");
    if (!categoriaId)
      return showError("Debes elegir una categoria de servicio");
    if (seleccionados.length === 0)
      return showError("Debe tener al menos un gabinete");

    const yaExisteActivo = servicios.some(
      (s) =>
        s.activo &&
        getServicioDupKey(s) ===
          getServicioDupKey({
            nombreServicio,
            categoriaId,
            profesionalId,
          }),
    );

    if (yaExisteActivo)
      return showError(
        "Ya existe un servicio activo con ese nombre para ese profesional en esta categoria",
      );

    if (Number(duracion) <= 0) return showError("Duración invalida");
    if (Number(precio) < 0) return showError("Precio invalido");
    if (Number(precioEfectivo) < 0)
      return showError("Precio en efectivo invalido");
    if (
      Number(precioEfectivo) > 0 &&
      Number(precioEfectivo) >= Number(precio)
    ) {
      return showError(
        "El precio en efectivo debe ser menor al precio general o dejar vacio si no aplica.",
      );
    }
    if (responsableGestion === "profesional" && !profesionalId) {
      return showError(
        "Debes vincular un profesional si el servicio sera gestionado por profesionales",
      );
    }
    if (tipoServicioReserva === "pack" && Number(packCantidadTurnos) < 2) {
      return showError("En un pack la cantidad de turnos debe ser al menos 2.");
    }
    if (tipoServicioReserva === "pack" && Number(packFrecuenciaDias) < 1) {
      return showError("La frecuencia del pack debe ser de al menos 1 dia.");
    }
    if (
      tipoServicioReserva === "pack" &&
      agendaTipo !== "mensual" &&
      Number(agendaMaxDias || 0) < Number(agendaMinimaSugeridaPack || 0)
    ) {
      return showError(
        `Para este pack recomendamos al menos ${agendaMinimaSugeridaPack} dias de agenda maxima.`,
      );
    }
    if (
      precioVariable &&
      !tieneItemsPrecioVariableValidos(itemsPrecioVariable)
    ) {
      return showError(
        "Si activas precio variable, debes cargar al menos un adicional valido.",
      );
    }

    if (agendaTipo === "mensual" && !tieneAgendaMensualValida(agendaMensual)) {
      return showError(
        "Revisa la agenda mensual. Debe haber al menos un dia del mes con una franja valida.",
      );
    }

    if (
      agendaTipo !== "mensual" &&
      !tieneAgendaSemanalConfigurada(horariosServicio)
    ) {
      return showError("Sin agenda semanal configurada");
    }

    if (
      agendaTipo !== "mensual" &&
      !tieneHorariosServicioValidos(horariosServicio)
    ) {
      return showError(
        "Revisa los horarios del servicio. Cada dia activo debe tener al menos una franja valida.",
      );
    }

    const cat = categorias.find((c) => c.id === categoriaId);
    if (!cat) return showError("Categoria invalida");
    const categoriaNombre = (cat.nombre || "").trim();

    try {
      showLoading({
        title: "Creando servicio",
        text: "Guardando configuracion y agenda...",
      });

      const imagenServicioUrl = imagenFile
        ? await subirImagenServicio(imagenFile)
        : "";

      await addDoc(collection(db, "servicios"), {
        categoriaId,
        categoriaNombre,
        categoriaNombreNormalizado: normalizar(categoriaNombre),

        nombreServicio: nombreServicio.trim(),
        nombreServicioNormalizado: normalizar(nombreServicio),
        profesionalId: profesionalId || null,
        nombreProfesional: nombreProfesional.trim(),
        descripcion,
        imagenUrl: imagenServicioUrl || null,
        duracionMin: Number(duracion),
        precio: Number(precio),
        precioEfectivo: Number(precioEfectivo || 0),
        precioVariable,
        precioVariableModo: precioVariable ? precioVariableModo : "multiple",
        itemsPrecioVariable: precioVariable
          ? serializarItemsPrecioVariable(itemsPrecioVariable)
          : [],
        responsableGestion,
        esPack: tipoServicioReserva === "pack",
        packCantidadTurnos:
          tipoServicioReserva === "pack"
            ? Math.max(2, Number(packCantidadTurnos || 2))
            : null,
        packFrecuenciaDias:
          tipoServicioReserva === "pack"
            ? Math.max(1, Number(packFrecuenciaDias || 1))
            : null,
        modoReserva,
        pedirAnticipo,
        porcentajeAnticipo: pedirAnticipo ? Number(porcentajeAnticipo) : null,
        agendaMaxDias: Math.max(1, Number(agendaMaxDias || 7)),
        agendaDisponibleDesde:
          normalizarFechaAgendaDesde(agendaDisponibleDesde) || null,
        agendaTipo,
        agendaMensualModo,
        horariosServicio: serializarHorariosServicio(horariosServicio),
        agendaMensual:
          agendaTipo === "mensual"
            ? serializarAgendaMensual(agendaMensual)
            : [],
        agendaMensualRepiteMesSiguiente,
        agendaCadaXDias: null,

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
      setProfesionalId("");
      setDescripcion("");
      setImagenUrl("");
      setImagenFile(null);
      setDuracion(60);
      setPrecio(0);
      setPrecioEfectivo(0);
      setPrecioVariable(false);
      setPrecioVariableModo("multiple");
      setItemsPrecioVariable([]);
      setResponsableGestion("admin");
      setTipoServicioReserva("individual");
      setPackCantidadTurnos(4);
      setPackFrecuenciaDias(7);
      setModoReserva("reserva");
      setPedirAnticipo(true);
      setPorcentajeAnticipo(50);
      setAgendaMaxDias(14);
      setAgendaDisponibleDesde("");
      setAgendaTipo("semanal");
      setAgendaMensualModo("mes_actual");
      setAgendaMensualRepiteMesSiguiente(false);
      setHorariosServicio(crearHorariosServicioBase());
      setAgendaMensual(crearAgendaMensualBase());
      setSeleccionados([]);

      await swalSuccess({
        title: "Servicio creado",
        text: "El servicio se guardo correctamente.",
      });
    } catch (error) {
      console.error("Error creando servicio", error);
      await swalError({
        title: "No se pudo crear",
        text: "Ocurrio un error al guardar el servicio.",
      });
    } finally {
      hideLoading();
    }
  }

  const filtroServiciosNormalizado = normalizar(filtroServicios || "");
  const serviciosFiltrados = servicios.filter((servicio) => {
    if (!filtroServiciosNormalizado) return true;

    return normalizar(servicio?.nombreServicio || "").includes(
      filtroServiciosNormalizado,
    );
  });

  return (
    <div className="admin-panel servicios-admin-page">
      <div className="admin-title servicios-page-title">Servicios</div>

      <div className="servicios-admin-layout">
        <section className="servicios-admin-section servicios-admin-section-categorias">
          <CategoriasServiciosPanel />
        </section>

        <section className="servicios-admin-section servicios-admin-section-form">
          <div className="admin-panel-container servicios-panel-card">
            <button
              type="button"
              className="admin-categorias-header servicios-section-header servicios-section-toggle"
              onClick={() => setNuevoServicioAbierto((prev) => !prev)}
              aria-expanded={nuevoServicioAbierto}
            >
              <div>
                <h5 className="fw-bold mb-1">Crear un servicio</h5>
                <p className="servicios-section-desc mb-0">
                  Configurá categoría, datos, seña, agenda y gabinetes.
                </p>
              </div>
              <span className="collapse-icon">
                {nuevoServicioAbierto ? "\u25BE" : "\u25B8"}
              </span>
            </button>

            {nuevoServicioAbierto && (
              <div className="admin-servicios-create servicios-form-shell">
                <div className="servicios-form-block servicios-form-block-agenda">
                  <div className="servicios-form-block-title">
                    Datos principales
                  </div>

                  <div className="service-image-panel">
                    <div className="service-image-panel-copy">
                      <label className="admin-label">Imagen del servicio</label>
                      <span className="service-image-help">
                        Opcional. Se muestra en la agenda de servicios.
                      </span>
                      <label className="service-image-uploader">
                        <input
                          type="file"
                          accept="image/*"
                          className="service-image-input"
                          onChange={(event) =>
                            void handleNuevaImagenChange(
                              event.target.files?.[0] || null,
                            )
                          }
                        />
                        <span className="service-image-uploader-title">
                          {imagenFile ? "Cambiar imagen" : "Subir imagen"}
                        </span>
                        <small>
                          {imagenFile?.name ||
                            "JPG, PNG o WEBP. Se adapta sola."}
                        </small>
                      </label>
                    </div>

                    {imagenUrl ? (
                      <div className="service-image-preview-card">
                        <img
                          src={imagenUrl}
                          alt={nombreServicio || "Preview del servicio"}
                          className="service-image-preview"
                        />
                        <button
                          type="button"
                          className="swal-btn-cancel service-image-clear"
                          onClick={limpiarNuevaImagen}
                        >
                          Quitar imagen
                        </button>
                      </div>
                    ) : (
                      <div className="service-image-empty">
                        Sin imagen cargada
                      </div>
                    )}
                  </div>

                  <div className="servicios-form-grid">
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
                      <label>Empleado vinculado</label>
                      <select
                        className="admin-input servicio"
                        value={profesionalId}
                        onChange={(e) =>
                          handleProfesionalChange(e.target.value)
                        }
                      >
                        <option value="">Sin vincular</option>
                        {empleados.map((empleado) => (
                          <option key={empleado.id} value={empleado.id}>
                            {empleado.nombre || empleado.email} |{" "}
                            {getEmpleadoRoleLabel(empleado)}
                          </option>
                        ))}
                      </select>
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
                      <label>Precio general</label>
                      <input
                        className="admin-input precio-admin"
                        type="number"
                        value={precio}
                        onChange={(e) => setPrecio(e.target.value)}
                        min={0}
                      />
                    </div>

                    <div className="form-field">
                      <label>Precio en efectivo</label>
                      <input
                        className="admin-input precio-admin"
                        type="number"
                        value={precioEfectivo}
                        onChange={(e) => setPrecioEfectivo(e.target.value)}
                        min={0}
                      />
                    </div>

                    <div className="form-field service-field-full">
                      <label>Precio variable</label>
                      <PrecioVariableEditor
                        precioVariable={precioVariable}
                        setPrecioVariable={setPrecioVariable}
                        precioVariableModo={precioVariableModo}
                        setPrecioVariableModo={setPrecioVariableModo}
                        itemsPrecioVariable={itemsPrecioVariable}
                        setItemsPrecioVariable={setItemsPrecioVariable}
                      />
                    </div>

                    <div className="form-field">
                      <label>Quien gestiona este servicio</label>
                      <select
                        className="admin-input reserva"
                        value={responsableGestion}
                        onChange={(e) => setResponsableGestion(e.target.value)}
                      >
                        <option value="admin">Administrador</option>
                        <option value="profesional">
                          Profesional vinculado
                        </option>
                      </select>
                    </div>

                    <div className="form-field">
                      <label>Tipo de reserva</label>
                      <select
                        className="admin-input reserva"
                        value={tipoServicioReserva}
                        onChange={(e) => setTipoServicioReserva(e.target.value)}
                      >
                        <option value="individual">Turno individual</option>
                        <option value="pack">Pack de turnos</option>
                      </select>
                    </div>

                    {tipoServicioReserva === "pack" && (
                      <>
                        <div className="form-field">
                          <label>Cantidad de turnos del pack</label>
                          <input
                            type="number"
                            min={2}
                            className="admin-input"
                            value={packCantidadTurnos}
                            onChange={(e) =>
                              setPackCantidadTurnos(Number(e.target.value || 2))
                            }
                          />
                          <small className="text-muted">
                            Sugerencia de agenda para esta configuracion: al
                            menos {agendaMinimaSugeridaPack} dias.
                          </small>
                        </div>

                        <div className="form-field">
                          <label>Frecuencia entre turnos (dias)</label>
                          <input
                            type="number"
                            min={1}
                            className="admin-input"
                            value={packFrecuenciaDias}
                            onChange={(e) =>
                              setPackFrecuenciaDias(Number(e.target.value || 1))
                            }
                          />
                          <small className="text-muted">
                            Ejemplo: pack de {packCantidadTurnos} turnos cada{" "}
                            {packFrecuenciaDias} día
                            {packFrecuenciaDias !== 1 ? "s" : ""}.
                          </small>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="servicios-form-block">
                  <div className="servicios-form-block-title">
                    Reserva y pago
                  </div>
                  {/* FILA 2 — SEÑA */}
                  <div className="service-row service-sena-row">
                    <div className="field-group">
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

                    <div className="field-group">
                      <label>¿Pedir seña?</label>
                      <label className="checkbox-inline text-muted">
                        {"  "}
                        <input
                          type="checkbox"
                          checked={pedirAnticipo}
                          onChange={(e) => setPedirAnticipo(e.target.checked)}
                        />
                        {pedirAnticipo
                          ? "Solicitando seña"
                          : "No se esta solicitando seña"}
                      </label>
                    </div>

                    <div className="field-group">
                      <label>Porcentaje seña</label>
                      <input
                        type="number"
                        className={`admin-input anticipo ${!pedirAnticipo ? "is-muted" : ""}`}
                        value={porcentajeAnticipo}
                        onChange={(e) => setPorcentajeAnticipo(e.target.value)}
                        min={5}
                        max={100}
                        disabled={!pedirAnticipo}
                      />
                    </div>
                  </div>
                </div>

                <div className="servicios-form-block servicios-form-block-agenda">
                  <div className="servicios-form-block-title">
                    Agenda del servicio
                  </div>
                  {/* GABINETES */}
                  {agendaTipo !== "mensual" && (
                    <div className="form-field servicios-agenda-maxdias">
                      <label>Anticipación máxima (días)</label>
                      <input
                        className="admin-input"
                        type="number"
                        value={agendaMaxDias}
                        onChange={(e) => setAgendaMaxDias(e.target.value)}
                        min={1}
                        max={180}
                      />
                      {tipoServicioReserva === "pack" && (
                        <small
                          className={
                            packAgendaSugeridaInsuficiente
                              ? "text-danger"
                              : "text-muted"
                          }
                        >
                          Agenda sugerida para este pack: al menos{" "}
                          {agendaMinimaSugeridaPack} dias.
                        </small>
                      )}
                    </div>
                  )}

                  <AgendaServicioEditor
                    agendaTipo={agendaTipo}
                    setAgendaTipo={setAgendaTipo}
                    agendaMaxDias={agendaMaxDias}
                    setAgendaMaxDias={setAgendaMaxDias}
                    agendaDisponibleDesde={agendaDisponibleDesde}
                    setAgendaDisponibleDesde={setAgendaDisponibleDesde}
                    horariosServicio={horariosServicio}
                    setHorariosServicio={setHorariosServicio}
                    agendaMensual={agendaMensual}
                    setAgendaMensual={setAgendaMensual}
                    agendaMensualModo={agendaMensualModo}
                    setAgendaMensualModo={setAgendaMensualModo}
                    repetirMesSiguiente={agendaMensualRepiteMesSiguiente}
                    setRepetirMesSiguiente={setAgendaMensualRepiteMesSiguiente}
                  />
                </div>

                <div className="servicios-form-block">
                  <div className="servicios-form-block-title">Gabinetes</div>

                  {/* GABINETES */}
                  <div className="field-group">
                    <label>Gabinetes a utilizar</label>
                    <div className="service-gabinetes">
                      {gabinetes.map((g) => (
                        <label
                          key={g.id}
                          className="gabinete-checkbox gabinete-checkbox-card"
                        >
                          <input
                            type="checkbox"
                            checked={seleccionados.includes(g.id)}
                            onChange={() => toggleGabinete(g.id)}
                          />

                          <div className="gabinete-checkbox-content">
                            <span className="gabinete-checkbox-title">
                              {g.nombreGabinete}
                            </span>
                            <span className="gabinete-checkbox-sub">
                              {getResumenHorarioGabinete(g)}
                            </span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="servicios-form-actions-wrap">
                  <div className="form-field button-field">
                    <button
                      className="swal-btn-agregar"
                      onClick={crearServicio}
                    >
                      Crear servicio
                    </button>
                  </div>
                </div>
              </div>
            )}

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
                  <div className="servicios-filtro-bar">
                    <input
                      className="admin-input servicios-filtro-input"
                      placeholder="Filtrar servicios por nombre"
                      value={filtroServicios}
                      onChange={(e) => setFiltroServicios(e.target.value)}
                    />
                    <span className="servicios-filtro-count">
                      {serviciosFiltrados.length} resultado(s)
                    </span>
                  </div>

                  <div className="">
                    {Object.entries(
                      serviciosFiltrados.reduce((acc, servicio) => {
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
                                servicios={servicios}
                                gabinetes={gabinetes}
                                empleados={empleados}
                              />
                            ))}
                        </div>
                      ))}

                    {!serviciosFiltrados.length && (
                      <div className="servicios-empty-state">
                        No hay servicios que coincidan con ese nombre.
                      </div>
                    )}
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

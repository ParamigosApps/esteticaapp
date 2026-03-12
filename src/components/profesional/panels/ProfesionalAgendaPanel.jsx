import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import Swal from "sweetalert2";
import { db, functions } from "../../../Firebase.js";
import { useAuth } from "../../../context/AuthContext.jsx";
import { swalError, swalSuccess } from "../../../public/utils/swalUtils.js";
import { hideLoading, showLoading } from "../../../services/loadingService.js";
import {
  getEstadoPago,
  getEstadoTurno,
  getMetodoPagoEsperado,
} from "../../admin/panels/turnosAdmin/turnosAdminHelpers.js";

function normalizarTexto(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function formatMoney(value) {
  return `$${Number(value || 0).toLocaleString("es-AR")}`;
}

function formatDateTime(ms) {
  if (!ms) return "-";
  return new Date(Number(ms)).toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatDateShort(value) {
  if (!value) return "-";
  if (typeof value === "string") {
    const parsed = new Date(`${value}T00:00:00`);
    if (!Number.isNaN(parsed.getTime()))
      return parsed.toLocaleDateString("es-AR");
  }
  return "-";
}

function formatEstadoLabel(estado) {
  switch (estado) {
    case "pendiente_aprobacion":
      return "Por aprobar";
    case "pendiente":
      return "Pendiente";
    case "confirmado":
      return "Confirmado";
    case "cancelado":
      return "Cancelado";
    case "rechazado":
      return "Rechazado";
    case "finalizado":
      return "Finalizado";
    case "ausente":
      return "Ausente";
    default:
      return estado || "-";
  }
}

function createHistorialForm() {
  return {
    fechaRegistro: new Date().toISOString().slice(0, 10),
    motivoConsulta: "",
    observaciones: "",
    evolucion: "",
    indicaciones: "",
  };
}

export default function ProfesionalAgendaPanel() {
  const { user } = useAuth();
  const [serviciosAsignados, setServiciosAsignados] = useState([]);
  const [turnos, setTurnos] = useState([]);
  const [historialClinico, setHistorialClinico] = useState([]);
  const [filtroFecha, setFiltroFecha] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [turnoSeleccionadoId, setTurnoSeleccionadoId] = useState("");
  const [historialForm, setHistorialForm] = useState(createHistorialForm());
  const [guardandoFicha, setGuardandoFicha] = useState(false);

  const aprobarTurnoProfesional = httpsCallable(
    functions,
    "aprobarTurnoProfesional",
  );
  const cancelarTurnoProfesional = httpsCallable(
    functions,
    "cancelarTurnoProfesional",
  );

  useEffect(() => {
    if (!user?.uid) {
      setTurnos([]);
      return undefined;
    }

    const turnosQuery = query(
      collection(db, "turnos"),
      where("profesionalId", "==", user.uid),
      orderBy("fecha", "asc"),
      orderBy("horaInicio", "asc"),
    );

    return onSnapshot(
      turnosQuery,
      (snap) => {
        setTurnos(
          snap.docs.map((docItem) => ({
            id: docItem.id,
            ...docItem.data(),
          })),
        );
      },
      (error) => {
        console.error("Error leyendo turnos del profesional", error);
        setTurnos([]);
      },
    );
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setServiciosAsignados([]);
      return undefined;
    }

    const serviciosQuery = query(
      collection(db, "servicios"),
      where("profesionalId", "==", user.uid),
    );

    return onSnapshot(serviciosQuery, (snap) => {
      setServiciosAsignados(
        snap.docs
          .map((docItem) => ({
            id: docItem.id,
            ...docItem.data(),
          }))
          .filter(
            (servicio) =>
              servicio.activo !== false &&
              (servicio.responsableGestion || "admin") === "profesional",
          )
          .sort((a, b) =>
            String(a.nombreServicio || "").localeCompare(
              String(b.nombreServicio || ""),
              "es",
            ),
          ),
      );
    });
  }, [user?.uid]);

  const nombresProfesional = useMemo(() => {
    return [user?.nombre, user?.displayName, user?.email]
      .map(normalizarTexto)
      .filter(Boolean);
  }, [user]);

  const misTurnos = useMemo(() => {
    return turnos.filter((turno) => {
      if ((turno.responsableGestion || "profesional") !== "profesional") {
        return false;
      }

      if (turno.profesionalId && user?.uid) {
        return String(turno.profesionalId) === String(user.uid);
      }

      const profesionalTurno = normalizarTexto(turno.profesionalNombre);
      return profesionalTurno && nombresProfesional.includes(profesionalTurno);
    });
  }, [nombresProfesional, turnos, user?.uid]);

  const turnosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();

    return misTurnos.filter((turno) => {
      const estadoTurno = getEstadoTurno(turno);
      const blob = `
        ${turno.nombreCliente || ""}
        ${turno.clienteTelefono || turno.telefonoCliente || ""}
        ${turno.clienteEmail || turno.email || ""}
        ${turno.nombreServicio || ""}
        ${turno.nombreGabinete || ""}
      `.toLowerCase();

      if (filtroFecha && turno.fecha !== filtroFecha) return false;
      if (filtroEstado !== "todos" && estadoTurno !== filtroEstado)
        return false;
      if (texto && !blob.includes(texto)) return false;
      return true;
    });
  }, [busqueda, filtroEstado, filtroFecha, misTurnos]);

  useEffect(() => {
    if (!turnosFiltrados.length) {
      setTurnoSeleccionadoId("");
      return;
    }

    const existe = turnosFiltrados.some(
      (turno) => turno.id === turnoSeleccionadoId,
    );
    if (!existe) {
      setTurnoSeleccionadoId(turnosFiltrados[0].id);
    }
  }, [turnoSeleccionadoId, turnosFiltrados]);

  const turnoSeleccionado = useMemo(
    () =>
      turnosFiltrados.find((turno) => turno.id === turnoSeleccionadoId) || null,
    [turnoSeleccionadoId, turnosFiltrados],
  );

  const clienteSeleccionadoId =
    turnoSeleccionado?.clienteId ||
    turnoSeleccionado?.usuarioId ||
    turnoSeleccionado?.uid ||
    "";

  useEffect(() => {
    setHistorialForm(createHistorialForm());
  }, [turnoSeleccionadoId]);

  useEffect(() => {
    if (!clienteSeleccionadoId) {
      setHistorialClinico([]);
      return undefined;
    }

    const historialQuery = query(
      collection(db, "usuarios", clienteSeleccionadoId, "historial_clinico"),
      orderBy("fechaRegistro", "desc"),
    );

    return onSnapshot(
      historialQuery,
      (snap) => {
        setHistorialClinico(
          snap.docs.map((docItem) => ({
            id: docItem.id,
            ...docItem.data(),
          })),
        );
      },
      () => setHistorialClinico([]),
    );
  }, [clienteSeleccionadoId]);

  const resumen = useMemo(() => {
    return misTurnos.reduce(
      (acc, turno) => {
        const estado = getEstadoTurno(turno);
        acc.total += 1;
        if (estado === "pendiente" || estado === "pendiente_aprobacion")
          acc.pendientes += 1;
        if (estado === "confirmado") acc.confirmados += 1;
        if (turno.fecha === new Date().toISOString().slice(0, 10)) acc.hoy += 1;
        return acc;
      },
      { total: 0, pendientes: 0, confirmados: 0, hoy: 0 },
    );
  }, [misTurnos]);

  function updateHistorialForm(field, value) {
    setHistorialForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  async function handleAprobarTurno(turno) {
    showLoading({
      title: "Aprobando turno",
      text: "Actualizando estado de la reserva...",
    });

    try {
      await aprobarTurnoProfesional({ turnoId: turno.id });
      await swalSuccess({
        title: "Turno aprobado",
        text: "La reserva quedo confirmada.",
      });
    } catch (error) {
      console.error("Error aprobando turno profesional", error);
      await swalError({
        title: "No se pudo aprobar",
        text: error?.message || "Ocurrio un error al aprobar el turno.",
      });
    } finally {
      hideLoading();
    }
  }

  async function handleCancelarTurno(turno) {
    const result = await Swal.fire({
      title: "Cancelar turno",
      text: `Se cancelara el turno de ${turno.nombreCliente || "este cliente"}.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Cancelar turno",
      cancelButtonText: "Volver",
    });

    if (!result.isConfirmed) return;

    showLoading({
      title: "Cancelando turno",
      text: "Actualizando agenda del profesional...",
    });

    try {
      await cancelarTurnoProfesional({ turnoId: turno.id });
      await swalSuccess({
        title: "Turno cancelado",
        text: "La reserva se cancelo correctamente.",
      });
    } catch (error) {
      console.error("Error cancelando turno profesional", error);
      await swalError({
        title: "No se pudo cancelar",
        text: error?.message || "Ocurrio un error al cancelar el turno.",
      });
    } finally {
      hideLoading();
    }
  }

  async function guardarFichaClinica() {
    if (!clienteSeleccionadoId || guardandoFicha) return;

    if (
      !historialForm.motivoConsulta.trim() &&
      !historialForm.observaciones.trim() &&
      !historialForm.evolucion.trim() &&
      !historialForm.indicaciones.trim()
    ) {
      await swalError({
        title: "Ficha incompleta",
        text: "Ingresa al menos un dato clinico para guardar.",
      });
      return;
    }

    setGuardandoFicha(true);
    showLoading({
      title: "Guardando historial",
      text: "Actualizando ficha del cliente...",
    });

    try {
      await addDoc(
        collection(db, "usuarios", clienteSeleccionadoId, "historial_clinico"),
        {
          clienteId: clienteSeleccionadoId,
          turnoId: turnoSeleccionado.id,
          servicioId: turnoSeleccionado.servicioId || null,
          categoriaId: turnoSeleccionado.categoriaId || null,
          categoriaNombre: turnoSeleccionado.categoriaNombre || "",
          nombreServicio: turnoSeleccionado.nombreServicio || "",
          profesionalNombre:
            turnoSeleccionado.profesionalNombre || user?.nombre || "",
          fechaRegistro: historialForm.fechaRegistro,
          motivoConsulta: historialForm.motivoConsulta.trim(),
          observaciones: historialForm.observaciones.trim(),
          evolucion: historialForm.evolucion.trim(),
          indicaciones: historialForm.indicaciones.trim(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      );

      setHistorialForm(createHistorialForm());
      await swalSuccess({
        title: "Historial actualizado",
        text: "La ficha clinica del cliente se guardo correctamente.",
      });
    } catch (error) {
      console.error("Error guardando historial clinico", error);
      await swalError({
        title: "No se pudo guardar",
        text: "Ocurrio un error al registrar el historial clinico.",
      });
    } finally {
      hideLoading();
      setGuardandoFicha(false);
    }
  }

  return (
    <div className="prof-panel">
      <section className="prof-hero">
        <div className="prof-hero-copy">
          <p className="prof-eyebrow">Agenda profesional</p>
          <h1>Turnos y seguimiento</h1>
          <p>
            Revisa tu agenda, aprueba o cancela reservas y completa el historial
            clinico del cliente desde la misma vista.
          </p>

          <div className="prof-assignment-banner">
            {serviciosAsignados.length ? (
              <>
                <strong>Agenda asignada</strong>
                <span>
                  {serviciosAsignados.length} servicio(s):{" "}
                  {serviciosAsignados
                    .slice(0, 3)
                    .map((servicio) => servicio.nombreServicio)
                    .join(", ")}
                  {serviciosAsignados.length > 3 ? "..." : ""}
                </span>
              </>
            ) : (
              <>
                <strong>Sin agenda asignada</strong>
                <span>
                  Todavia no tienes servicios configurados para gestion
                  profesional.
                </span>
              </>
            )}
          </div>
        </div>

        <div className="prof-summary">
          <article className="prof-summary-card">
            <span>Turnos</span>
            <strong>{resumen.total}</strong>
          </article>
          <article className="prof-summary-card">
            <span>Pendientes</span>
            <strong>{resumen.pendientes}</strong>
          </article>
          <article className="prof-summary-card">
            <span>Confirmados</span>
            <strong>{resumen.confirmados}</strong>
          </article>
          <article className="prof-summary-card">
            <span>Hoy</span>
            <strong>{resumen.hoy}</strong>
          </article>
        </div>
      </section>

      <section className="prof-toolbar">
        <div className="turnos-filtro-item">
          <label>Fecha</label>
          <input
            className="turnos-filtro-control"
            type="date"
            value={filtroFecha}
            onChange={(e) => setFiltroFecha(e.target.value)}
          />
        </div>

        <div className="turnos-filtro-item">
          <label>Estado</label>
          <select
            className="turnos-filtro-control"
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
          >
            <option value="todos">Todos</option>
            <option value="pendiente">Pendientes</option>
            <option value="pendiente_aprobacion">Por aprobar</option>
            <option value="confirmado">Confirmados</option>
            <option value="cancelado">Cancelados</option>
            <option value="finalizado">Finalizados</option>
          </select>
        </div>

        <div className="turnos-filtro-item turnos-filtro-item--buscar">
          <label>Busqueda</label>
          <input
            className="turnos-filtro-control"
            type="text"
            placeholder="Cliente, servicio o gabinete"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
      </section>

      <section className="prof-shell">
        <div className="prof-turnos-list">
          {turnosFiltrados.map((turno) => {
            const estadoTurno = getEstadoTurno(turno);
            const estadoPago = getEstadoPago(turno);
            const metodoPago = getMetodoPagoEsperado(turno);
            const isActive = turno.id === turnoSeleccionadoId;

            return (
              <button
                key={turno.id}
                type="button"
                className={`prof-turno-card ${isActive ? "is-active" : ""}`}
                onClick={() => setTurnoSeleccionadoId(turno.id)}
              >
                <div className="prof-turno-top">
                  <div>
                    <strong>{turno.nombreCliente || "Cliente"}</strong>
                    <span>{turno.nombreServicio || "Servicio"}</span>
                  </div>
                  <span
                    className={`prof-turno-badge prof-turno-badge-${estadoTurno}`}
                  >
                    {formatEstadoLabel(estadoTurno)}
                  </span>
                </div>

                <div className="prof-turno-meta">
                  <span>{turno.fecha || "-"}</span>
                  <span>{formatDateTime(turno.horaInicio)}</span>
                  <span>{turno.nombreGabinete || "-"}</span>
                </div>

                <div className="prof-turno-footer">
                  <small>
                    {turno.clienteTelefono || turno.telefonoCliente || "-"}
                  </small>
                  <small>
                    {estadoPago} | {metodoPago}
                  </small>
                </div>
              </button>
            );
          })}

          {!turnosFiltrados.length ? (
            <div className="clientes-admin-empty">
              No hay turnos para los filtros actuales o para este profesional.
            </div>
          ) : null}
        </div>

        <div className="prof-detail-panel">
          {turnoSeleccionado ? (
            <>
              <div className="prof-detail-header">
                <div>
                  <span className="prof-eyebrow">Turno seleccionado</span>
                  <h3>{turnoSeleccionado.nombreCliente || "Cliente"}</h3>
                  <p>
                    {turnoSeleccionado.nombreServicio || "Servicio"} |{" "}
                    {turnoSeleccionado.nombreGabinete || "-"}
                  </p>
                </div>

                <div className="prof-detail-price">
                  <strong>
                    {formatMoney(turnoSeleccionado.montoTotal || 0)}
                  </strong>
                  <small>
                    Pagado {formatMoney(turnoSeleccionado.montoPagado || 0)}
                  </small>
                </div>
              </div>

              <div className="prof-detail-grid">
                <article className="prof-detail-info">
                  <span>Fecha</span>
                  <strong>{turnoSeleccionado.fecha || "-"}</strong>
                </article>
                <article className="prof-detail-info">
                  <span>Horario</span>
                  <strong>
                    {formatDateTime(turnoSeleccionado.horaInicio)}
                  </strong>
                </article>
                <article className="prof-detail-info">
                  <span>Cliente</span>
                  <strong>
                    {turnoSeleccionado.clienteTelefono ||
                      turnoSeleccionado.telefonoCliente ||
                      "-"}
                  </strong>
                </article>
                <article className="prof-detail-info">
                  <span>Estado</span>
                  <strong>
                    {formatEstadoLabel(getEstadoTurno(turnoSeleccionado))}
                  </strong>
                </article>
              </div>

              <div className="prof-actions">
                {["pendiente", "pendiente_aprobacion"].includes(
                  getEstadoTurno(turnoSeleccionado),
                ) ? (
                  <button
                    type="button"
                    className="swal-btn-guardar"
                    onClick={() => handleAprobarTurno(turnoSeleccionado)}
                  >
                    Aprobar turno
                  </button>
                ) : null}

                {!["cancelado", "rechazado", "finalizado", "ausente"].includes(
                  getEstadoTurno(turnoSeleccionado),
                ) ? (
                  <button
                    type="button"
                    className="swal-btn-desactivar"
                    onClick={() => handleCancelarTurno(turnoSeleccionado)}
                  >
                    Cancelar turno
                  </button>
                ) : null}
              </div>

              <section className="prof-clinico-form-card">
                <div className="prof-section-head">
                  <div>
                    <h4>Completar historial clinico</h4>
                    <p>
                      La ficha se guarda en el perfil del cliente y queda
                      vinculada a este turno.
                    </p>
                  </div>
                </div>

                {clienteSeleccionadoId ? (
                  <>
                    <div className="prof-clinico-grid">
                      <div className="turnos-filtro-item">
                        <label>Fecha del registro</label>
                        <input
                          className="turnos-filtro-control"
                          type="date"
                          value={historialForm.fechaRegistro}
                          onChange={(e) =>
                            updateHistorialForm("fechaRegistro", e.target.value)
                          }
                        />
                      </div>

                      <div className="turnos-filtro-item prof-clinico-full">
                        <label>Motivo o consulta</label>
                        <textarea
                          className="turnos-filtro-control prof-textarea"
                          value={historialForm.motivoConsulta}
                          onChange={(e) =>
                            updateHistorialForm(
                              "motivoConsulta",
                              e.target.value,
                            )
                          }
                        />
                      </div>

                      <div className="turnos-filtro-item prof-clinico-full">
                        <label>Observaciones</label>
                        <textarea
                          className="turnos-filtro-control prof-textarea"
                          value={historialForm.observaciones}
                          onChange={(e) =>
                            updateHistorialForm("observaciones", e.target.value)
                          }
                        />
                      </div>

                      <div className="turnos-filtro-item">
                        <label>Evolucion</label>
                        <textarea
                          className="turnos-filtro-control prof-textarea"
                          value={historialForm.evolucion}
                          onChange={(e) =>
                            updateHistorialForm("evolucion", e.target.value)
                          }
                        />
                      </div>

                      <div className="turnos-filtro-item">
                        <label>Indicaciones</label>
                        <textarea
                          className="turnos-filtro-control prof-textarea"
                          value={historialForm.indicaciones}
                          onChange={(e) =>
                            updateHistorialForm("indicaciones", e.target.value)
                          }
                        />
                      </div>
                    </div>

                    <div className="prof-clinico-actions">
                      <button
                        type="button"
                        className="turnos-filtros-clear"
                        onClick={() => setHistorialForm(createHistorialForm())}
                      >
                        Limpiar
                      </button>
                      <button
                        type="button"
                        className="swal-btn-guardar"
                        onClick={guardarFichaClinica}
                        disabled={guardandoFicha}
                      >
                        {guardandoFicha ? "Guardando..." : "Guardar historial"}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="clientes-admin-empty">
                    Este turno no tiene cliente vinculado con `uid`, por eso no
                    se puede guardar historial clinico desde aqui.
                  </div>
                )}
              </section>

              <section className="prof-history-card">
                <div className="prof-section-head">
                  <div>
                    <h4>Historial del cliente</h4>
                    <p>
                      Consulta rapido las ultimas fichas cargadas para este
                      cliente.
                    </p>
                  </div>
                  <span>{historialClinico.length}</span>
                </div>

                <div className="prof-history-list">
                  {historialClinico.map((ficha) => (
                    <article key={ficha.id} className="prof-history-item">
                      <div className="prof-history-top">
                        <span>{formatDateShort(ficha.fechaRegistro)}</span>
                        {ficha.nombreServicio ? (
                          <small>{ficha.nombreServicio}</small>
                        ) : null}
                      </div>
                      {ficha.motivoConsulta ? (
                        <p>
                          <strong>Motivo:</strong> {ficha.motivoConsulta}
                        </p>
                      ) : null}
                      {ficha.observaciones ? (
                        <p>
                          <strong>Observaciones:</strong> {ficha.observaciones}
                        </p>
                      ) : null}
                      {ficha.evolucion ? (
                        <p>
                          <strong>Evolucion:</strong> {ficha.evolucion}
                        </p>
                      ) : null}
                      {ficha.indicaciones ? (
                        <p>
                          <strong>Indicaciones:</strong> {ficha.indicaciones}
                        </p>
                      ) : null}
                    </article>
                  ))}

                  {!historialClinico.length ? (
                    <div className="clientes-admin-empty">
                      Este cliente todavia no tiene historial clinico cargado.
                    </div>
                  ) : null}
                </div>
              </section>
            </>
          ) : (
            <div className="clientes-admin-empty">
              Selecciona un turno para ver el detalle y completar el historial.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

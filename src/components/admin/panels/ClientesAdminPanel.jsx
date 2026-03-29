import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import Swal from "sweetalert2";
import { db } from "../../../Firebase";
import { swalError, swalSuccess } from "../../../public/utils/swalUtils.js";
import { hideLoading, showLoading } from "../../../services/loadingService.js";
import whatsappIcon from "../../../assets/icons/whatsapp.png";

function getTimestampMs(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value?.toMillis === "function") return value.toMillis();
  return 0;
}

function formatMoney(value) {
  return `$${Number(value || 0).toLocaleString("es-AR")}`;
}

function formatDateTime(value) {
  const ms = getTimestampMs(value);
  if (!ms) return "-";

  return new Date(ms).toLocaleString("es-AR", {
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

  const ms = getTimestampMs(value);
  if (!ms) return "-";
  return new Date(ms).toLocaleDateString("es-AR");
}

function getEstadoTurno(turno) {
  return turno?.estadoTurno || turno?.estado || "pendiente";
}

function getEstadoPago(pago) {
  return pago?.estadoPago || pago?.estado || "pendiente";
}

function isPagoContable(pago) {
  const estado = String(getEstadoPago(pago) || "")
    .trim()
    .toLowerCase();
  return ["aprobado", "abonado", "parcial"].includes(estado);
}

function isTurnoExpirado(turno) {
  const estadoTurno = String(getEstadoTurno(turno) || "")
    .trim()
    .toLowerCase();
  const estadoPago = String(getEstadoPago(turno) || "")
    .trim()
    .toLowerCase();
  return estadoTurno === "expirado" || estadoPago === "expirado";
}

function normalizarTelefonoWhatsapp(value) {
  const digits = String(value || "").replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.startsWith("54")) return digits;
  return `54${digits}`;
}

function buildWhatsappUrl(cliente) {
  const telefono = normalizarTelefonoWhatsapp(
    cliente?.telefono || cliente?.phone || cliente?.celular || "",
  );
  if (!telefono) return "";

  const nombre = String(cliente?.nombre || "cliente").trim();
  const mensaje = `Hola ${nombre}, te escribimos desde Piel y Cejas.`;
  return `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`;
}

function createHistorialForm() {
  return {
    turnoId: "",
    servicioId: "",
    categoriaId: "",
    categoriaNombre: "",
    nombreServicio: "",
    fechaRegistro: new Date().toISOString().slice(0, 10),
    motivoConsulta: "",
    observaciones: "",
    evolucion: "",
    indicaciones: "",
  };
}

export default function ClientesAdminPanel() {
  const [clientes, setClientes] = useState([]);
  const [turnos, setTurnos] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [historialClinico, setHistorialClinico] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [clienteSeleccionadoId, setClienteSeleccionadoId] = useState("");
  const [guardandoFicha, setGuardandoFicha] = useState(false);
  const [historialForm, setHistorialForm] = useState(createHistorialForm());

  useEffect(() => {
    return onSnapshot(
      collection(db, "usuarios"),
      (snap) => {
        setClientes(
          snap.docs
            .map((docItem) => ({
              id: docItem.id,
              ...docItem.data(),
            }))
            .filter(
              (usuario) =>
                !usuario.esEmpleado && Number(usuario.nivel || 0) < 3,
            ),
        );
      },
      (error) => {
        console.error(
          "Error leyendo collection(usuarios) en ClientesAdminPanel",
          error,
        );
        setClientes([]);
      },
    );
  }, []);

  useEffect(() => {
    return onSnapshot(
      collection(db, "turnos"),
      (snap) => {
        setTurnos(
          snap.docs.map((docItem) => ({
            id: docItem.id,
            ...docItem.data(),
          })),
        );
      },
      (error) => {
        console.error(
          "Error leyendo collection(turnos) en ClientesAdminPanel",
          error,
        );
        setTurnos([]);
      },
    );
  }, []);

  useEffect(() => {
    return onSnapshot(
      collection(db, "pagos"),
      (snap) => {
        setPagos(
          snap.docs.map((docItem) => ({
            id: docItem.id,
            ...docItem.data(),
          })),
        );
      },
      (error) => {
        console.error(
          "Error leyendo collection(pagos) en ClientesAdminPanel",
          error,
        );
        setPagos([]);
      },
    );
  }, []);

  useEffect(() => {
    return onSnapshot(
      collection(db, "servicios"),
      (snap) => {
        setServicios(
          snap.docs.map((docItem) => ({
            id: docItem.id,
            ...docItem.data(),
          })),
        );
      },
      (error) => {
        console.error(
          "Error leyendo collection(servicios) en ClientesAdminPanel",
          error,
        );
        setServicios([]);
      },
    );
  }, []);

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
      (error) => {
        console.error(
          "Error leyendo subcollection(usuarios/{id}/historial_clinico) en ClientesAdminPanel",
          error,
        );
        setHistorialClinico([]);
      },
    );
  }, [clienteSeleccionadoId]);

  const clientesConResumen = useMemo(() => {
    const turnosById = Object.fromEntries(
      turnos.map((turno) => [turno.id, turno]),
    );

    return clientes
      .map((cliente) => {
        const turnosCliente = turnos.filter((turno) => {
          const refId = turno.clienteId || turno.usuarioId || turno.uid;
          return refId === cliente.id;
        });

        const pagosCliente = pagos.filter((pago) => {
          if (pago.clienteId) return pago.clienteId === cliente.id;
          return turnosCliente.some((turno) => turno.id === pago.turnoId);
        });

        const proximos = turnosCliente.filter((turno) => {
          const inicio = Number(turno.horaInicio || 0);
          return (
            inicio > Date.now() &&
            !["cancelado", "rechazado"].includes(getEstadoTurno(turno))
          );
        });

        const pagosContables = pagosCliente.filter((pago) => {
          if (!isPagoContable(pago)) return false;

          const turnoId = String(pago?.turnoId || "").trim();
          if (!turnoId) return true;

          const turnoRelacionado =
            turnosCliente.find((turno) => turno.id === turnoId) ||
            turnosById[turnoId];

          if (!turnoRelacionado) return true;
          return !isTurnoExpirado(turnoRelacionado);
        });

        const totalPagado = pagosContables.reduce(
          (acc, pago) => acc + Number(pago.monto || 0),
          0,
        );

        return {
          ...cliente,
          turnosCliente,
          pagosCliente,
          resumen: {
            totalTurnos: turnosCliente.length,
            proximos: proximos.length,
            totalPagado,
          },
        };
      })
      .sort((a, b) =>
        String(a.nombre || a.email || "").localeCompare(
          String(b.nombre || b.email || ""),
          "es",
        ),
      );
  }, [clientes, pagos, turnos]);

  const clientesFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return clientesConResumen;

    return clientesConResumen.filter((cliente) => {
      const blob = `
        ${cliente.nombre || ""}
        ${cliente.email || ""}
        ${cliente.telefono || ""}
        ${cliente.id}
      `.toLowerCase();

      return blob.includes(texto);
    });
  }, [busqueda, clientesConResumen]);

  useEffect(() => {
    if (!clientesFiltrados.length) {
      setClienteSeleccionadoId("");
      return;
    }

    const existe = clientesFiltrados.some(
      (cliente) => cliente.id === clienteSeleccionadoId,
    );

    if (!existe) {
      setClienteSeleccionadoId(clientesFiltrados[0].id);
    }
  }, [clienteSeleccionadoId, clientesFiltrados]);

  useEffect(() => {
    setHistorialForm(createHistorialForm());
  }, [clienteSeleccionadoId]);

  const clienteSeleccionado = useMemo(
    () =>
      clientesConResumen.find(
        (cliente) => cliente.id === clienteSeleccionadoId,
      ) || null,
    [clienteSeleccionadoId, clientesConResumen],
  );
  const whatsappClienteUrl = useMemo(
    () => buildWhatsappUrl(clienteSeleccionado),
    [clienteSeleccionado],
  );

  const turnosClienteOrdenados = useMemo(() => {
    if (!clienteSeleccionado) return [];
    return [...clienteSeleccionado.turnosCliente].sort(
      (a, b) => Number(b.horaInicio || 0) - Number(a.horaInicio || 0),
    );
  }, [clienteSeleccionado]);

  const serviciosOrdenados = useMemo(() => {
    return [...servicios].sort((a, b) =>
      String(a.nombreServicio || "").localeCompare(
        String(b.nombreServicio || ""),
        "es",
      ),
    );
  }, [servicios]);

  const resumenGeneral = useMemo(() => {
    return clientesConResumen.reduce(
      (acc, cliente) => {
        acc.total += 1;
        if (cliente.resumen.proximos > 0) acc.conTurnos += 1;
        acc.totalPagado += cliente.resumen.totalPagado;
        return acc;
      },
      {
        total: 0,
        conTurnos: 0,
        totalPagado: 0,
      },
    );
  }, [clientesConResumen]);

  function updateHistorialForm(field, value) {
    setHistorialForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function handleTurnoChange(turnoId) {
    if (!turnoId) {
      setHistorialForm((prev) => ({
        ...prev,
        turnoId: "",
      }));
      return;
    }

    const turno = turnosClienteOrdenados.find((item) => item.id === turnoId);
    if (!turno) return;

    setHistorialForm((prev) => ({
      ...prev,
      turnoId,
      servicioId: turno.servicioId || prev.servicioId,
      categoriaId: turno.categoriaId || prev.categoriaId,
      categoriaNombre: turno.categoriaNombre || prev.categoriaNombre,
      nombreServicio: turno.nombreServicio || prev.nombreServicio,
      fechaRegistro:
        turno.fecha ||
        prev.fechaRegistro ||
        new Date().toISOString().slice(0, 10),
    }));
  }

  function handleServicioChange(servicioId) {
    if (!servicioId) {
      setHistorialForm((prev) => ({
        ...prev,
        servicioId: "",
        categoriaId: "",
        categoriaNombre: "",
        nombreServicio: "",
      }));
      return;
    }

    const servicio = serviciosOrdenados.find((item) => item.id === servicioId);
    if (!servicio) return;

    setHistorialForm((prev) => ({
      ...prev,
      servicioId,
      categoriaId: servicio.categoriaId || "",
      categoriaNombre: servicio.categoriaNombre || "",
      nombreServicio: servicio.nombreServicio || "",
    }));
  }

  async function guardarFichaClinica() {
    if (!clienteSeleccionadoId || guardandoFicha) return;

    if (!historialForm.fechaRegistro) {
      await swalError({
        title: "Falta la fecha",
        text: "Completa la fecha del registro clinico.",
      });
      return;
    }

    if (
      !historialForm.motivoConsulta.trim() &&
      !historialForm.observaciones.trim() &&
      !historialForm.evolucion.trim() &&
      !historialForm.indicaciones.trim()
    ) {
      await swalError({
        title: "Ficha incompleta",
        text: "Ingresa al menos motivo, observaciones, evolucion o indicaciones.",
      });
      return;
    }

    setGuardandoFicha(true);
    showLoading({
      title: "Guardando ficha clinica",
      text: "Registrando antecedente del cliente...",
    });

    try {
      await addDoc(
        collection(db, "usuarios", clienteSeleccionadoId, "historial_clinico"),
        {
          clienteId: clienteSeleccionadoId,
          turnoId: historialForm.turnoId || null,
          servicioId: historialForm.servicioId || null,
          categoriaId: historialForm.categoriaId || null,
          categoriaNombre: historialForm.categoriaNombre || "",
          nombreServicio: historialForm.nombreServicio || "",
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
        title: "Ficha guardada",
        text: "El historial clinico del cliente se actualizo correctamente.",
      });
    } catch (error) {
      console.error("Error guardando ficha clinica", error);
      await swalError({
        title: "No se pudo guardar",
        text: "Ocurrio un error al registrar la ficha clinica.",
      });
    } finally {
      hideLoading();
      setGuardandoFicha(false);
    }
  }

  async function eliminarFichaClinica(fichaId) {
    if (!clienteSeleccionadoId || !fichaId) return;

    const result = await Swal.fire({
      title: "Eliminar registro clinico",
      text: "Esta accion quitara la ficha del historial del cliente.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Eliminar",
      cancelButtonText: "Cancelar",
    });

    if (!result.isConfirmed) return;

    showLoading({
      title: "Eliminando ficha",
      text: "Actualizando historial clinico...",
    });

    try {
      await deleteDoc(
        doc(
          db,
          "usuarios",
          clienteSeleccionadoId,
          "historial_clinico",
          fichaId,
        ),
      );

      await swalSuccess({
        title: "Ficha eliminada",
        text: "El registro clinico se elimino correctamente.",
      });
    } catch (error) {
      console.error("Error eliminando ficha clinica", error);
      await swalError({
        title: "No se pudo eliminar",
        text: "Ocurrio un error al eliminar la ficha clinica.",
      });
    } finally {
      hideLoading();
    }
  }

  return (
    <div className="admin-panel clientes-admin-page">
      <section className="clientes-admin-hero">
        <div className="clientes-admin-hero-copy">
          <p className="clientes-admin-eyebrow">Relacion con clientes</p>
          <h2 className="clientes-admin-title">Clientes e historial</h2>
          <p className="clientes-admin-subtitle">
            Consulta datos de contacto, turnos, pagos y ahora tambien la ficha
            clinica desde una vista centralizada.
          </p>
        </div>

        <div className="clientes-admin-summary">
          <article className="clientes-summary-card">
            <span>Clientes</span>
            <strong>{resumenGeneral.total}</strong>
          </article>
          <article className="clientes-summary-card">
            <span>Con proximos turnos</span>
            <strong>{resumenGeneral.conTurnos}</strong>
          </article>
          <article className="clientes-summary-card">
            <span>Pagos registrados</span>
            <strong>{formatMoney(resumenGeneral.totalPagado)}</strong>
          </article>
        </div>
      </section>

      <section className="clientes-admin-shell">
        <div className="clientes-admin-list-panel">
          <div className="clientes-admin-head">
            <div>
              <h3>Listado</h3>
              <p>
                Busca un cliente y selecciona para ver su historial completo.
              </p>
            </div>

            <input
              className="turnos-filtro-control"
              type="text"
              placeholder="Nombre, email o telefono"
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
            />
          </div>

          <div className="clientes-admin-list">
            {clientesFiltrados.map((cliente) => (
              <button
                key={cliente.id}
                type="button"
                className={`clientes-admin-item ${
                  cliente.id === clienteSeleccionadoId ? "is-active" : ""
                }`}
                onClick={() => setClienteSeleccionadoId(cliente.id)}
              >
                <div className="clientes-admin-item-copy">
                  <strong>{cliente.nombre || "Sin nombre"}</strong>
                  <span>{cliente.email || "Sin email"}</span>
                  <small>{cliente.telefono || "Sin telefono"}</small>
                </div>

                <div className="clientes-admin-item-meta">
                  <span>{cliente.resumen.totalTurnos} turnos</span>
                  <span>{formatMoney(cliente.resumen.totalPagado)}</span>
                </div>
              </button>
            ))}

            {!clientesFiltrados.length ? (
              <div className="clientes-admin-empty">
                No hay clientes para esa busqueda.
              </div>
            ) : null}
          </div>
        </div>

        <div className="clientes-admin-detail-panel">
          {clienteSeleccionado ? (
            <>
              <div className="clientes-detail-hero">
                <div>
                  <span className="clientes-detail-kicker">
                    Cliente seleccionado
                  </span>
                  <h3>{clienteSeleccionado.nombre || "Sin nombre"}</h3>
                  <p>
                    {clienteSeleccionado.email || "Sin email"}
                  </p>
                  <div className="clientes-contact-row">
                    <span>
                      {clienteSeleccionado.telefono || "Sin telefono"}
                    </span>
                    {whatsappClienteUrl ? (
                      <a
                        href={whatsappClienteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="clientes-whatsapp-btn"
                      >
                        <img
                          src={whatsappIcon}
                          alt=""
                          aria-hidden="true"
                          className="clientes-whatsapp-icon"
                        />
                        WhatsApp
                      </a>
                    ) : null}
                  </div>
                </div>

                <div className="clientes-detail-stats">
                  <span>{clienteSeleccionado.resumen.totalTurnos} turnos</span>
                  <span>{clienteSeleccionado.resumen.proximos} proximos</span>
                  <span>
                    {formatMoney(clienteSeleccionado.resumen.totalPagado)}{" "}
                    pagado
                  </span>
                </div>
              </div>

              <div className="clientes-history-grid">
                <section className="clientes-history-card">
                  <div className="clientes-history-head">
                    <h4>Historial de turnos</h4>
                    <span>{clienteSeleccionado.turnosCliente.length}</span>
                  </div>

                  <div className="clientes-history-list">
                    {turnosClienteOrdenados.map((turno) => (
                      <article key={turno.id} className="clientes-history-item">
                        <div>
                          <strong>{turno.nombreServicio || "Servicio"}</strong>
                          <span>{formatDateTime(turno.horaInicio)}</span>
                        </div>
                        <div className="clientes-history-meta">
                          <span>{getEstadoTurno(turno)}</span>
                          <small>{turno.nombreGabinete || "-"}</small>
                        </div>
                      </article>
                    ))}

                    {!clienteSeleccionado.turnosCliente.length ? (
                      <div className="clientes-admin-empty">
                        Este cliente todavia no tiene turnos.
                      </div>
                    ) : null}
                  </div>
                </section>

                <section className="clientes-history-card">
                  <div className="clientes-history-head">
                    <h4>Historial de pagos</h4>
                    <span>{clienteSeleccionado.pagosCliente.length}</span>
                  </div>

                  <div className="clientes-history-list">
                    {[...clienteSeleccionado.pagosCliente]
                      .sort(
                        (a, b) =>
                          getTimestampMs(
                            b.aprobadoEn || b.creadoEn || b.createdAt,
                          ) -
                          getTimestampMs(
                            a.aprobadoEn || a.creadoEn || a.createdAt,
                          ),
                      )
                      .map((pago) => (
                        <article
                          key={pago.id}
                          className="clientes-history-item"
                        >
                          <div>
                            <strong>{formatMoney(pago.monto)}</strong>
                            <span>
                              {pago.nombreServicio || pago.turnoId || "Pago"}
                            </span>
                          </div>
                          <div className="clientes-history-meta">
                            <span>{getEstadoPago(pago)}</span>
                            <small>{pago.metodo || "-"}</small>
                          </div>
                        </article>
                      ))}

                    {!clienteSeleccionado.pagosCliente.length ? (
                      <div className="clientes-admin-empty">
                        Este cliente todavia no tiene pagos.
                      </div>
                    ) : null}
                  </div>
                </section>
              </div>

              <section className="clientes-clinico-card">
                <div className="clientes-history-head clientes-history-head-clinico">
                  <div>
                    <h4>Historial clinico</h4>
                    <p>
                      Registra motivo, observaciones, evolucion e indicaciones
                      por cliente, asociando categoria o servicio cuando haga
                      falta.
                    </p>
                  </div>
                  <span>{historialClinico.length}</span>
                </div>

                <div className="clientes-clinico-form">
                  <div className="clientes-clinico-grid">
                    <div className="turnos-filtro-item">
                      <label>Turno relacionado</label>
                      <select
                        className="turnos-filtro-control"
                        value={historialForm.turnoId}
                        onChange={(e) => handleTurnoChange(e.target.value)}
                      >
                        <option value="">Sin vincular</option>
                        {turnosClienteOrdenados.map((turno) => (
                          <option key={turno.id} value={turno.id}>
                            {turno.nombreServicio || "Servicio"} |{" "}
                            {formatDateTime(turno.horaInicio)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="turnos-filtro-item">
                      <label>Servicio</label>
                      <select
                        className="turnos-filtro-control"
                        value={historialForm.servicioId}
                        onChange={(e) => handleServicioChange(e.target.value)}
                      >
                        <option value="">Sin servicio puntual</option>
                        {serviciosOrdenados.map((servicio) => (
                          <option key={servicio.id} value={servicio.id}>
                            {servicio.nombreServicio}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="turnos-filtro-item">
                      <label>Categoría</label>
                      <input
                        className="turnos-filtro-control"
                        type="text"
                        placeholder="Categoría o area"
                        value={historialForm.categoriaNombre}
                        onChange={(e) =>
                          updateHistorialForm("categoriaNombre", e.target.value)
                        }
                      />
                    </div>

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

                    <div className="turnos-filtro-item turnos-filtro-item--buscar clientes-clinico-full">
                      <label>Motivo o consulta</label>
                      <textarea
                        className="turnos-filtro-control clientes-clinico-textarea"
                        placeholder="Motivo de consulta, antecedentes relevantes o contexto de la visita"
                        value={historialForm.motivoConsulta}
                        onChange={(e) =>
                          updateHistorialForm("motivoConsulta", e.target.value)
                        }
                      />
                    </div>

                    <div className="turnos-filtro-item turnos-filtro-item--buscar clientes-clinico-full">
                      <label>Observaciones</label>
                      <textarea
                        className="turnos-filtro-control clientes-clinico-textarea"
                        placeholder="Diagnostico estetico, hallazgos, sensibilidad, zonas tratadas, etc."
                        value={historialForm.observaciones}
                        onChange={(e) =>
                          updateHistorialForm("observaciones", e.target.value)
                        }
                      />
                    </div>

                    <div className="turnos-filtro-item turnos-filtro-item--buscar">
                      <label>Evolucion</label>
                      <textarea
                        className="turnos-filtro-control clientes-clinico-textarea"
                        placeholder="Evolucion posterior o respuesta al tratamiento"
                        value={historialForm.evolucion}
                        onChange={(e) =>
                          updateHistorialForm("evolucion", e.target.value)
                        }
                      />
                    </div>

                    <div className="turnos-filtro-item turnos-filtro-item--buscar">
                      <label>Indicaciones</label>
                      <textarea
                        className="turnos-filtro-control clientes-clinico-textarea"
                        placeholder="Cuidados, recomendaciones o proximos pasos"
                        value={historialForm.indicaciones}
                        onChange={(e) =>
                          updateHistorialForm("indicaciones", e.target.value)
                        }
                      />
                    </div>
                  </div>

                  <div className="clientes-clinico-actions">
                    <button
                      type="button"
                      className="turnos-filtros-clear"
                      onClick={() => setHistorialForm(createHistorialForm())}
                    >
                      Limpiar ficha
                    </button>
                    <button
                      type="button"
                      className="swal-btn-guardar"
                      onClick={guardarFichaClinica}
                      disabled={guardandoFicha}
                    >
                      {guardandoFicha
                        ? "Guardando..."
                        : "Guardar ficha clinica"}
                    </button>
                  </div>
                </div>

                <div className="clientes-clinico-list">
                  {historialClinico.map((ficha) => (
                    <article key={ficha.id} className="clientes-clinico-item">
                      <div className="clientes-clinico-item-head">
                        <div className="clientes-clinico-tags">
                          <span className="clientes-clinico-date">
                            {formatDateShort(ficha.fechaRegistro)}
                          </span>
                          {ficha.categoriaNombre ? (
                            <span className="clientes-clinico-chip">
                              {ficha.categoriaNombre}
                            </span>
                          ) : null}
                          {ficha.nombreServicio ? (
                            <span className="clientes-clinico-chip clientes-clinico-chip-soft">
                              {ficha.nombreServicio}
                            </span>
                          ) : null}
                        </div>

                        <button
                          type="button"
                          className="clientes-clinico-delete"
                          onClick={() => eliminarFichaClinica(ficha.id)}
                        >
                          Eliminar
                        </button>
                      </div>

                      <div className="clientes-clinico-body">
                        {ficha.motivoConsulta ? (
                          <div className="clientes-clinico-block">
                            <strong>Motivo</strong>
                            <p>{ficha.motivoConsulta}</p>
                          </div>
                        ) : null}

                        {ficha.observaciones ? (
                          <div className="clientes-clinico-block">
                            <strong>Observaciones</strong>
                            <p>{ficha.observaciones}</p>
                          </div>
                        ) : null}

                        {ficha.evolucion ? (
                          <div className="clientes-clinico-block">
                            <strong>Evolucion</strong>
                            <p>{ficha.evolucion}</p>
                          </div>
                        ) : null}

                        {ficha.indicaciones ? (
                          <div className="clientes-clinico-block">
                            <strong>Indicaciones</strong>
                            <p>{ficha.indicaciones}</p>
                          </div>
                        ) : null}
                      </div>

                      <div className="clientes-clinico-meta">
                        <span>Creado {formatDateTime(ficha.createdAt)}</span>
                        {ficha.turnoId ? (
                          <small>Turno {ficha.turnoId}</small>
                        ) : null}
                      </div>
                    </article>
                  ))}

                  {!historialClinico.length ? (
                    <div className="clientes-admin-empty">
                      Este cliente todavia no tiene registros en el historial
                      clinico.
                    </div>
                  ) : null}
                </div>
              </section>
            </>
          ) : (
            <div className="clientes-admin-empty">
              Selecciona un cliente para ver su historial.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

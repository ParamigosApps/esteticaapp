import { useEffect, useState, useMemo } from "react";

import {
  swalElegirTipoPago,
  swalInputNumber,
  swalSuccess,
  swalError,
} from "../../../public/utils/swalUtils.js";

import { db } from "../../../Firebase";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  query,
  orderBy,
} from "firebase/firestore";

function getEstadoTurno(t) {
  if (t?.estadoTurno) return t.estadoTurno;

  switch (t?.estado) {
    case "pendiente_pago":
    case "pendiente_pago_mp":
      return "pendiente";
    case "pendiente_aprobacion":
      return "pendiente_aprobacion";
    case "señado":
    case "confirmado":
      return "confirmado";
    case "cancelado":
      return "cancelado";
    case "rechazado":
      return "rechazado";
    case "vencido":
    case "expirado":
      return "cancelado";
    default:
      return "pendiente";
  }
}

function getEstadoPago(t) {
  if (t?.estadoPago) return t.estadoPago;

  switch (t?.estado) {
    case "pendiente_pago":
    case "pendiente_pago_mp":
      return "pendiente";
    case "pendiente_aprobacion":
      return "pendiente_aprobacion";
    case "señado":
      return "parcial";
    case "confirmado": {
      const total = Number(t?.montoTotal ?? t?.precioTotal ?? t?.total ?? 0);
      const pagado = Number(t?.montoPagado ?? t?.pagadoTotal ?? 0);

      if (total > 0 && pagado > 0 && pagado < total) return "parcial";
      if (total > 0 && pagado >= total) return "abonado";
      return total > 0 ? "pendiente" : "abonado";
    }
    case "rechazado":
      return "rechazado";
    case "vencido":
    case "expirado":
      return "expirado";
    default:
      return "pendiente";
  }
}

function getMontoAValidarPago(t) {
  const total = Number(t?.montoTotal ?? t?.precioTotal ?? t?.total ?? 0);

  const anticipo = Number(
    t?.montoAnticipo ?? t?.montoSena ?? t?.seña ?? t?.sena ?? 0,
  );

  const pagado = Number(t?.montoPagado ?? t?.pagadoTotal ?? 0);

  if (pagado > 0) return pagado;

  if (anticipo > 0 && anticipo < total) return anticipo;

  return total;
}

function getMetodoPagoEsperado(t) {
  return t?.metodoPagoEsperado || t?.metodoPago || "manual";
}

async function pedirConfirmacionPago(turno) {
  const total = Number(
    turno?.montoTotal ?? turno?.precioTotal ?? turno?.total ?? 0,
  );

  const anticipo = Number(
    turno?.montoAnticipo ?? turno?.montoSena ?? turno?.seña ?? turno?.sena ?? 0,
  );

  const pagadoActual = Number(turno?.montoPagado ?? turno?.pagadoTotal ?? 0);

  const montoSugeridoParcial =
    pagadoActual > 0 ? pagadoActual : anticipo > 0 ? anticipo : 0;

  const resTipo = await swalElegirTipoPago({
    title: "Confirmar pago",
    html: `
      <div style="text-align:left;font-size:14px;">
        <div><b>Servicio:</b> ${turno?.nombreServicio || "-"}</div>
        <div><b>Total:</b> $${total.toLocaleString("es-AR")}</div>
        ${
          anticipo > 0
            ? `<div><b>Seña sugerida:</b> $${anticipo.toLocaleString("es-AR")}</div>`
            : ""
        }
      </div>
    `,
    confirmText: "Pago total",
    denyText: "Pago parcial / seña",
    cancelText: "Cancelar",
  });

  if (resTipo.isDismissed) return null;

  if (resTipo.isConfirmed) {
    return {
      estadoPago: "abonado",
      montoPagado: total > 0 ? total : pagadoActual,
    };
  }

  const resMonto = await swalInputNumber({
    title: "Ingresá el monto parcial / seña",
    inputValue: montoSugeridoParcial > 0 ? String(montoSugeridoParcial) : "",
    placeholder: "Ej: 5000",
    confirmText: "Guardar pago parcial",
    cancelText: "Cancelar",
    min: "0",
    step: "1",
    inputValidator: (value) => {
      if (value === "" || value == null) return "Ingresá un monto";

      const monto = Number(value);

      if (Number.isNaN(monto) || monto <= 0) {
        return "Ingresá un monto válido";
      }

      if (total > 0 && monto > total) {
        return "No puede ser mayor al total";
      }

      return null;
    },
  });

  if (!resMonto.isConfirmed) return null;

  const monto = Number(resMonto.value);

  return {
    estadoPago: total > 0 && monto >= total ? "abonado" : "parcial",
    montoPagado: monto,
  };
}

export default function TurnosAdminPanel() {
  const [turnos, setTurnos] = useState([]);
  const [clientes, setClientes] = useState({});
  const [gabinetes, setGabinetes] = useState({});
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [fechaFiltro, setFechaFiltro] = useState("");

  // ==============================
  // TURNOS
  // ==============================
  useEffect(() => {
    const q = query(
      collection(db, "turnos"),
      orderBy("fecha", "asc"),
      orderBy("horaInicio", "asc"),
    );

    return onSnapshot(q, (snap) => {
      setTurnos(
        snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })),
      );
    });
  }, []);

  // ==============================
  // CLIENTES
  // ==============================
  useEffect(() => {
    return onSnapshot(collection(db, "usuarios"), (snap) => {
      const map = {};
      snap.docs.forEach((d) => {
        map[d.id] = d.data();
      });
      setClientes(map);
    });
  }, []);

  // ==============================
  // GABINETES
  // ==============================
  useEffect(() => {
    return onSnapshot(collection(db, "gabinetes"), (snap) => {
      const map = {};
      snap.docs.forEach((d) => {
        map[d.id] = d.data();
      });
      setGabinetes(map);
    });
  }, []);

  function formatearDuracion(inicio, fin) {
    const minutos = Math.round((Number(fin) - Number(inicio)) / 60000);

    if (minutos >= 60) {
      const horas = Math.floor(minutos / 60);
      const resto = minutos % 60;
      return resto > 0 ? `${horas}h ${resto}m` : `${horas}h`;
    }

    return `${minutos} min`;
  }

  function formatearHora(timestamp) {
    if (!timestamp) return "-";

    return new Date(Number(timestamp)).toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatearFecha(fechaISO) {
    if (!fechaISO) return "-";

    const [year, month, day] = fechaISO.split("-");
    return `${day}/${month}/${year}`;
  }

  // ==============================
  // FILTROS
  // ==============================
  const turnosFiltrados = useMemo(() => {
    return turnos.filter((t) => {
      const estadoTurno = getEstadoTurno(t);

      if (filtroEstado !== "todos" && estadoTurno !== filtroEstado)
        return false;
      if (fechaFiltro && t.fecha !== fechaFiltro) return false;

      return true;
    });
  }, [turnos, filtroEstado, fechaFiltro]);

  // ==============================
  // ACCIONES
  // ==============================
  async function aprobarPago(turno) {
    try {
      const pago = await pedirConfirmacionPago(turno);
      if (!pago) return;

      await updateDoc(doc(db, "turnos", turno.id), {
        estadoTurno: "confirmado",
        estadoPago: pago.estadoPago,
        montoPagado: pago.montoPagado,
        metodoPagoUsado: turno?.metodoPagoEsperado || "manual",
        aprobadoEn: serverTimestamp(),
        pagoAprobadoEn: serverTimestamp(),
        confirmadoAt: serverTimestamp(),
        venceEn: null,
        updatedAt: serverTimestamp(),
      });

      await swalSuccess({
        title: "Pago confirmado",
        text:
          pago.estadoPago === "parcial"
            ? "Se registró un pago parcial / seña."
            : "Se registró el pago total.",
      });
    } catch (error) {
      console.error("Error aprobando pago:", error);
      await swalError({
        title: "No se pudo confirmar el pago",
        text: "Ocurrió un error al actualizar el turno.",
      });
    }
  }

  async function aprobarTurnoYMarcarPago(turno) {
    try {
      const pago = await pedirConfirmacionPago(turno);
      if (!pago) return;

      await updateDoc(doc(db, "turnos", turno.id), {
        estadoTurno: "confirmado",
        estadoPago: pago.estadoPago,
        montoPagado: pago.montoPagado,
        metodoPagoUsado: turno?.metodoPagoEsperado || "manual",
        aprobadoEn: serverTimestamp(),
        pagoAprobadoEn: serverTimestamp(),
        confirmadoAt: serverTimestamp(),
        venceEn: null,
        updatedAt: serverTimestamp(),
      });

      await swalSuccess({
        title: "Turno aprobado",
        text:
          pago.estadoPago === "parcial"
            ? "El turno quedó confirmado con pago parcial / seña."
            : "El turno quedó confirmado con pago total.",
      });
    } catch (error) {
      console.error("Error aprobando turno y pago:", error);
      await swalError({
        title: "No se pudo aprobar el turno",
        text: "Ocurrió un error al actualizar el turno.",
      });
    }
  }

  async function rechazarTurno(turnoId) {
    await updateDoc(doc(db, "turnos", turnoId), {
      estadoTurno: "rechazado",
      estadoPago: "rechazado",
      rechazadoEn: serverTimestamp(),
      venceEn: null,
      updatedAt: serverTimestamp(),
    });
  }

  // ==============================
  // UI
  // ==============================
  function badgeEstadoTurno(estado) {
    const config = {
      pendiente: {
        texto: "Pendiente",
        color: "#546e7a",
      },
      pendiente_aprobacion: {
        texto: "Pendiente aprobación",
        color: "#ef6c00",
      },
      confirmado: {
        texto: "Confirmado",
        color: "#2e7d32",
      },
      rechazado: {
        texto: "Rechazado",
        color: "#c62828",
      },
      cancelado: {
        texto: "Cancelado",
        color: "#6d4c41",
      },
      perdido: {
        texto: "Perdido",
        color: "#8d6e63",
      },
      finalizado: {
        texto: "Finalizado",
        color: "#1565c0",
      },
    };

    const data = config[estado] || {
      texto: estado || "Desconocido",
      color: "#999",
    };

    return (
      <span
        style={{
          display: "inline-block",
          padding: "4px 8px",
          borderRadius: 6,
          fontSize: 12,
          backgroundColor: data.color,
          color: "white",
          whiteSpace: "nowrap",
        }}
      >
        {data.texto}
      </span>
    );
  }

  function badgeEstadoPago(turno) {
    const estado = getEstadoPago(turno);
    const metodo = getMetodoPagoEsperado(turno);

    let data;

    if (estado === "pendiente" && metodo === "mercadopago") {
      data = {
        texto: "Esperando MercadoPago",
        color: "#6f42c1",
      };
    } else if (estado === "pendiente" && metodo === "manual") {
      data = {
        texto: "Pago pendiente",
        color: "#fb8c00",
      };
    } else if (estado === "pendiente_aprobacion" && metodo === "manual") {
      data = {
        texto: "Comprobante recibido",
        color: "#fb8c00",
      };
    } else {
      const config = {
        pendiente: {
          texto: "Pago pendiente",
          color: "#fb8c00",
        },
        pendiente_aprobacion: {
          texto: "Falta confirmar pago",
          color: "#fb8c00",
        },
        parcial: {
          texto: "Seña abonada",
          color: "#3949ab",
        },
        abonado: {
          texto: "Abonado",
          color: "#2e7d32",
        },
        rechazado: {
          texto: "Rechazado",
          color: "#c62828",
        },
        expirado: {
          texto: "Expirado",
          color: "#757575",
        },
        reembolsado: {
          texto: "Reembolsado",
          color: "#00897b",
        },
      };

      data = config[estado] || {
        texto: estado || "Desconocido",
        color: "#999",
      };
    }

    return (
      <span
        style={{
          display: "inline-block",
          padding: "4px 8px",
          borderRadius: 6,
          fontSize: 12,
          backgroundColor: data.color,
          color: "white",
          whiteSpace: "nowrap",
        }}
      >
        {data.texto}
      </span>
    );
  }

  return (
    <div className="admin-panel">
      <h2>Turnos / Reservas</h2>

      {/* FILTROS */}
      <div style={{ marginBottom: 16 }}>
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
        >
          <option value="todos">Todos</option>
          <option value="pendiente">Pendientes</option>
          <option value="pendiente_aprobacion">Pendiente aprobación</option>
          <option value="confirmado">Confirmados</option>
          <option value="rechazado">Rechazados</option>
          <option value="cancelado">Cancelados</option>
          <option value="perdido">Perdidos</option>
          <option value="finalizado">Finalizados</option>
        </select>

        <input
          className="input-admin"
          type="date"
          value={fechaFiltro}
          onChange={(e) => setFechaFiltro(e.target.value)}
        />
      </div>

      {/* TABLA */}
      <div className="tabla-turnos-wrapper">
        <table className="tabla-turnos">
          <colgroup>
            <col style={{ width: "90px" }} />
            <col style={{ width: "100px" }} />
            <col style={{ width: "60px" }} />
            <col style={{ width: "160px" }} />
            <col style={{ width: "200px" }} />
            <col style={{ width: "100px" }} />
            <col style={{ width: "140px" }} />
            <col style={{ width: "140px" }} />
            <col style={{ width: "180px" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Horario</th>
              <th>Duración</th>
              <th>Cliente</th>
              <th>Servicio</th>
              <th>Gabinete</th>
              <th>Estado turno</th>
              <th>Estado pago</th>
              <th>Acciones</th>
            </tr>
          </thead>

          <tbody>
            {turnosFiltrados.map((t) => {
              const cliente = clientes[t.clienteId || t.usuarioId || t.uid];
              const gabinete = gabinetes[t.gabineteId];

              const ahora = new Date().getTime();
              const estadoTurno = getEstadoTurno(t);
              const estadoPago = getEstadoPago(t);

              const metodoPagoEsperado = getMetodoPagoEsperado(t);
              const esPagoMP = metodoPagoEsperado === "mercadopago";
              const esPagoManual = metodoPagoEsperado === "manual";

              const mostrarChequeoManual =
                esPagoManual &&
                ["pendiente", "pendiente_aprobacion"].includes(estadoPago);

              const puedeAprobarPagoManual =
                esPagoManual && estadoPago === "pendiente_aprobacion";

              const puedeAprobarTurnoYMarcarPago =
                esPagoManual && estadoPago === "pendiente";

              return (
                <tr key={t.id}>
                  <td>{formatearFecha(t.fecha)}</td>

                  <td>
                    {formatearHora(t.horaInicio)} - {formatearHora(t.horaFin)}
                  </td>

                  <td>{formatearDuracion(t.horaInicio, t.horaFin)}</td>

                  <td>
                    {cliente?.nombre ||
                      cliente?.email ||
                      t.nombreCliente ||
                      t.email ||
                      (t.clienteId || t.usuarioId || t.uid || "").slice(0, 8)}
                  </td>

                  <td>{t.nombreServicio}</td>

                  <td>
                    {gabinete?.nombreGabinete ||
                      t.nombreGabinete ||
                      t.gabineteId}
                  </td>

                  <td>
                    {badgeEstadoTurno(estadoTurno)}
                    {t.venceEn &&
                      t.venceEn < ahora &&
                      estadoTurno !== "confirmado" && (
                        <div
                          style={{
                            fontSize: 10,
                            color: "#c62828",
                            marginTop: 4,
                          }}
                        >
                          Vencido
                        </div>
                      )}
                  </td>

                  <td>
                    {badgeEstadoPago(t)}

                    {metodoPagoEsperado && (
                      <div
                        style={{ fontSize: 11, marginTop: 4, opacity: 0.75 }}
                      >
                        Método: {metodoPagoEsperado}
                      </div>
                    )}

                    {t.metodoPagoUsado && (
                      <div
                        style={{ fontSize: 11, marginTop: 2, opacity: 0.75 }}
                      >
                        Cobrado por: {t.metodoPagoUsado}
                      </div>
                    )}

                    {typeof t.montoTotal !== "undefined" && (
                      <div style={{ fontSize: 11, marginTop: 4, opacity: 0.8 }}>
                        ${Number(t.montoPagado || 0).toLocaleString("es-AR")} /
                        ${Number(t.montoTotal || 0).toLocaleString("es-AR")}
                      </div>
                    )}

                    {mostrarChequeoManual && (
                      <div
                        style={{
                          fontSize: 11,
                          marginTop: 4,
                          color: "#ef6c00",
                          fontWeight: 600,
                        }}
                      >
                        Chequear recibido: $
                        {Number(getMontoAValidarPago(t)).toLocaleString(
                          "es-AR",
                        )}
                      </div>
                    )}

                    {esPagoMP && estadoPago === "pendiente" && (
                      <div
                        style={{ fontSize: 11, marginTop: 4, color: "#6f42c1" }}
                      >
                        Esperando acreditación o webhook de MP
                      </div>
                    )}
                  </td>

                  <td>
                    {![
                      "cancelado",
                      "rechazado",
                      "perdido",
                      "finalizado",
                    ].includes(estadoTurno) && (
                      <>
                        {puedeAprobarPagoManual && (
                          <>
                            <button
                              className="swal-btn-aprobar"
                              onClick={() => aprobarPago(t)}
                            >
                              Aprobar pago
                            </button>

                            <button
                              className="swal-btn-rechazar"
                              onClick={() => rechazarTurno(t.id)}
                            >
                              Rechazar
                            </button>
                          </>
                        )}

                        {puedeAprobarTurnoYMarcarPago && (
                          <button
                            className="swal-btn-aprobar"
                            onClick={() => aprobarTurnoYMarcarPago(t)}
                          >
                            Aprobar turno + marcar pago
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

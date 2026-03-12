import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import Swal from "sweetalert2";
import { db, functions } from "../../../Firebase";
import { swalError, swalSuccess } from "../../../public/utils/swalUtils.js";
import { hideLoading, showLoading } from "../../../services/loadingService.js";

function getTimestampMs(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value?.toMillis === "function") return value.toMillis();
  return 0;
}

function formatMoney(value) {
  return `$${Number(value || 0).toLocaleString("es-AR")}`;
}

function formatDate(value) {
  const ms = getTimestampMs(value);
  if (!ms) return "-";
  return new Date(ms).toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatMetodo(value) {
  switch (value) {
    case "mercadopago":
      return "Mercado Pago";
    case "transferencia":
      return "Transferencia";
    case "efectivo":
      return "Efectivo";
    default:
      return value || "-";
  }
}

function formatTipo(value) {
  if (!value) return "-";
  return String(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildLiquidacionPdf(liquidacion) {
  const doc = new jsPDF();
  const pagosDetalle = [...(liquidacion.pagosLiquidacion || [])].sort(
    (a, b) =>
      getTimestampMs(b.aprobadoEn || b.creadoEn || b.createdAt) -
      getTimestampMs(a.aprobadoEn || a.creadoEn || a.createdAt),
  );

  doc.setFontSize(18);
  doc.text("Liquidacion", 14, 18);
  doc.setFontSize(10);
  doc.text(`ID: ${liquidacion.id}`, 14, 26);
  doc.text(
    `Fecha: ${formatDate(liquidacion.createdAt || liquidacion.updatedAt)}`,
    14,
    32,
  );
  doc.text(
    `Cantidad de pagos: ${liquidacion.cantidadPagos || pagosDetalle.length}`,
    14,
    38,
  );
  doc.text(
    `Bruto: ${formatMoney(liquidacion.totalBruto ?? liquidacion.total)}`,
    120,
    26,
  );
  doc.text(
    `Comision: ${formatMoney(liquidacion.totalComisiones)}`,
    120,
    32,
  );
  doc.text(
    `Neto: ${formatMoney(liquidacion.totalLiquidable)}`,
    120,
    38,
  );

  autoTable(doc, {
    startY: 46,
    head: [["Fecha", "Cliente", "Servicio", "Metodo", "Bruto", "Comision", "Neto"]],
    body: pagosDetalle.map((pago) => [
      formatDate(pago.aprobadoEn || pago.creadoEn || pago.createdAt),
      pago.clienteNombre,
      pago.nombreServicio,
      formatMetodo(pago.metodo),
      formatMoney(pago.monto),
      formatMoney(pago.montoComision),
      formatMoney(pago.montoLiquidable),
    ]),
    styles: {
      fontSize: 8.5,
      cellPadding: 2.6,
    },
    headStyles: {
      fillColor: [108, 73, 136],
    },
  });

  if (liquidacion.notas) {
    const finalY = doc.lastAutoTable?.finalY || 54;
    doc.setFontSize(10);
    doc.text("Notas", 14, finalY + 10);
    doc.setFontSize(9);
    doc.text(String(liquidacion.notas), 14, finalY + 16, {
      maxWidth: 180,
    });
  }

  return doc;
}

export default function LiquidacionesPanel() {
  const [pagos, setPagos] = useState([]);
  const [turnos, setTurnos] = useState({});
  const [liquidaciones, setLiquidaciones] = useState([]);
  const [filtroEstado, setFiltroEstado] = useState("pendientes");
  const [filtroMetodo, setFiltroMetodo] = useState("todos");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [notas, setNotas] = useState("");
  const [seleccionados, setSeleccionados] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [liquidacionSeleccionadaId, setLiquidacionSeleccionadaId] = useState("");
  const crearLiquidacionAdmin = httpsCallable(functions, "crearLiquidacionAdmin");

  useEffect(() => {
    return onSnapshot(collection(db, "pagos"), (snap) => {
      setPagos(
        snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })),
      );
    });
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, "turnos"), (snap) => {
      const map = {};
      snap.docs.forEach((d) => {
        map[d.id] = { id: d.id, ...d.data() };
      });
      setTurnos(map);
    });
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, "liquidaciones"), (snap) => {
      setLiquidaciones(
        snap.docs
          .map((docItem) => ({
            id: docItem.id,
            ...docItem.data(),
          }))
          .sort(
            (a, b) => getTimestampMs(b.createdAt || b.updatedAt) - getTimestampMs(a.createdAt || a.updatedAt),
          ),
      );
    });
  }, []);

  const pagosConDetalle = useMemo(() => {
    return pagos.map((pago) => {
      const turno = turnos[pago.turnoId] || {};

      return {
        ...pago,
        clienteNombre:
          pago.clienteNombre ||
          turno.clienteNombre ||
          turno.nombreCliente ||
          "-",
        nombreServicio: pago.nombreServicio || turno.nombreServicio || "-",
        profesionalNombre:
          pago.profesionalNombre || turno.profesionalNombre || "-",
        nombreGabinete: pago.nombreGabinete || turno.nombreGabinete || "-",
        metodo:
          pago.metodo || turno.metodoPagoUsado || turno.metodoPagoEsperado || "-",
        montoComision: Number(pago.montoComision || 0),
        montoLiquidable: Number(
          pago.montoLiquidable ??
            Number(pago.monto || 0) - Number(pago.montoComision || 0),
        ),
      };
    });
  }, [pagos, turnos]);

  const pagosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    const desdeMs = fechaDesde ? new Date(`${fechaDesde}T00:00:00`).getTime() : 0;
    const hastaMs = fechaHasta ? new Date(`${fechaHasta}T23:59:59`).getTime() : 0;

    return pagosConDetalle.filter((pago) => {
      const creadoMs = getTimestampMs(
        pago.aprobadoEn || pago.creadoEn || pago.createdAt,
      );

      if (filtroEstado === "pendientes" && pago.liquidado) return false;
      if (filtroEstado === "liquidados" && !pago.liquidado) return false;
      if (filtroMetodo !== "todos" && pago.metodo !== filtroMetodo) return false;
      if (desdeMs && creadoMs < desdeMs) return false;
      if (hastaMs && creadoMs > hastaMs) return false;

      if (texto) {
        const blob = `
          ${pago.id}
          ${pago.clienteNombre}
          ${pago.nombreServicio}
          ${pago.profesionalNombre}
          ${pago.nombreGabinete}
          ${pago.liquidacionId || ""}
        `.toLowerCase();

        if (!blob.includes(texto)) return false;
      }

      return pago.estado === "aprobado";
    });
  }, [pagosConDetalle, filtroEstado, filtroMetodo, fechaDesde, fechaHasta, busqueda]);

  const pagosSeleccionables = useMemo(
    () => pagosFiltrados.filter((pago) => !pago.liquidado),
    [pagosFiltrados],
  );

  const seleccionadosIds = useMemo(
    () =>
      Object.entries(seleccionados)
        .filter(([, checked]) => checked)
        .map(([id]) => id),
    [seleccionados],
  );

  const pagosSeleccionados = useMemo(
    () => pagosFiltrados.filter((pago) => seleccionadosIds.includes(pago.id)),
    [pagosFiltrados, seleccionadosIds],
  );

  const liquidacionesConDetalle = useMemo(() => {
    return liquidaciones.map((liquidacion) => {
      const pagosLiquidacion = pagosConDetalle.filter((pago) => {
        if (Array.isArray(liquidacion.pagosIds) && liquidacion.pagosIds.includes(pago.id)) {
          return true;
        }
        return pago.liquidacionId === liquidacion.id;
      });

      return {
        ...liquidacion,
        pagosLiquidacion,
      };
    });
  }, [liquidaciones, pagosConDetalle]);

  useEffect(() => {
    if (!liquidacionesConDetalle.length) {
      setLiquidacionSeleccionadaId("");
      return;
    }

    const existe = liquidacionesConDetalle.some(
      (item) => item.id === liquidacionSeleccionadaId,
    );

    if (!existe) {
      setLiquidacionSeleccionadaId(liquidacionesConDetalle[0].id);
    }
  }, [liquidacionSeleccionadaId, liquidacionesConDetalle]);

  const liquidacionSeleccionada = useMemo(
    () =>
      liquidacionesConDetalle.find(
        (item) => item.id === liquidacionSeleccionadaId,
      ) || null,
    [liquidacionSeleccionadaId, liquidacionesConDetalle],
  );

  const totalPendiente = useMemo(
    () =>
      pagosFiltrados
        .filter((pago) => !pago.liquidado)
        .reduce((acc, pago) => acc + Number(pago.monto || 0), 0),
    [pagosFiltrados],
  );

  const totalComisionPendiente = useMemo(
    () =>
      pagosFiltrados
        .filter((pago) => !pago.liquidado)
        .reduce((acc, pago) => acc + Number(pago.montoComision || 0), 0),
    [pagosFiltrados],
  );

  const totalNetoPendiente = useMemo(
    () =>
      pagosFiltrados
        .filter((pago) => !pago.liquidado)
        .reduce((acc, pago) => acc + Number(pago.montoLiquidable || 0), 0),
    [pagosFiltrados],
  );

  const totalSeleccionado = useMemo(
    () => pagosSeleccionados.reduce((acc, pago) => acc + Number(pago.monto || 0), 0),
    [pagosSeleccionados],
  );

  const totalComisionSeleccionada = useMemo(
    () =>
      pagosSeleccionados.reduce(
        (acc, pago) => acc + Number(pago.montoComision || 0),
        0,
      ),
    [pagosSeleccionados],
  );

  const totalNetoSeleccionado = useMemo(
    () =>
      pagosSeleccionados.reduce(
        (acc, pago) => acc + Number(pago.montoLiquidable || 0),
        0,
      ),
    [pagosSeleccionados],
  );

  const resumenHistorial = useMemo(() => {
    return liquidacionesConDetalle.reduce(
      (acc, liquidacion) => {
        acc.cantidad += 1;
        acc.totalBruto += Number(liquidacion.totalBruto ?? liquidacion.total ?? 0);
        acc.totalNeto += Number(liquidacion.totalLiquidable || 0);
        return acc;
      },
      {
        cantidad: 0,
        totalBruto: 0,
        totalNeto: 0,
      },
    );
  }, [liquidacionesConDetalle]);

  const hayFiltrosActivos = Boolean(
    filtroEstado !== "pendientes" ||
      filtroMetodo !== "todos" ||
      fechaDesde ||
      fechaHasta ||
      busqueda,
  );

  async function liquidarSeleccionados() {
    if (!pagosSeleccionados.length || guardando) return;

    const result = await Swal.fire({
      title: "Generar liquidacion",
      text: `Se van a liquidar ${pagosSeleccionados.length} pago(s) por ${formatMoney(totalNetoSeleccionado)} netos.`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Liquidar",
      cancelButtonText: "Cancelar",
    });

    if (!result.isConfirmed) return;

    setGuardando(true);
    showLoading({
      title: "Generando liquidacion",
      text: "Procesando pagos seleccionados...",
    });

    try {
      const resp = await crearLiquidacionAdmin({
        pagoIds: pagosSeleccionados.map((pago) => pago.id),
        notas: notas.trim() || null,
      });

      const liquidacionPdf = {
        id: resp.data?.liquidacionId || `liq-${Date.now()}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        cantidadPagos: pagosSeleccionados.length,
        totalBruto: totalSeleccionado,
        totalComisiones: totalComisionSeleccionada,
        totalLiquidable: totalNetoSeleccionado,
        notas: notas.trim() || "",
        pagosLiquidacion: pagosSeleccionados,
      };

      setSeleccionados({});
      setNotas("");

      buildLiquidacionPdf(liquidacionPdf).save(
        `liquidacion-${liquidacionPdf.id}.pdf`,
      );

      await swalSuccess({
        title: "Liquidacion generada",
        text: `Se creo la liquidacion ${resp.data?.liquidacionId || ""}`.trim(),
      });
    } catch (error) {
      console.error("Error liquidando pagos", error);
      await swalError({
        title: "No se pudo liquidar",
        text: error?.message || "Ocurrio un error al generar la liquidacion.",
      });
    } finally {
      hideLoading();
      setGuardando(false);
    }
  }

  function toggleSeleccion(id, checked) {
    setSeleccionados((prev) => ({
      ...prev,
      [id]: checked,
    }));
  }

  function toggleSeleccionPagina(checked) {
    const next = { ...seleccionados };
    pagosSeleccionables.forEach((pago) => {
      next[pago.id] = checked;
    });
    setSeleccionados(next);
  }

  function resetFiltros() {
    setFiltroEstado("pendientes");
    setFiltroMetodo("todos");
    setFechaDesde("");
    setFechaHasta("");
    setBusqueda("");
  }

  function exportarLiquidacionPdf(liquidacion) {
    if (!liquidacion) return;

    showLoading({
      title: "Generando PDF",
      text: "Preparando detalle de la liquidacion...",
    });

    try {
      buildLiquidacionPdf(liquidacion).save(`liquidacion-${liquidacion.id}.pdf`);
    } finally {
      hideLoading();
    }
  }

  function verLiquidacionPdf(liquidacion) {
    if (!liquidacion) return;

    showLoading({
      title: "Abriendo PDF",
      text: "Preparando vista previa de la liquidacion...",
    });

    try {
      const blob = buildLiquidacionPdf(liquidacion).output("blob");
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } finally {
      hideLoading();
    }
  }

  return (
    <div className="admin-panel liquidaciones-panel">
      <section className="liquidaciones-hero">
        <div className="liquidaciones-hero-copy">
          <span className="liquidaciones-eyebrow">Panel administrativo</span>
          <h2>Liquidaciones</h2>
          <p>
            Revisa pagos aprobados, genera cierres y consulta el historial con
            exportacion PDF desde un solo panel.
          </p>
        </div>

        <div className="liquidaciones-hero-status">
          <div className="liquidaciones-status-chip">
            <strong>{pagosFiltrados.length}</strong>
            <span>pagos visibles</span>
          </div>
          <div className="liquidaciones-status-chip liquidaciones-status-chip-soft">
            <strong>{pagosSeleccionados.length}</strong>
            <span>seleccionados</span>
          </div>
          <div className="liquidaciones-status-chip">
            <strong>{resumenHistorial.cantidad}</strong>
            <span>liquidaciones</span>
          </div>
        </div>
      </section>

      <section className="liquidaciones-toolbar">
        <div className="liquidaciones-surface liquidaciones-filtros-panel">
          <div className="liquidaciones-section-head">
            <div>
              <span className="liquidaciones-section-kicker">Filtros</span>
              <h3>Buscar y acotar pagos</h3>
            </div>
            {hayFiltrosActivos ? (
              <button
                type="button"
                className="liquidaciones-link-btn"
                onClick={resetFiltros}
              >
                Limpiar filtros
              </button>
            ) : null}
          </div>

          <div className="liquidaciones-filtros">
            <div className="turnos-filtro-item">
              <label htmlFor="liquidaciones-estado">Estado</label>
              <select
                id="liquidaciones-estado"
                className="turnos-filtro-control"
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value)}
              >
                <option value="pendientes">Pendientes</option>
                <option value="liquidados">Liquidados</option>
                <option value="todos">Todos</option>
              </select>
            </div>

            <div className="turnos-filtro-item">
              <label htmlFor="liquidaciones-metodo">Metodo</label>
              <select
                id="liquidaciones-metodo"
                className="turnos-filtro-control"
                value={filtroMetodo}
                onChange={(e) => setFiltroMetodo(e.target.value)}
              >
                <option value="todos">Todos los metodos</option>
                <option value="transferencia">Transferencia</option>
                <option value="mercadopago">Mercado Pago</option>
                <option value="efectivo">Efectivo</option>
              </select>
            </div>

            <div className="turnos-filtro-item">
              <label htmlFor="liquidaciones-desde">Desde</label>
              <input
                id="liquidaciones-desde"
                className="turnos-filtro-control"
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
              />
            </div>

            <div className="turnos-filtro-item">
              <label htmlFor="liquidaciones-hasta">Hasta</label>
              <input
                id="liquidaciones-hasta"
                className="turnos-filtro-control"
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
              />
            </div>

            <div className="turnos-filtro-item turnos-filtro-item--buscar">
              <label htmlFor="liquidaciones-busqueda">Busqueda</label>
              <input
                id="liquidaciones-busqueda"
                className="turnos-filtro-control"
                type="text"
                placeholder="Cliente, servicio, profesional o liquidacion"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>

            <div className="turnos-filtro-item turnos-filtro-item--buscar">
              <label htmlFor="liquidaciones-notas">Notas de liquidacion</label>
              <input
                id="liquidaciones-notas"
                className="turnos-filtro-control"
                type="text"
                placeholder="Observaciones internas para esta liquidacion"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="liquidaciones-surface liquidaciones-resumen-panel">
          <div className="liquidaciones-section-head">
            <div>
              <span className="liquidaciones-section-kicker">Resumen</span>
              <h3>Montos listos para liquidar</h3>
            </div>
            <p className="liquidaciones-selection-copy">
              {pagosSeleccionados.length
                ? `${pagosSeleccionados.length} pago(s) listo(s) para procesar`
                : "Selecciona pagos pendientes para generar una liquidacion"}
            </p>
          </div>

          <div className="liquidaciones-resumen">
            <div className="liquidaciones-card liquidaciones-card-strong">
              <span>Neto pendiente</span>
              <strong>{formatMoney(totalNetoPendiente)}</strong>
              <small>Disponible para liquidar</small>
            </div>
            <div className="liquidaciones-card">
              <span>Pendiente bruto</span>
              <strong>{formatMoney(totalPendiente)}</strong>
            </div>
            <div className="liquidaciones-card liquidaciones-card-muted">
              <span>Comision retenida</span>
              <strong>{formatMoney(totalComisionPendiente)}</strong>
            </div>
            <div className="liquidaciones-card">
              <span>Historico bruto</span>
              <strong>{formatMoney(resumenHistorial.totalBruto)}</strong>
            </div>
            <div className="liquidaciones-card liquidaciones-card-strong-soft">
              <span>Seleccionado neto</span>
              <strong>{formatMoney(totalNetoSeleccionado)}</strong>
              <small>Comision: {formatMoney(totalComisionSeleccionada)}</small>
            </div>
            <div className="liquidaciones-card">
              <span>Historico neto</span>
              <strong>{formatMoney(resumenHistorial.totalNeto)}</strong>
            </div>
          </div>

          <div className="liquidaciones-action-bar">
            <div className="liquidaciones-action-copy">
              <strong>Liquidacion manual</strong>
              <span>
                El sistema agrupa los pagos seleccionados y guarda las notas
                internas del cierre.
              </span>
            </div>

            <button
              type="button"
              className="swal-btn-aprobar liquidaciones-submit-btn"
              onClick={liquidarSeleccionados}
              disabled={!pagosSeleccionados.length || guardando}
            >
              {guardando ? "Liquidando..." : "Liquidar seleccionados"}
            </button>
          </div>
        </div>
      </section>

      <div className="tabla-turnos-wrapper liquidaciones-table-shell">
        <table className="tabla-turnos liquidaciones-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="Seleccionar pagos visibles"
                  checked={
                    pagosSeleccionables.length > 0 &&
                    pagosSeleccionables.every((pago) => seleccionados[pago.id])
                  }
                  onChange={(e) => toggleSeleccionPagina(e.target.checked)}
                />
              </th>
              <th>Fecha</th>
              <th>Cliente</th>
              <th>Servicio</th>
              <th>Profesional</th>
              <th>Metodo</th>
              <th>Tipo</th>
              <th>Bruto</th>
              <th>Comision</th>
              <th>Neto</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {pagosFiltrados.map((pago) => (
              <tr key={pago.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Seleccionar pago ${pago.id}`}
                    disabled={pago.liquidado}
                    checked={Boolean(seleccionados[pago.id])}
                    onChange={(e) => toggleSeleccion(pago.id, e.target.checked)}
                  />
                </td>
                <td className="liquidaciones-date-cell">
                  {formatDate(pago.aprobadoEn || pago.creadoEn || pago.createdAt)}
                </td>
                <td>
                  <div className="liquidaciones-cell-main">{pago.clienteNombre}</div>
                  <div className="liquidaciones-cell-sub">{pago.id}</div>
                </td>
                <td>{pago.nombreServicio}</td>
                <td>
                  <div className="liquidaciones-cell-main">
                    {pago.profesionalNombre}
                  </div>
                  <div className="liquidaciones-cell-sub">{pago.nombreGabinete}</div>
                </td>
                <td>{formatMetodo(pago.metodo)}</td>
                <td>{formatTipo(pago.tipoPago || pago.tipo)}</td>
                <td className="liquidaciones-money-cell">
                  {formatMoney(pago.monto)}
                </td>
                <td className="liquidaciones-money-cell liquidaciones-money-cell-muted">
                  {formatMoney(pago.montoComision)}
                </td>
                <td className="liquidaciones-money-cell liquidaciones-money-cell-strong">
                  {formatMoney(pago.montoLiquidable)}
                </td>
                <td>
                  {pago.liquidado ? (
                    <div className="liquidacion-badge liquidado">
                      {pago.liquidacionId || "Liquidado"}
                    </div>
                  ) : (
                    <div className="liquidacion-badge pendiente">Pendiente</div>
                  )}
                </td>
              </tr>
            ))}
            {pagosFiltrados.length === 0 && (
              <tr>
                <td colSpan="11" className="liquidaciones-empty">
                  <div className="liquidaciones-empty-state">
                    <strong>Sin resultados para los filtros actuales</strong>
                    <span>
                      Ajusta fechas, metodo o busqueda para volver a encontrar pagos.
                    </span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <section className="liquidaciones-history-grid">
        <div className="liquidaciones-surface liquidaciones-history-list-panel">
          <div className="liquidaciones-section-head">
            <div>
              <span className="liquidaciones-section-kicker">Historial</span>
              <h3>Liquidaciones generadas</h3>
            </div>
          </div>

          <div className="liquidaciones-history-list">
            {liquidacionesConDetalle.map((liquidacion) => (
              <button
                key={liquidacion.id}
                type="button"
                className={`liquidaciones-history-item ${
                  liquidacion.id === liquidacionSeleccionadaId ? "is-active" : ""
                }`}
                onClick={() => setLiquidacionSeleccionadaId(liquidacion.id)}
              >
                <div className="liquidaciones-history-copy">
                  <strong>{liquidacion.id}</strong>
                  <span>{formatDate(liquidacion.createdAt || liquidacion.updatedAt)}</span>
                  <small>{liquidacion.cantidadPagos || liquidacion.pagosLiquidacion.length} pagos</small>
                </div>
                <div className="liquidaciones-history-amounts">
                  <span>{formatMoney(liquidacion.totalLiquidable)}</span>
                  <small>Neto</small>
                </div>
              </button>
            ))}

            {!liquidacionesConDetalle.length ? (
              <div className="liquidaciones-admin-empty">
                Aun no hay liquidaciones registradas.
              </div>
            ) : null}
          </div>
        </div>

        <div className="liquidaciones-surface liquidaciones-history-detail-panel">
          {liquidacionSeleccionada ? (
            <>
              <div className="liquidaciones-detail-hero">
                <div>
                  <span className="liquidaciones-section-kicker">Detalle</span>
                  <h3>{liquidacionSeleccionada.id}</h3>
                  <p>
                    Creada el{" "}
                    {formatDate(
                      liquidacionSeleccionada.createdAt ||
                        liquidacionSeleccionada.updatedAt,
                    )}
                  </p>
                </div>

                <div className="liquidaciones-detail-actions">
                  <button
                    type="button"
                    className="liquidaciones-secondary-btn"
                    onClick={() => verLiquidacionPdf(liquidacionSeleccionada)}
                  >
                    Ver PDF
                  </button>
                  <button
                    type="button"
                    className="liquidaciones-secondary-btn"
                    onClick={() => exportarLiquidacionPdf(liquidacionSeleccionada)}
                  >
                    Exportar PDF
                  </button>
                </div>
              </div>

              <div className="liquidaciones-history-summary">
                <article className="liquidaciones-mini-card">
                  <span>Bruto</span>
                  <strong>
                    {formatMoney(
                      liquidacionSeleccionada.totalBruto ??
                        liquidacionSeleccionada.total,
                    )}
                  </strong>
                </article>
                <article className="liquidaciones-mini-card">
                  <span>Comision</span>
                  <strong>{formatMoney(liquidacionSeleccionada.totalComisiones)}</strong>
                </article>
                <article className="liquidaciones-mini-card">
                  <span>Neto</span>
                  <strong>{formatMoney(liquidacionSeleccionada.totalLiquidable)}</strong>
                </article>
                <article className="liquidaciones-mini-card">
                  <span>Pagos</span>
                  <strong>
                    {liquidacionSeleccionada.cantidadPagos ||
                      liquidacionSeleccionada.pagosLiquidacion.length}
                  </strong>
                </article>
              </div>

              {liquidacionSeleccionada.notas ? (
                <div className="liquidaciones-note-box">
                  <strong>Notas</strong>
                  <p>{liquidacionSeleccionada.notas}</p>
                </div>
              ) : null}

              <div className="liquidaciones-detail-list">
                {liquidacionSeleccionada.pagosLiquidacion.map((pago) => (
                  <article key={pago.id} className="liquidaciones-detail-item">
                    <div>
                      <strong>{pago.clienteNombre}</strong>
                      <span>{pago.nombreServicio}</span>
                      <small>
                        {formatDate(
                          pago.aprobadoEn || pago.creadoEn || pago.createdAt,
                        )}{" "}
                        | {formatMetodo(pago.metodo)}
                      </small>
                    </div>

                    <div className="liquidaciones-detail-money">
                      <strong>{formatMoney(pago.montoLiquidable)}</strong>
                      <span>Comision {formatMoney(pago.montoComision)}</span>
                    </div>
                  </article>
                ))}

                {!liquidacionSeleccionada.pagosLiquidacion.length ? (
                  <div className="liquidaciones-admin-empty">
                    No se encontraron pagos asociados a esta liquidacion.
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="liquidaciones-admin-empty">
              Selecciona una liquidacion para ver su detalle.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

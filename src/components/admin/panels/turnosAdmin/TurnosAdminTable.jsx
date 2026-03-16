import {
  getEstadoPago,
  getEstadoTurno,
  getMontoAValidarPago,
  getMetodoPagoEsperado,
  formatearDuracion,
  formatearFecha,
  formatearHora,
} from "./turnosAdminHelpers";

import { BadgeEstadoPago, BadgeEstadoTurno } from "./EstadoBadges";
import TurnoAcciones from "./TurnoAcciones";

function formatMoney(value) {
  return `$${Number(value || 0).toLocaleString("es-AR")}`;
}

function getClienteInfo(turno, clientes) {
  const cliente = clientes[turno.clienteId || turno.usuarioId || turno.uid];

  return {
    nombre:
      cliente?.nombre ||
      cliente?.email ||
      turno.nombreCliente ||
      turno.email ||
      (turno.clienteId || turno.usuarioId || turno.uid || "").slice(0, 8),
    telefono:
      cliente?.telefono ||
      turno.clienteTelefono ||
      turno.telefonoCliente ||
      "-",
    email: cliente?.email || turno.clienteEmail || turno.email || "-",
  };
}

function getGabineteNombre(turno, gabinetes) {
  const gabinete = gabinetes[turno.gabineteId];
  return (
    gabinete?.nombreGabinete || turno.nombreGabinete || turno.gabineteId || "-"
  );
}

function TurnoRowContent({
  turno,
  clientes,
  gabinetes,
  compact = false,
  nowMs,
}) {
  const estadoTurno = getEstadoTurno(turno);
  const estadoPago = getEstadoPago(turno);
  const metodoPagoEsperado = getMetodoPagoEsperado(turno);
  const metodoPagoReal = turno?.metodoPagoUsado || null;
  const metodoPagoBase = metodoPagoReal || metodoPagoEsperado;
  const cliente = getClienteInfo(turno, clientes);
  const nombreGabinete = getGabineteNombre(turno, gabinetes);
  const montoTotal = Number(turno?.montoTotal ?? turno?.precioTotal ?? 0);
  const montoPagado = Number(turno?.montoPagado ?? 0);
  const saldoPendiente = Math.max(0, montoTotal - montoPagado);

  const esPagoMP = metodoPagoBase === "mercadopago";
  const esPagoManual =
    metodoPagoBase === "manual" || metodoPagoBase === "transferencia";

  const mostrarChequeoManual =
    esPagoManual && ["pendiente", "pendiente_aprobacion"].includes(estadoPago);

  const vencido =
    turno.venceEn && turno.venceEn < nowMs && estadoTurno !== "confirmado";
  const creadoPorAdmin =
    turno.creadoPorAdmin || turno.origenTurno === "admin_manual";

  if (compact) {
    return (
      <article className="turno-admin-card">
        <div className="turno-admin-card-head">
          <div>
            <p className="turno-admin-card-date">
              {formatearFecha(turno.fecha)}
            </p>
            <h3>{turno.nombreServicio || "Servicio"}</h3>
            {creadoPorAdmin ? (
              <div className="turno-origin-badge">Carga admin</div>
            ) : null}
          </div>

          <div className="turno-admin-card-badges">
            <BadgeEstadoTurno estado={estadoTurno} />
            <BadgeEstadoPago turno={turno} />
          </div>
        </div>

        <div className="turno-admin-card-grid">
          <div className="turno-admin-info-block">
            <span>Cliente</span>
            <strong>{cliente.nombre}</strong>
            <small>{cliente.telefono}</small>
            <small>{cliente.email}</small>
          </div>

          <div className="turno-admin-info-block">
            <span>Horario</span>
            <strong>
              {formatearHora(turno.horaInicio)} - {formatearHora(turno.horaFin)}
            </strong>
            <small>{formatearDuracion(turno.horaInicio, turno.horaFin)}</small>
          </div>

          <div className="turno-admin-info-block">
            <span>Gabinete</span>
            <strong>{nombreGabinete}</strong>
            <small>Método: {metodoPagoBase}</small>
          </div>

          <div className="turno-admin-info-block">
            <span>Pago</span>
            <strong>
              {formatMoney(montoPagado)} / {formatMoney(montoTotal)}
            </strong>
          </div>
        </div>

        {(vencido ||
          mostrarChequeoManual ||
          (esPagoMP && estadoPago === "pendiente")) && (
          <div className="turno-admin-notes">
            {vencido ? (
              <div className="turno-admin-note danger">Vencido</div>
            ) : null}
            {mostrarChequeoManual ? (
              <div className="turno-admin-note warning">
                Seña sugerida: {formatMoney(getMontoAValidarPago(turno))}
              </div>
            ) : null}
            {esPagoMP && estadoPago === "pendiente" ? (
              <div className="turno-admin-note info">
                Esperando acreditación o webhook de MercadoPago
              </div>
            ) : null}
          </div>
        )}

        <TurnoAcciones
          turno={turno}
          estadoTurno={estadoTurno}
          estadoPago={estadoPago}
          metodoPagoEsperado={metodoPagoEsperado}
        />
      </article>
    );
  }

  return (
    <>
      <td>{formatearFecha(turno.fecha)}</td>

      <td>
        <div className="turno-cell-primary">
          {formatearHora(turno.horaInicio)} - {formatearHora(turno.horaFin)}
        </div>
        <div className="turno-cell-muted">
          {formatearDuracion(turno.horaInicio, turno.horaFin)}
        </div>
      </td>

      <td>
        <div className="turno-cell-primary">{cliente.nombre}</div>
        <div className="turno-cell-muted">{cliente.telefono}</div>
        <div className="turno-cell-muted">{cliente.email}</div>
      </td>

      <td>
        <div className="turno-cell-primary">{turno.nombreServicio}</div>
        <div className="turno-cell-muted">Gabinete: {nombreGabinete}</div>
        {creadoPorAdmin ? (
          <div className="turno-origin-badge">Carga admin</div>
        ) : null}
      </td>

      <td>
        <div className="turno-cell-stack">
          <BadgeEstadoTurno estado={estadoTurno} />
          {vencido ? (
            <div className="turno-admin-note danger">Vencido</div>
          ) : null}
        </div>
      </td>

      <td>
        <div className="turno-cell-stack">
          <BadgeEstadoPago turno={turno} />
          <div className="turno-cell-muted">
            Abonado: {formatMoney(montoPagado)} de {formatMoney(montoTotal)}
          </div>

          {mostrarChequeoManual ? (
            <div className="turno-admin-note warning">
              Seña sugerida: {formatMoney(getMontoAValidarPago(turno))}
            </div>
          ) : null}
          {esPagoMP && estadoPago === "pendiente" ? (
            <div className="turno-admin-note info">
              Esperando acreditación MP
            </div>
          ) : null}
        </div>
      </td>

      <td>
        <TurnoAcciones
          turno={turno}
          estadoTurno={estadoTurno}
          estadoPago={estadoPago}
          metodoPagoEsperado={metodoPagoEsperado}
        />
      </td>
    </>
  );
}

export default function TurnosAdminTable({ turnos, clientes, gabinetes }) {
  const nowMs = new Date().getTime();

  if (!turnos.length) {
    return (
      <div className="turnos-admin-empty">
        No hay turnos para los filtros actuales.
      </div>
    );
  }

  return (
    <div className="turnos-admin-results">
      <div className="tabla-turnos-wrapper turnos-admin-table-shell">
        <table className="tabla-turnos tabla-turnos-admin">
          <colgroup>
            <col style={{ width: "110px" }} />
            <col style={{ width: "170px" }} />
            <col style={{ width: "240px" }} />
            <col style={{ width: "220px" }} />
            <col style={{ width: "160px" }} />
            <col style={{ width: "210px" }} />
            <col style={{ width: "240px" }} />
          </colgroup>

          <thead>
            <tr>
              <th>Fecha</th>
              <th>Horario</th>
              <th>Cliente</th>
              <th>Servicio</th>
              <th>Estado turno</th>
              <th>Estado pago</th>
              <th>Acciones</th>
            </tr>
          </thead>

          <tbody>
            {turnos.map((turno) => (
              <tr key={turno.id}>
                <TurnoRowContent
                  turno={turno}
                  clientes={clientes}
                  gabinetes={gabinetes}
                  nowMs={nowMs}
                />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="turnos-admin-mobile-list">
        {turnos.map((turno) => (
          <TurnoRowContent
            key={turno.id}
            turno={turno}
            clientes={clientes}
            gabinetes={gabinetes}
            compact
            nowMs={nowMs}
          />
        ))}
      </div>
    </div>
  );
}

import {
  aprobarPagoTurno,
  aprobarTurnoYRegistrarPago,
  completarPagoTurno,
  rechazarTurnoAdmin,
  cancelarTurnoAdmin,
  marcarTurnoRealizadoAdmin,
  marcarTurnoAusenteAdmin,
  marcarTurnoReembolsadoAdmin,
  reprogramarTurnoAdmin,
} from "./turnosAdminActions";

import {
  puedeCancelarTurno,
  puedeMarcarRealizado,
  puedeMarcarAusente,
  puedeReprogramarTurno,
} from "./turnosAdminHelpers";

export default function TurnoAcciones({
  turno,
  estadoTurno,
  estadoPago,
  metodoPagoEsperado,
}) {
  const metodoPagoReal = turno?.metodoPagoUsado || null;
  const metodoPagoBase = metodoPagoReal || metodoPagoEsperado;

  const esPagoManual =
    metodoPagoBase === "manual" || metodoPagoBase === "transferencia";

  const puedeAprobarPagoManual =
    esPagoManual && estadoTurno === "pendiente_aprobacion";

  const puedeAprobarTurnoYMarcarPago =
    esPagoManual && estadoTurno === "pendiente";

  const total = Number(turno?.montoTotal ?? turno?.precioTotal ?? 0);
  const pagado = Number(turno?.montoPagado ?? 0);
  const saldoPendiente = Math.max(0, total - pagado);

  const puedeCompletarPago =
    estadoTurno === "confirmado" &&
    estadoPago === "parcial" &&
    saldoPendiente > 0;

  const puedeMarcarReembolso =
    estadoTurno === "cancelado" &&
    ["abonado", "parcial"].includes(estadoPago) &&
    pagado > 0 &&
    estadoPago !== "reembolsado";

  const mostrarAccionesOperativas = estadoTurno === "confirmado";

  return (
    <div className="turno-acciones">
      {puedeAprobarPagoManual && (
        <>
          <button
            type="button"
            className="btn btn-sm btn-outline-success"
            onClick={() => aprobarPagoTurno(turno)}
          >
            Aprobar pago
          </button>

          <button
            type="button"
            className="btn btn-sm btn-outline-danger"
            onClick={() => rechazarTurnoAdmin(turno.id)}
          >
            Rechazar
          </button>
        </>
      )}

      {puedeAprobarTurnoYMarcarPago && (
        <button
          type="button"
          className="btn btn-sm btn-outline-success"
          onClick={() => aprobarTurnoYRegistrarPago(turno)}
        >
          Aprobar turno + marcar pago
        </button>
      )}

      {!mostrarAccionesOperativas && puedeCompletarPago && (
        <p>Sin acciones disponibles.</p>
      )}

      {mostrarAccionesOperativas && (
        <>
          {puedeCompletarPago && (
            <button
              type="button"
              className="btn btn-sm btn-outline-success"
              onClick={() => completarPagoTurno(turno)}
            >
              Completar pago
            </button>
          )}
          {puedeMarcarReembolso && (
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => marcarTurnoReembolsadoAdmin(turno)}
            >
              Reembolsado
            </button>
          )}
          {puedeCancelarTurno(estadoTurno) && (
            <button
              type="button"
              className="btn btn-sm btn-outline-danger"
              onClick={() => cancelarTurnoAdmin(turno)}
            >
              Cancelar
            </button>
          )}

          {puedeMarcarRealizado(estadoTurno) && (
            <button
              type="button"
              className="btn btn-sm btn-outline-success"
              onClick={() => marcarTurnoRealizadoAdmin(turno)}
            >
              Realizado
            </button>
          )}

          {puedeMarcarAusente(estadoTurno) && (
            <button
              type="button"
              className="btn btn-sm btn-outline-warning"
              onClick={() => marcarTurnoAusenteAdmin(turno)}
            >
              Ausente
            </button>
          )}

          {puedeReprogramarTurno(estadoTurno) && (
            <button
              type="button"
              className="btn btn-sm btn-outline-primary"
              onClick={() => reprogramarTurnoAdmin(turno)}
            >
              Reprogramar
            </button>
          )}
        </>
      )}

      {!mostrarAccionesOperativas && puedeMarcarReembolso && (
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={() => marcarTurnoReembolsadoAdmin(turno)}
        >
          Reembolsado
        </button>
      )}
    </div>
  );
}

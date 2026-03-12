const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { FieldValue } = require("firebase-admin/firestore");
const { getAdmin } = require("../_lib/firebaseAdmin");
const { assertAdmin, resolveEstadoTurno } = require("./adminTurnosShared");
const { desglosarPagoTurno, normalizarMontosTurno } = require("../config/comisiones");

function resolveMetodoPago(turno) {
  if (turno?.metodoPagoUsado) return turno.metodoPagoUsado;
  if (turno?.metodoPagoEsperado === "mercadopago") return "mercadopago";
  if (turno?.metodoPagoEsperado === "efectivo") return "efectivo";
  if (turno?.metodoPagoEsperado === "manual") return "transferencia";
  return turno?.metodoPagoEsperado || "transferencia";
}

function resolveTipoPago(turno, montoRegistrado, montoPagadoFinal) {
  const total = Number(turno?.montoTotal ?? turno?.precioTotal ?? turno?.total ?? 0);
  const anticipo = Number(
    turno?.senaRequerida ?? turno?.montoAnticipo ?? turno?.montoSena ?? 0,
  );

  if (montoPagadoFinal >= total && montoRegistrado >= total) return "total";
  if (anticipo > 0 && montoRegistrado <= anticipo) return "sena";
  if (montoPagadoFinal >= total) return "saldo";
  return "parcial";
}

exports.registrarPagoTurnoAdmin = onCall(
  { region: "us-central1" },
  async (request) => {
    assertAdmin(request);

    const {
      turnoId,
      monto,
      operacion = "set",
    } = request.data || {};

    if (!turnoId || monto == null) {
      throw new HttpsError("invalid-argument", "Datos incompletos");
    }

    const montoInput = Number(monto);
    if (!Number.isFinite(montoInput) || montoInput <= 0) {
      throw new HttpsError("invalid-argument", "Monto inválido");
    }

    if (!["set", "add"].includes(operacion)) {
      throw new HttpsError("invalid-argument", "Operación inválida");
    }

    const admin = getAdmin();
    const db = admin.firestore();

    return db.runTransaction(async (tx) => {
      const turnoRef = db.collection("turnos").doc(turnoId);
      const turnoSnap = await tx.get(turnoRef);

      if (!turnoSnap.exists) {
        throw new HttpsError("not-found", "Turno inexistente");
      }

      const turno = turnoSnap.data() || {};
      const estadoTurnoActual = resolveEstadoTurno(turno);

      if (["cancelado", "perdido", "finalizado", "rechazado", "ausente"].includes(estadoTurnoActual)) {
        throw new HttpsError(
          "failed-precondition",
          `No se puede registrar pago para un turno en estado ${estadoTurnoActual}`,
        );
      }

      const montosTurno = normalizarMontosTurno(turno);
      const total = montosTurno.montoTotal;
      const pagadoActual = Number(turno?.montoPagado ?? turno?.pagadoTotal ?? 0);
      const montoPagadoFinal =
        operacion === "add" ? pagadoActual + montoInput : montoInput;
      const montoPagoRegistrado =
        operacion === "add" ? montoInput : Math.max(0, montoPagadoFinal - pagadoActual);

      if (total > 0 && montoPagadoFinal > total) {
        throw new HttpsError("failed-precondition", "El monto supera el total del turno");
      }

      const saldoPendiente = Math.max(0, total - montoPagadoFinal);
      const estadoPago = saldoPendiente <= 0 ? "abonado" : "parcial";
      const metodo = resolveMetodoPago(turno);
      const tipoPago = resolveTipoPago(turno, montoPagoRegistrado, montoPagadoFinal);
      const desglosePago = desglosarPagoTurno({
        turno,
        montoPago: montoPagoRegistrado,
        montoPagadoPrevio: pagadoActual,
      });

      let pagoId = turno?.pagoId || null;
      let reutilizoPagoPendiente = false;

      if (pagoId) {
        const pagoRef = db.collection("pagos").doc(pagoId);
        const pagoSnap = await tx.get(pagoRef);

        if (pagoSnap.exists) {
          const pagoActual = pagoSnap.data() || {};
          if (
            operacion === "set" &&
            ["pendiente", "pendiente_aprobacion"].includes(pagoActual.estado)
          ) {
            tx.update(pagoRef, {
              clienteNombre: pagoActual.clienteNombre || turno?.clienteNombre || turno?.nombreCliente || null,
              servicioId: pagoActual.servicioId || turno?.servicioId || null,
              nombreServicio: pagoActual.nombreServicio || turno?.nombreServicio || null,
              profesionalId: pagoActual.profesionalId || turno?.profesionalId || null,
              profesionalNombre: pagoActual.profesionalNombre || turno?.profesionalNombre || null,
              gabineteId: pagoActual.gabineteId || turno?.gabineteId || null,
              nombreGabinete: pagoActual.nombreGabinete || turno?.nombreGabinete || null,
              metodo,
              estado: "aprobado",
              monto: montoPagoRegistrado,
              montoTotal: total,
              montoServicio: montosTurno.montoServicio,
              montoServicioPagado: desglosePago.montoLiquidable,
              montoComision: desglosePago.montoComision,
              montoLiquidable: desglosePago.montoLiquidable,
              estadoPagoTurno: estadoPago,
              tipo: tipoPago,
              tipoPago,
              esperadoSegunTurno: turno?.metodoPagoEsperado || metodo,
              registradoPor: request.auth.uid,
              aprobadoPorUid: request.auth.uid,
              aprobadoPor: "admin",
              aprobadoManual: true,
              metodoConfirmacion: "manual",
              liquidado: pagoActual.liquidado ?? false,
              liquidacionId: pagoActual.liquidacionId ?? null,
              aprobadoEn: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });
            reutilizoPagoPendiente = true;
          }
        }
      }

      if (!reutilizoPagoPendiente) {
        const nuevoPagoRef = db.collection("pagos").doc();
        tx.set(nuevoPagoRef, {
          turnoId,
          clienteId: turno?.clienteId || turno?.usuarioId || null,
          clienteNombre: turno?.clienteNombre || turno?.nombreCliente || null,
          servicioId: turno?.servicioId || null,
          nombreServicio: turno?.nombreServicio || null,
          profesionalId: turno?.profesionalId || null,
          profesionalNombre: turno?.profesionalNombre || null,
          gabineteId: turno?.gabineteId || null,
          nombreGabinete: turno?.nombreGabinete || null,
          metodo,
          estado: "aprobado",
          monto: montoPagoRegistrado,
          montoTotal: total,
          montoServicio: montosTurno.montoServicio,
          montoServicioPagado: desglosePago.montoLiquidable,
          montoComision: desglosePago.montoComision,
          montoLiquidable: desglosePago.montoLiquidable,
          estadoPagoTurno: estadoPago,
          tipo: tipoPago,
          tipoPago,
          esperadoSegunTurno: turno?.metodoPagoEsperado || metodo,
          registradoPor: request.auth.uid,
          aprobadoPorUid: request.auth.uid,
          aprobadoPor: "admin",
          aprobadoManual: true,
          metodoConfirmacion: "manual",
          liquidado: false,
          liquidacionId: null,
          eventoId: null,
          createdAt: FieldValue.serverTimestamp(),
          creadoEn: FieldValue.serverTimestamp(),
          aprobadoEn: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        if (!pagoId) {
          pagoId = nuevoPagoRef.id;
        }
      }

      const metodoPagoUsado =
        turno?.metodoPagoUsado ||
        (turno?.metodoPagoEsperado === "mercadopago" ? "mercadopago" : "transferencia");

      const updateTurno = {
        estadoTurno: "confirmado",
        estadoPago,
        montoPagado: montoPagadoFinal,
        saldoPendiente,
        senaPagada: Math.min(
          Number(turno?.senaRequerida ?? turno?.montoAnticipo ?? turno?.montoSena ?? 0),
          montoPagadoFinal,
        ),
        pagosCount: Number(turno?.pagosCount || 0) + 1,
        ultimoPagoEn: FieldValue.serverTimestamp(),
        metodoPagoUsado,
        aprobadoEn: FieldValue.serverTimestamp(),
        pagoAprobadoEn: FieldValue.serverTimestamp(),
        confirmadoAt: turno?.confirmadoAt || FieldValue.serverTimestamp(),
        confirmadoEn: turno?.confirmadoEn || FieldValue.serverTimestamp(),
        venceEn: null,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: request.auth.uid,
        pagoId: pagoId || turno?.pagoId || null,
      };

      if (operacion === "add") {
        updateTurno.pagoCompletadoEn = FieldValue.serverTimestamp();
      }

      tx.update(turnoRef, updateTurno);

      return {
        ok: true,
        turnoId,
        pagoId,
        estadoPago,
        montoPagado: montoPagadoFinal,
        saldoPendiente,
      };
    });
  },
);

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { FieldValue } = require("firebase-admin/firestore");
const { getAdmin } = require("../_lib/firebaseAdmin");
const { assertAdmin } = require("./adminTurnosShared");

function resolveEstadoTurno(turno = {}) {
  return String(turno?.estadoTurno || turno?.estado || "pendiente");
}

exports.marcarTurnoReembolsadoAdmin = onCall(
  { region: "us-central1" },
  async (request) => {
    assertAdmin(request);

    const { turnoId, motivoReembolso = "reembolso_admin" } = request.data || {};

    if (!turnoId) {
      throw new HttpsError("invalid-argument", "turnoId requerido");
    }

    const db = getAdmin().firestore();
    const turnoRef = db.collection("turnos").doc(turnoId);

    return db.runTransaction(async (tx) => {
      const turnoSnap = await tx.get(turnoRef);
      if (!turnoSnap.exists) {
        throw new HttpsError("not-found", "Turno no encontrado");
      }

      const turno = turnoSnap.data() || {};
      const estadoTurnoActual = resolveEstadoTurno(turno);
      const montoPagado = Number(turno?.montoPagado ?? 0);
      const estadoPagoActual = String(turno?.estadoPago || "pendiente");

      if (estadoTurnoActual !== "cancelado") {
        throw new HttpsError(
          "failed-precondition",
          "Solo se puede reembolsar un turno cancelado",
        );
      }

      if (montoPagado <= 0) {
        throw new HttpsError(
          "failed-precondition",
          "No hay monto pagado para reembolsar",
        );
      }

      if (estadoPagoActual === "reembolsado") {
        throw new HttpsError(
          "failed-precondition",
          "El turno ya figura como reembolsado",
        );
      }

      const pagosSnap = await tx.get(
        db.collection("pagos").where("turnoId", "==", turnoId),
      );

      tx.update(turnoRef, {
        estadoPago: "reembolsado",
        reembolsadoAt: FieldValue.serverTimestamp(),
        reembolsadoEn: FieldValue.serverTimestamp(),
        reembolsadoPor: "admin",
        motivoReembolso,
        montoReembolsado: montoPagado,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: request.auth.uid,
      });

      pagosSnap.docs.forEach((pagoDoc) => {
        tx.update(pagoDoc.ref, {
          estado: "reembolsado",
          estadoPagoTurno: "reembolsado",
          reembolsadoAt: FieldValue.serverTimestamp(),
          reembolsadoEn: FieldValue.serverTimestamp(),
          reembolsadoPor: request.auth.uid,
          montoReembolsado: Number(pagoDoc.data()?.monto || 0),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });

      return {
        ok: true,
        turnoId,
        estadoPago: "reembolsado",
      };
    });
  },
);

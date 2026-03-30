const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { FieldValue } = require("firebase-admin/firestore");
const { getAdmin } = require("../_lib/firebaseAdmin");
const { assertAdmin, resolveEstadoTurno } = require("./adminTurnosShared");

exports.cancelarTurnoAdmin = onCall({ region: "us-central1" }, async (request) => {
  assertAdmin(request);

  const { turnoId, motivoCancelacion = "cancelacion_admin" } = request.data || {};

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
    const estadoTurno = resolveEstadoTurno(turno);
    if (["cancelado", "rechazado"].includes(estadoTurno)) {
      throw new HttpsError(
        "failed-precondition",
        `No se puede cancelar un turno en estado ${estadoTurno}`,
      );
    }

    if (["finalizado", "realizado"].includes(estadoTurno)) {
      throw new HttpsError(
        "failed-precondition",
        "No se puede cancelar un turno finalizado o realizado",
      );
    }

    tx.update(turnoRef, {
      estadoTurno: "cancelado",
      canceladoPor: "admin",
      motivoCancelacion,
      canceladoAt: FieldValue.serverTimestamp(),
      venceEn: null,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: request.auth.uid,
    });

    return { ok: true, estadoTurno: "cancelado" };
  });
});

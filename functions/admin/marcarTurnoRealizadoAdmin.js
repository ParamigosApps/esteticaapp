const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { FieldValue } = require("firebase-admin/firestore");
const { getAdmin } = require("../_lib/firebaseAdmin");
const { assertAdmin, resolveEstadoTurno } = require("./adminTurnosShared");

exports.marcarTurnoRealizadoAdmin = onCall(
  { region: "us-central1" },
  async (request) => {
    assertAdmin(request);

    const { turnoId } = request.data || {};

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

      if (estadoTurno !== "confirmado") {
        throw new HttpsError(
          "failed-precondition",
          "Solo se puede finalizar un turno confirmado",
        );
      }

      tx.update(turnoRef, {
        estadoTurno: "finalizado",
        finalizadoAt: FieldValue.serverTimestamp(),
        finalizadoEn: FieldValue.serverTimestamp(),
        finalizadoPor: "admin",
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: request.auth.uid,
      });

      return { ok: true, estadoTurno: "finalizado" };
    });
  },
);

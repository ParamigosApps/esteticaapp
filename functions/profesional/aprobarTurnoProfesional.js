const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { FieldValue } = require("firebase-admin/firestore");
const { getAdmin } = require("../_lib/firebaseAdmin");
const {
  resolveEstadoTurno,
  resolverProfesionalDesdeRequest,
  validarAccesoProfesionalATurno,
} = require("./profesionalTurnosShared");

exports.aprobarTurnoProfesional = onCall(
  { region: "us-central1" },
  async (request) => {
    const profesional = await resolverProfesionalDesdeRequest(request);
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
      if (!validarAccesoProfesionalATurno(turno, profesional)) {
        throw new HttpsError("permission-denied", "No puedes operar este turno");
      }

      const estadoTurno = resolveEstadoTurno(turno);
      if (!["pendiente", "pendiente_aprobacion"].includes(estadoTurno)) {
        throw new HttpsError(
          "failed-precondition",
          `No se puede aprobar un turno en estado ${estadoTurno}`,
        );
      }

      tx.update(turnoRef, {
        estadoTurno: "confirmado",
        confirmadoAt: FieldValue.serverTimestamp(),
        confirmadoEn: FieldValue.serverTimestamp(),
        confirmadoPor: "profesional",
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: request.auth.uid,
      });

      return { ok: true, estadoTurno: "confirmado" };
    });
  },
);

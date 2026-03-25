const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { FieldValue } = require("firebase-admin/firestore");
const { getAdmin } = require("../_lib/firebaseAdmin");
const { WHATSAPP_TOKEN } = require("../turnos/whatsapp");
const {
  enviarWhatsAppConfirmacionTurno,
} = require("../turnos/enviarWhatsAppConfirmacionTurno");
const {
  resolveEstadoTurno,
  resolverProfesionalDesdeRequest,
  validarAccesoProfesionalATurno,
} = require("./profesionalTurnosShared");

exports.aprobarTurnoProfesional = onCall(
  { region: "us-central1", secrets: [WHATSAPP_TOKEN] },
  async (request) => {
    const profesional = await resolverProfesionalDesdeRequest(request);
    const { turnoId } = request.data || {};

    if (!turnoId) {
      throw new HttpsError("invalid-argument", "turnoId requerido");
    }

    const db = getAdmin().firestore();
    const turnoRef = db.collection("turnos").doc(turnoId);

    const result = await db.runTransaction(async (tx) => {
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

      return { ok: true, estadoTurno: "confirmado", turnoId };
    });

    if (result?.estadoTurno === "confirmado" && result?.turnoId) {
      try {
        await enviarWhatsAppConfirmacionTurno({
          db,
          turnoId: result.turnoId,
        });
      } catch (error) {
        console.error("No se pudo enviar WhatsApp de confirmacion", error);
      }
    }

    return result;
  },
);

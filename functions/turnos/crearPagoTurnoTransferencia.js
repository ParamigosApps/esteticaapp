// --------------------------------------------------
// functions/turnos/crearPagoTurnoTransferencia.js
// --------------------------------------------------

const { onCall, HttpsError } = require("firebase-functions/v2/https")
const { Timestamp } = require("firebase-admin/firestore")
const { getAdmin } = require("../_lib/firebaseAdmin")

exports.crearPagoTurnoTransferencia = onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "No autenticado")
    }

    const { turnoId } = request.data || {}

    if (!turnoId) {
      throw new HttpsError("invalid-argument", "turnoId requerido")
    }

    const admin = getAdmin()
    const db = admin.firestore()
    const uid = request.auth.uid

    const turnoRef = db.collection("turnos").doc(turnoId)
    const turnoSnap = await turnoRef.get()

    if (!turnoSnap.exists) {
      throw new HttpsError("not-found", "Turno no encontrado")
    }

    const turno = turnoSnap.data()

    if (turno.usuarioId !== uid) {
      throw new HttpsError("permission-denied", "No autorizado")
    }

    if (turno.estado !== "pendiente_pago") {
      throw new HttpsError(
        "failed-precondition",
        `Estado inválido: ${turno.estado}`
      )
    }

if (!turno.requiereSena || !Number(turno.montoSena)) {      throw new HttpsError(
        "failed-precondition",
        "Este turno no requiere seña"
      )
    }

    // ⛔ Si ya venció el hold
if (turno.venceEn && turno.venceEn <= Date.now()) {      throw new HttpsError("failed-precondition", "Turno vencido")
    }

    // 🔐 Crear documento pago_turno
    const pagoRef = db.collection("pagos_turnos").doc()

    await pagoRef.set({
      turnoId,
      clienteId: uid,

      metodo: "transferencia",
      estado: "pendiente_aprobacion",

      monto: Number(turno.seña),

      comprobanteUrl: null,

      creadoEn: Timestamp.now(),
      updatedAt: Timestamp.now(),
    })

    // Actualizar turno
    await turnoRef.update({
      pagoId: pagoRef.id,
      metodoPago: "transferencia",
      estado: "pendiente_aprobacion",
      updatedAt: Timestamp.now(),
    })

    return {
      ok: true,
      pagoId: pagoRef.id,
    }
  }
)
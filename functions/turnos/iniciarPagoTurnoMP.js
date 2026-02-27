//functions\turnos\iniciarPagoTurnoMP.js


const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getAdmin } = require("../_lib/firebaseAdmin");
const { defineSecret } = require("firebase-functions/params");

const { FieldValue } = require("firebase-admin/firestore");

const MP_ACCESS_TOKEN = defineSecret("MP_ACCESS_TOKEN");
const FRONT_URL = defineSecret("FRONT_URL");

exports.iniciarPagoTurnoMP = onCall(
  {
    region: "us-central1",
    secrets: [MP_ACCESS_TOKEN, FRONT_URL],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "No autenticado");
    }

    const { turnoId } = request.data || {};
    if (!turnoId) {
      throw new HttpsError("invalid-argument", "turnoId requerido");
    }

    const db = getAdmin().firestore();
    const turnoRef = db.collection("turnos").doc(turnoId);

    const turnoSnap = await turnoRef.get();
    if (!turnoSnap.exists) {
      throw new HttpsError("not-found", "Turno no encontrado");
    }

    const turno = turnoSnap.data();

    if (turno.clienteId !== request.auth.uid) {
      throw new HttpsError("permission-denied", "No autorizado");
    }

    if (turno.estado !== "pendiente_pago") {
      throw new HttpsError(
        "failed-precondition",
        `Estado inválido: ${turno.estado}`
      );
    }

    if (!turno.requiereSena || !turno.montoSena) {
      throw new HttpsError(
        "failed-precondition",
        "Este turno no requiere seña"
      );
    }

    // ⛔ Si ya venció
    if (turno.venceEn && turno.venceEn < Date.now()) {
      throw new HttpsError("failed-precondition", "Turno vencido");
    }

    if (turno.pagoId) {
  const pagoExistente = await db.collection("pagos_turnos").doc(turno.pagoId).get();

  if (pagoExistente.exists) {
    const p = pagoExistente.data();
    if (p.estado === "pendiente") {
      throw new HttpsError("failed-precondition", "Ya existe un pago pendiente");
    }
  }
}

    // 🔐 Crear pago_turno
    const pagoRef = db.collection("pagos_turnos").doc();




await pagoRef.set({
  turnoId,
  clienteId: request.auth.uid,

  metodo: "mp",
  estado: "pendiente",

  monto: Number(turno.montoSena),

  mpPreferenceId: null,
  mpInitPoint: null,
  mpPaymentId: null,
  mpStatus: null,

  expiraEn: turno.venceEn || null,

  comprobanteUrl: null,

  creadoEn: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
});

await turnoRef.update({
  pagoId: pagoRef.id,
  metodoPago: "mp",
  updatedAt: FieldValue.serverTimestamp(),
});

    // =============================
    // MERCADOPAGO
    // =============================

    const mpAccessToken = MP_ACCESS_TOKEN.value();
    const frontUrl = FRONT_URL.value()?.replace(/\/$/, "");

    if (!mpAccessToken || !frontUrl) {
      throw new HttpsError("internal", "MP no configurado");
    }

    const { MercadoPagoConfig, Preference } = await import("mercadopago");

    const client = new MercadoPagoConfig({
      accessToken: mpAccessToken,
    });

    const preference = new Preference(client);

    const pref = await preference.create({
      body: {
        items: [
          {
            title: `Seña turno - ${turno.servicioNombre}`,
            quantity: 1,
            unit_price: Number(turno.montoSena),
            currency_id: "ARS",
          },
        ],
        external_reference: pagoRef.id, // 🔑 CLAVE
        back_urls: {
          success: `${frontUrl}/turno-resultado`,
          failure: `${frontUrl}/turno-resultado`,
          pending: `${frontUrl}/turno-resultado`,
        },
        auto_return: "approved",
      },
    });

    await pagoRef.update({
  mpPreferenceId: pref.id || null,
  mpInitPoint: pref.init_point || null,
  updatedAt: FieldValue.serverTimestamp(),
});

    return {
      ok: true,
      pagoId: pagoRef.id,
      init_point: pref.init_point,
    };
  }
);
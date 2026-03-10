// --------------------------------------------------
// functions/turnos/iniciarPagoTurnoMP.js
// --------------------------------------------------

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

    const turno = turnoSnap.data() || {};
    const uid = request.auth.uid;

    if ((turno.clienteId || turno.usuarioId) !== uid) {
      throw new HttpsError("permission-denied", "No autorizado");
    }

    const estadoTurnoActual =
      turno.estadoTurno ||
      turno.estado ||
      "pendiente";

    const estadoPagoActual =
      turno.estadoPago ||
      "pendiente";

    if (["cancelado", "perdido", "finalizado", "rechazado"].includes(estadoTurnoActual)) {
      throw new HttpsError(
        "failed-precondition",
        `El turno no admite pago en estado ${estadoTurnoActual}`
      );
    }

    if (!turno.pedirAnticipo || !Number(turno.montoAnticipo)) {
      throw new HttpsError("failed-precondition", "Este turno no requiere seña");
    }

    if (
      turno.metodoPagoEsperado &&
      !["mercadopago", "sin_pago"].includes(turno.metodoPagoEsperado)
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Este turno no está configurado para pagar por MercadoPago",
      );
    }

    if (turno.venceEn && Number(turno.venceEn) < Date.now()) {
      throw new HttpsError("failed-precondition", "Turno expirado");
    }

    // Si ya tiene pago aprobado o pendiente de revisión, no iniciar otro
    if (["abonado", "pendiente_aprobacion"].includes(estadoPagoActual)) {
      throw new HttpsError(
        "failed-precondition",
        `El turno ya tiene un pago en estado ${estadoPagoActual}`
      );
    }

    if (turno.pagoId) {
      const pagoExistenteSnap = await db.collection("pagos").doc(turno.pagoId).get();

      if (pagoExistenteSnap.exists) {
        const p = pagoExistenteSnap.data() || {};

        if (["pendiente", "pendiente_aprobacion", "aprobado"].includes(p.estado)) {
          // Si ya existe preference creada, devolvela
          if (p.estado === "pendiente" && p.mpInitPoint) {
            return {
              ok: true,
              pagoId: turno.pagoId,
              init_point: p.mpInitPoint,
              reused: true,
            };
          }

          throw new HttpsError(
            "failed-precondition",
            `Ya existe un pago activo en estado ${p.estado}`
          );
        }
      }
    }

    const mpAccessToken = MP_ACCESS_TOKEN.value();
    const frontUrl = FRONT_URL.value()?.replace(/\/$/, "");

    if (!mpAccessToken || !frontUrl) {
      throw new HttpsError("internal", "MP no configurado");
    }

    const montoAnticipo = Number(turno.montoAnticipo || 0);
    const montoTotal = Number(
      turno.montoTotal ??
      turno.precioTotal ??
      turno.total ??
      0
    );

    const pagoRef = db.collection("pagos").doc();

await pagoRef.set({
  turnoId,
  clienteId: uid,

  metodo: "mercadopago",
  canal: "checkout_pro",
  origen: "turno_online",
  estado: "pendiente",

  monto: montoAnticipo,
  montoTotal,
  tipoPago: "sena",

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

  metodoPago: "mercadopago", // compatibilidad vieja
  metodoPagoEsperado: "mercadopago",
  metodoPagoUsado: null,
  origenSolicitud: turno.origenSolicitud || "web",

  estadoPago: "pendiente",

  montoTotal,
  montoPagado: Number(turno.montoPagado ?? 0),
  saldoPendiente: Math.max(
    0,
    montoTotal - Number(turno.montoPagado ?? 0),
  ),

  updatedAt: FieldValue.serverTimestamp(),
});

    const { MercadoPagoConfig, Preference } = await import("mercadopago");

    const client = new MercadoPagoConfig({
      accessToken: mpAccessToken,
    });

    const preference = new Preference(client);

    const pref = await preference.create({
      body: {
        items: [
          {
            title: `Seña turno - ${turno.nombreServicio || "Servicio"}`,
            quantity: 1,
            unit_price: montoAnticipo,
            currency_id: "ARS",
          },
        ],
        external_reference: pagoRef.id,
        back_urls: {
          success: `${frontUrl}/pago-resultado`,
          failure: `${frontUrl}/pago-resultado`,
          pending: `${frontUrl}/pago-resultado`,
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
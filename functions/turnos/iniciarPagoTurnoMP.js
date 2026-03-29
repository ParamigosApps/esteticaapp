// --------------------------------------------------
// functions/turnos/iniciarPagoTurnoMP.js
// --------------------------------------------------

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getAdmin } = require("../_lib/firebaseAdmin");
const { defineSecret } = require("firebase-functions/params");
const { FieldValue } = require("firebase-admin/firestore");
const {
  desglosarPagoTurno,
  normalizarMontosTurno,
} = require("../config/comisiones");
const { getActiveMpConnection } = require("../mp/oauthStore");

const MP_ACCESS_TOKEN = defineSecret("MP_ACCESS_TOKEN");
const FRONT_URL = defineSecret("FRONT_URL");

function sanitizarUrlBase(url) {
  const value = String(url || "").trim().replace(/\/$/, "");
  if (!/^https?:\/\//i.test(value)) return "";
  return value;
}

function resolveTipoPagoTurno(montoPago, montoTotal) {
  if (Number(montoTotal) > 0 && Number(montoPago) >= Number(montoTotal)) {
    return "total";
  }
  return "sena";
}

function normalizarTurnoIds(data = {}) {
  const turnoId = String(data?.turnoId || "").trim();
  const turnoIds = Array.isArray(data?.turnoIds)
    ? data.turnoIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];

  const list = [...new Set([...(turnoId ? [turnoId] : []), ...turnoIds])];
  return list;
}

function coincideTurnosPago(pago = {}, turnoIds = []) {
  const idsPago = Array.isArray(pago?.turnoIds)
    ? pago.turnoIds.map((id) => String(id || "").trim()).filter(Boolean)
    : pago?.turnoId
      ? [String(pago.turnoId || "").trim()]
      : [];

  if (idsPago.length !== turnoIds.length) return false;
  return idsPago.every((id) => turnoIds.includes(id));
}

function toCleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function pickFirstNonEmpty(candidates = []) {
  for (const value of candidates) {
    const text = toCleanString(value);
    if (text) return text;
  }
  return "";
}

function parseNombreApellido(value) {
  const full = toCleanString(value);
  if (!full) return { name: "", surname: "" };

  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { name: parts[0], surname: "" };

  return {
    name: parts[0],
    surname: parts.slice(1).join(" "),
  };
}

function normalizeDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeStatementText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function buildStatementDescriptor({
  turnoBase = {},
  activeMpConnection = {},
  clienteData = {},
}) {
  const raw = pickFirstNonEmpty([
    activeMpConnection?.statementDescriptor,
    activeMpConnection?.businessName,
    activeMpConnection?.nombreNegocio,
    turnoBase?.statementDescriptor,
    turnoBase?.nombreNegocio,
    turnoBase?.nombreComercio,
    turnoBase?.negocioNombre,
    clienteData?.nombreNegocio,
    clienteData?.comercio,
    "MISTURNOSAPP",
  ]);

  const normalized = normalizeStatementText(raw);
  if (!normalized) return "MISTURNOSAPP";
  return normalized.slice(0, 13);
}

function buildPayerAddress(...sources) {
  for (const source of sources) {
    if (!source) continue;

    if (typeof source === "string") {
      const streetName = toCleanString(source);
      if (!streetName) continue;
      return { street_name: streetName };
    }

    if (typeof source === "object") {
      const zipCode = pickFirstNonEmpty([
        source.zip_code,
        source.zipCode,
        source.codigoPostal,
        source.codigo_postal,
        source.postal_code,
        source.cp,
      ]);

      const streetName = pickFirstNonEmpty([
        source.street_name,
        source.streetName,
        source.calle,
        source.direccion,
        source.domicilio,
        source.address,
      ]);

      const streetNumberRaw = pickFirstNonEmpty([
        source.street_number,
        source.streetNumber,
        source.numero,
        source.altura,
      ]);
      const streetNumber = Number(streetNumberRaw);

      const address = {};
      if (zipCode) address.zip_code = zipCode;
      if (streetName) address.street_name = streetName;
      if (Number.isFinite(streetNumber) && streetNumber > 0) {
        address.street_number = streetNumber;
      }

      if (Object.keys(address).length) return address;
    }
  }

  return null;
}

function buildPayer({
  payerInput = {},
  authToken = {},
  turnoBase = {},
  clienteData = {},
}) {
  const nombreCompleto = pickFirstNonEmpty([
    payerInput?.name,
    payerInput?.full_name,
    clienteData?.nombre,
    clienteData?.nombreCompleto,
    turnoBase?.nombreCliente,
    authToken?.name,
  ]);
  const parsed = parseNombreApellido(nombreCompleto);

  const payer = {};

  const email = pickFirstNonEmpty([
    payerInput?.email,
    clienteData?.email,
    turnoBase?.emailCliente,
    turnoBase?.clienteEmail,
    authToken?.email,
  ]);
  if (email) payer.email = email;

  const name = pickFirstNonEmpty([payerInput?.name, parsed.name, authToken?.given_name]);
  if (name) payer.name = name;

  const surname = pickFirstNonEmpty([
    payerInput?.surname,
    parsed.surname,
    authToken?.family_name,
  ]);
  if (surname) payer.surname = surname;

  const phoneDigits = normalizeDigits(
    pickFirstNonEmpty([
      payerInput?.phone?.number,
      payerInput?.phone,
      clienteData?.telefono,
      clienteData?.phone,
      clienteData?.celular,
      turnoBase?.telefonoCliente,
      turnoBase?.clienteTelefono,
      authToken?.phone_number,
    ]),
  );
  if (phoneDigits.length >= 6) {
    payer.phone = { number: phoneDigits };
  }

  const address = buildPayerAddress(
    payerInput?.address,
    clienteData?.address,
    clienteData?.direccion,
    clienteData?.domicilio,
    turnoBase?.address,
    turnoBase?.direccion,
    turnoBase?.domicilio,
  );
  if (address) payer.address = address;

  return Object.keys(payer).length ? payer : null;
}

function buildItemDescription({
  esPagoPack = false,
  tipoPago = "sena",
  turnoBase = {},
  turnoIds = [],
}) {
  const nombreServicio = String(
    turnoBase?.nombreServicio || turnoBase?.nombre || "Servicio",
  ).trim();
  const fecha = String(turnoBase?.fecha || "").trim();

  const partes = [
    esPagoPack ? "Pack de turnos" : "Turno",
    tipoPago === "total" ? "pago total" : "seña",
    `servicio: ${nombreServicio}`,
  ];

  if (fecha) partes.push(`fecha: ${fecha}`);
  if (turnoIds.length > 1) partes.push(`cantidad: ${turnoIds.length}`);

  return partes.join(" | ").slice(0, 256);
}

exports.iniciarPagoTurnoMP = onCall(
  {
    region: "us-central1",
    secrets: [MP_ACCESS_TOKEN, FRONT_URL],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "No autenticado");
    }

    const { frontOrigin, payer: payerInput = {} } = request.data || {};
    const turnoIds = normalizarTurnoIds(request.data || {});
    if (!turnoIds.length) {
      throw new HttpsError("invalid-argument", "turnoId o turnoIds requerido");
    }

    const esPagoPack = turnoIds.length > 1;
    const db = getAdmin().firestore();
    const uid = request.auth.uid;

    const turnosDocs = await Promise.all(
      turnoIds.map(async (id) => {
        const ref = db.collection("turnos").doc(id);
        const snap = await ref.get();
        if (!snap.exists) {
          throw new HttpsError("not-found", `Turno no encontrado: ${id}`);
        }
        return { id, ref, turno: snap.data() || {} };
      }),
    );

    const turnoBase = turnosDocs[0]?.turno || {};

    for (const { turno } of turnosDocs) {
      if ((turno.clienteId || turno.usuarioId) !== uid) {
        throw new HttpsError("permission-denied", "No autorizado");
      }

      const estadoTurnoActual = turno.estadoTurno || turno.estado || "pendiente";
      const estadoPagoActual = turno.estadoPago || "pendiente";

      if (
        ["cancelado", "perdido", "finalizado", "rechazado"].includes(
          estadoTurnoActual,
        )
      ) {
        throw new HttpsError(
          "failed-precondition",
          `El turno no admite pago en estado ${estadoTurnoActual}`,
        );
      }

      if (!turno.pedirAnticipo || !Number(turno.montoAnticipo)) {
        throw new HttpsError(
          "failed-precondition",
          "Uno de los turnos no requiere seña",
        );
      }

      if (
        turno.metodoPagoEsperado &&
        !["mercadopago", "sin_pago"].includes(turno.metodoPagoEsperado)
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Uno de los turnos no esta configurado para pagar por MercadoPago",
        );
      }

      if (turno.venceEn && Number(turno.venceEn) < Date.now()) {
        throw new HttpsError(
          "failed-precondition",
          "Uno de los turnos esta expirado",
        );
      }

      if (["abonado", "pendiente_aprobacion"].includes(estadoPagoActual)) {
        throw new HttpsError(
          "failed-precondition",
          `Uno de los turnos ya tiene un pago en estado ${estadoPagoActual}`,
        );
      }
    }

    for (const { turno } of turnosDocs) {
      if (!turno.pagoId) continue;
      const pagoExistenteSnap = await db.collection("pagos").doc(turno.pagoId).get();
      if (!pagoExistenteSnap.exists) continue;

      const pagoExistente = pagoExistenteSnap.data() || {};
      if (!coincideTurnosPago(pagoExistente, turnoIds)) continue;

      if (
        ["pendiente", "pendiente_aprobacion", "aprobado"].includes(
          pagoExistente.estado,
        )
      ) {
        if (pagoExistente.estado === "pendiente" && pagoExistente.mpInitPoint) {
          return {
            ok: true,
            pagoId: turno.pagoId,
            init_point: pagoExistente.mpInitPoint,
            reused: true,
          };
        }

        throw new HttpsError(
          "failed-precondition",
          `Ya existe un pago activo en estado ${pagoExistente.estado}`,
        );
      }
    }

    const mpAccessToken = MP_ACCESS_TOKEN.value();
    const frontUrl =
      sanitizarUrlBase(frontOrigin) || sanitizarUrlBase(FRONT_URL.value());

    if (!mpAccessToken || !frontUrl) {
      throw new HttpsError("internal", "MP no configurado");
    }

    const clienteSnap = await db.collection("usuarios").doc(uid).get();
    const clienteData = clienteSnap.exists ? clienteSnap.data() || {} : {};

    const activeMpConnection = await getActiveMpConnection(db);
    const mpTokenOAuth = String(activeMpConnection?.accessToken || "").trim();
    const usaOauthMp = Boolean(mpTokenOAuth);
    const mpAccessTokenFinal = usaOauthMp ? mpTokenOAuth : mpAccessToken;
    const mpCollectorIdEsperado = Number(activeMpConnection?.mpUserId || 0) || null;

    const montosPorTurno = turnosDocs.map(({ turno }) => normalizarMontosTurno(turno));

    const montoAnticipo = montosPorTurno.reduce(
      (acc, item) => acc + Number(item.montoAnticipo || 0),
      0,
    );
    const montoTotal = montosPorTurno.reduce(
      (acc, item) => acc + Number(item.montoTotal || 0),
      0,
    );
    const montoServicio = montosPorTurno.reduce(
      (acc, item) => acc + Number(item.montoServicio || 0),
      0,
    );

    const desgloses = turnosDocs.map(({ turno }, idx) =>
      desglosarPagoTurno({
        turno,
        montoPago: Number(montosPorTurno[idx]?.montoAnticipo || 0),
        montoPagadoPrevio: Number(turno.montoPagado ?? 0),
      }),
    );

    const montoComision = desgloses.reduce(
      (acc, item) => acc + Number(item.montoComision || 0),
      0,
    );
    const montoLiquidable = desgloses.reduce(
      (acc, item) => acc + Number(item.montoLiquidable || 0),
      0,
    );

    const tipoPago = resolveTipoPagoTurno(montoAnticipo, montoTotal);
    const tituloPago =
      tipoPago === "total"
        ? esPagoPack
          ? `Pago total pack - ${turnoBase.nombreServicio || "Servicio"}`
          : `Pago total turno - ${turnoBase.nombreServicio || "Servicio"}`
        : esPagoPack
          ? `Seña pack - ${turnoBase.nombreServicio || "Servicio"}`
          : `Seña turno - ${turnoBase.nombreServicio || "Servicio"}`;

    const expiraEn = turnosDocs.reduce((acc, { turno }) => {
      const vence = Number(turno?.venceEn || 0);
      if (!vence) return acc;
      if (!acc) return vence;
      return Math.min(acc, vence);
    }, 0);

    const pagoRef = db.collection("pagos").doc();

    await pagoRef.set({
      turnoId: turnoIds[0],
      turnoIds,
      esPack: esPagoPack,
      clienteId: uid,

      metodo: "mercadopago",
      canal: "checkout_pro",
      origen: "turno_online",
      estado: "pendiente",

      monto: montoAnticipo,
      montoTotal,
      montoServicio,
      montoServicioPagado: montoLiquidable,
      montoComision,
      montoLiquidable,
      tipoPago,
      tipo: tipoPago,

      mpPreferenceId: null,
      mpInitPoint: null,
      mpPaymentId: null,
      mpStatus: null,
      mpTokenSource: usaOauthMp ? "oauth" : "global",
      mpAccountUid: usaOauthMp ? activeMpConnection.uid : null,
      mpCollectorIdExpected: usaOauthMp ? mpCollectorIdEsperado : null,
      mpMarketplaceFee: usaOauthMp ? Number(montoComision || 0) : 0,

      expiraEn: expiraEn || null,
      comprobanteUrl: null,

      creadoEn: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const turnosBatch = db.batch();
    turnosDocs.forEach(({ ref, turno }) => {
      const montosTurno = normalizarMontosTurno(turno);
      const montoTotalTurno = Number(montosTurno.montoTotal || 0);
      const montoPagadoTurno = Number(turno.montoPagado ?? 0);

      turnosBatch.update(ref, {
        pagoId: pagoRef.id,
        pagoTurnosCount: turnoIds.length,

        metodoPago: "mercadopago", // compatibilidad vieja
        metodoPagoEsperado: "mercadopago",
        metodoPagoUsado: null,
        origenSolicitud: turno.origenSolicitud || "web",

        estadoPago: "pendiente",

        montoTotal: montoTotalTurno,
        montoPagado: montoPagadoTurno,
        saldoPendiente: Math.max(0, montoTotalTurno - montoPagadoTurno),

        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    await turnosBatch.commit();

    const { MercadoPagoConfig, Preference } = await import("mercadopago");

    const client = new MercadoPagoConfig({
      accessToken: mpAccessTokenFinal,
    });

    const preference = new Preference(client);

    const preferenceBody = {
      items: [
        {
          id: esPagoPack
            ? `pack_${turnoBase?.servicioId || "servicio"}_${turnoIds.length}`
            : `turno_${turnoIds[0]}`,
          title: tituloPago,
          description: buildItemDescription({
            esPagoPack,
            tipoPago,
            turnoBase,
            turnoIds,
          }),
          quantity: 1,
          unit_price: montoAnticipo,
          currency_id: "ARS",
        },
      ],
      purpose: "wallet_purchase",
      external_reference: pagoRef.id,
      back_urls: {
        success: `${frontUrl}/pago-resultado`,
        failure: `${frontUrl}/pago-resultado`,
        pending: `${frontUrl}/pago-resultado`,
      },
      statement_descriptor: buildStatementDescriptor({
        turnoBase,
        activeMpConnection,
        clienteData,
      }),
    };

    const payer = buildPayer({
      payerInput,
      authToken: request.auth?.token || {},
      turnoBase,
      clienteData,
    });
    if (payer) preferenceBody.payer = payer;

    if (usaOauthMp && Number(montoComision || 0) > 0) {
      preferenceBody.marketplace_fee = Number(montoComision || 0);
    }

    const pref = await preference.create({
      body: preferenceBody,
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
  },
);

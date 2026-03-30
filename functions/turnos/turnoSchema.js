const { FieldValue } = require("firebase-admin/firestore");

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizePhone(value) {
  return String(value || "").replace(/\D+/g, "");
}

function resolveLegacyEventTimestamp(turno = {}, eventName = "") {
  const safeName = String(eventName || "").trim();
  if (!safeName) return null;

  const atKey = `${safeName}At`;
  const enKey = `${safeName}En`;
  return turno?.[atKey] || turno?.[enKey] || null;
}

function buildTurnoBaseCompat({
  clienteId,
  nombreCliente,
  telefonoCliente,
  emailCliente,
  servicioId,
  nombreServicio,
  profesionalId = null,
  profesionalNombre = null,
  responsableGestion = "admin",
  gabineteId,
  nombreGabinete,
  fecha,
  horaInicio,
  horaFin,
  estadoTurno,
  estadoPago,
  origenTurno = "web",
  metodoPagoEsperado = "sin_pago",
  metodoPagoUsado = null,
  requiereAnticipo = false,
  tipoAnticipo = null,
  montoServicio = 0,
  precioVariable = false,
  itemsPrecioVariable = [],
  montoExtraServicio = 0,
  comisionTurno = 0,
  montoAnticipoServicio = 0,
  montoAnticipo = 0,
  montoTotal = 0,
  montoPagado = 0,
  saldoPendiente = 0,
  venceEn = null,
}) {
  return {
    servicioId,
    nombreServicio,

    profesionalId,
    profesionalNombre,
    responsableGestion,

    clienteId,
    usuarioId: clienteId,
    nombreCliente,
    clienteNombre: nombreCliente || null,
    clienteNombreNormalizado: normalizeText(nombreCliente),
    telefonoCliente: telefonoCliente || null,
    clienteTelefono: telefonoCliente || null,
    clienteTelefonoNormalizado: normalizePhone(telefonoCliente),
    clienteEmail: emailCliente || null,
    clienteEmailNormalizado: normalizeText(emailCliente),

    gabineteId,
    nombreGabinete: nombreGabinete || "",

    fecha,
    horaInicio,
    horaFin,

    estadoTurno,
    estadoPago,

    origenSolicitud: origenTurno,
    origenTurno,
    metodoPagoEsperado,
    metodoPagoUsado,

    tipoAnticipo,
    montoServicio,
    precioServicio: montoServicio,
    precioVariable,
    itemsPrecioVariable,
    montoExtraServicio,
    comisionTurno,
    montoAnticipoServicio,
    pedirAnticipo: requiereAnticipo,
    montoAnticipo,
    senaRequerida: montoAnticipo,
    senaPagada: 0,

    montoTotal,
    precioTotal: montoTotal,
    montoPagado,
    saldoPendiente,
    pagosCount: 0,
    ultimoPagoEn: null,

    observacionesInternas: null,
    observacionesCliente: null,

    canceladoPor: null,
    motivoCancelacion: null,
    canceladoAt: null,

    ausentePor: null,
    motivoAusencia: null,
    ausenteAt: null,

    reprogramado: false,
    reprogramadoPor: null,
    motivoReprogramacion: null,
    reprogramadoAt: null,

    finalizadoAutomatico: false,
    finalizadoAt: null,
    finalizadoPor: null,

    createdAt: FieldValue.serverTimestamp(),
    creadoEn: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    venceEn,
  };
}

module.exports = {
  buildTurnoBaseCompat,
  normalizeText,
  normalizePhone,
  resolveLegacyEventTimestamp,
};

const { FieldValue } = require("firebase-admin/firestore");
const { enviarWhatsApp } = require("./whatsapp");

const TIME_ZONE = "America/Argentina/Buenos_Aires";
const TEMPLATE_CONFIRMACION_FALLBACK = "confirmacion_turno";

function getReservasConfigDefault() {
  return {
    whatsappHabilitado: false,
    whatsappCodigoPais: "54",
    whatsappPhoneNumberId: "",
    whatsappTemplateIdioma: "es_AR",
    whatsappTemplateConfirmacion: TEMPLATE_CONFIRMACION_FALLBACK,
  };
}

function getEstadoTurno(turno = {}) {
  return turno.estadoTurno || turno.estado || "pendiente";
}

function formatHora(value) {
  const ms = Number(value || 0);
  if (!Number.isFinite(ms) || ms <= 0) return "-";

  return new Date(ms).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  });
}

function formatFecha(fechaISO) {
  const [year, month, day] = String(fechaISO || "").split("-").map(Number);
  if (!year || !month || !day) return String(fechaISO || "-");

  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).toLocaleDateString(
    "es-AR",
    {
      weekday: "long",
      day: "2-digit",
      month: "long",
      timeZone: TIME_ZONE,
    },
  );
}

function resolveTelefonoCliente(turno = {}, cliente = {}) {
  return (
    turno.telefonoCliente ||
    turno.clienteTelefono ||
    cliente.telefono ||
    cliente.phone ||
    cliente.celular ||
    null
  );
}

async function enviarWhatsAppConfirmacionTurno({ db, turnoId, turnoData = null }) {
  if (!db || !turnoId) return { ok: false, reason: "missing_params" };

  const turnoRef = db.collection("turnos").doc(String(turnoId));
  const turnoSnap = turnoData
    ? { exists: true, data: () => turnoData }
    : await turnoRef.get();

  if (!turnoSnap.exists) return { ok: false, reason: "turno_not_found" };

  const turno = turnoSnap.data() || {};
  if (getEstadoTurno(turno) !== "confirmado") {
    return { ok: false, reason: "turno_not_confirmado" };
  }

  if (turno.whatsappConfirmacionEnviadaAt) {
    return { ok: true, skipped: true, reason: "already_sent" };
  }

  const reservasConfigSnap = await db.collection("configuracion").doc("reservas").get();
  const reservasConfig = reservasConfigSnap.exists
    ? { ...getReservasConfigDefault(), ...reservasConfigSnap.data() }
    : getReservasConfigDefault();

  if (!reservasConfig.whatsappHabilitado) {
    return { ok: true, skipped: true, reason: "whatsapp_disabled" };
  }

  let cliente = {};
  const clienteId = turno.clienteId || turno.usuarioId || null;
  if (clienteId) {
    const clienteSnap = await db.collection("usuarios").doc(clienteId).get();
    if (clienteSnap.exists) {
      cliente = clienteSnap.data() || {};
    }
  }

  const telefono = resolveTelefonoCliente(turno, cliente);
  if (!telefono) {
    return { ok: false, reason: "telefono_missing" };
  }

  const ubicacionSnap = await db.collection("configuracion").doc("ubicacion").get();
  const ubicacion = ubicacionSnap.exists ? ubicacionSnap.data() || {} : {};

  const nombreCliente =
    turno.nombreCliente ||
    turno.clienteNombre ||
    cliente.nombre ||
    cliente.nombreCompleto ||
    "Cliente";
  const nombreServicio = turno.nombreServicio || "Servicio";
  const fecha = formatFecha(turno.fecha);
  const horario =
    turno.horaFin != null
      ? `${formatHora(turno.horaInicio)} - ${formatHora(turno.horaFin)}`
      : formatHora(turno.horaInicio);
  const profesional =
    turno.profesionalNombre || turno.nombreProfesional || "Profesional";
  const direccion = ubicacion.mapsDireccion || "Sin dirección";
  const templateName =
    String(
      reservasConfig.whatsappTemplateConfirmacion || TEMPLATE_CONFIRMACION_FALLBACK,
    ).trim() || TEMPLATE_CONFIRMACION_FALLBACK;

  try {
    await enviarWhatsApp({
      telefono,
      phoneNumberId: reservasConfig.whatsappPhoneNumberId,
      templateName,
      languageCode: reservasConfig.whatsappTemplateIdioma,
      bodyParameters: [
        nombreCliente,
        nombreServicio,
        fecha,
        horario,
        profesional,
        direccion,
      ],
      countryCode: reservasConfig.whatsappCodigoPais,
    });

    await turnoRef.update({
      whatsappConfirmacionEnviadaAt: FieldValue.serverTimestamp(),
      whatsappConfirmacionTelefonoUsado: telefono,
      whatsappConfirmacionTemplate: templateName,
      whatsappConfirmacionError: null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { ok: true };
  } catch (error) {
    const message = String(error?.message || "Error enviando WhatsApp").slice(
      0,
      1000,
    );

    await turnoRef.update({
      whatsappConfirmacionError: message,
      whatsappConfirmacionErrorAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    throw error;
  }
}

module.exports = {
  enviarWhatsAppConfirmacionTurno,
  TEMPLATE_CONFIRMACION_FALLBACK,
};


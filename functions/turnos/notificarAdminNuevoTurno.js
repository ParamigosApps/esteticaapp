const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const { getAdmin } = require("../_lib/firebaseAdmin");
const { FieldValue } = require("firebase-admin/firestore");
const { Resend } = require("resend");

const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const ADMIN_EMAIL = defineSecret("ADMIN_EMAIL");
const FROM_EMAIL = defineSecret("FROM_EMAIL");
const ESTADOS_NOTIFICABLES = new Set(["confirmado", "pendiente_aprobacion"]);
const PLACEHOLDER = "-";
const BUSINESS_TIME_ZONE = "America/Argentina/Buenos_Aires";

function esc(v) {
  return String(v ?? PLACEHOLDER)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function resolveEstadoTurno(turno = {}) {
  return String(turno.estadoTurno || turno.estado || "").trim();
}

function getAsunto(estadoTurno) {
  return estadoTurno === "pendiente_aprobacion"
    ? "Nueva reserva pendiente de aprobación"
    : "Nuevo turno confirmado";
}

function getEstadoLabel(estadoTurno) {
  if (estadoTurno === "pendiente_aprobacion") return "Pendiente de aprobación";
  if (estadoTurno === "confirmado") return "Confirmado";
  return estadoTurno || PLACEHOLDER;
}

function getEstadoBadgeColors(estadoTurno) {
  if (estadoTurno === "pendiente_aprobacion") {
    return { bg: "#fff4dd", fg: "#92400e", border: "#f3d39b" };
  }

  if (estadoTurno === "confirmado") {
    return { bg: "#eafaf1", fg: "#166534", border: "#b7ebc8" };
  }

  return { bg: "#f3f4f6", fg: "#374151", border: "#d1d5db" };
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("es-AR");
}

function formatHour(ts) {
  if (!ts && ts !== 0) return "-";

  const d = new Date(Number(ts));
  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: BUSINESS_TIME_ZONE,
  });
}

function formatFecha(fechaIso) {
  const [year, month, day] = String(fechaIso || "").split("-").map(Number);
  if (!year || !month || !day) return "-";

  const parsed = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (Number.isNaN(parsed.getTime())) return "-";

  return parsed.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatFechaHora(fecha, horaInicio, horaFin) {
  const horaInicioTexto = formatHour(horaInicio);
  const horaFinTexto = formatHour(horaFin);

  const rangoHorario =
    horaInicioTexto !== "-" && horaFinTexto !== "-"
      ? `${horaInicioTexto} - ${horaFinTexto}`
      : horaInicioTexto !== "-"
        ? horaInicioTexto
        : "-";

  return {
    fechaTexto: formatFecha(fecha),
    horaTexto: rangoHorario,
  };
}

function buildDetailItem(label, value) {
  return `
    <tr>
      <td style="padding:8px 0;color:#6b7280;font-size:13px;vertical-align:top;width:140px;">${esc(label)}</td>
      <td style="padding:8px 0;color:#111827;font-size:14px;font-weight:600;vertical-align:top;">${esc(value)}</td>
    </tr>
  `;
}

function buildMailHtml({ asunto, turnoId, turno, estadoTurno, fechaTexto, horaTexto }) {
  const estadoLabel = getEstadoLabel(estadoTurno);
  const badge = getEstadoBadgeColors(estadoTurno);

  const details = [
    buildDetailItem("Servicio", turno.nombreServicio),
    buildDetailItem("Cliente", turno.nombreCliente),
    buildDetailItem("Telefono", turno.telefonoCliente),
    buildDetailItem("Fecha", fechaTexto),
    buildDetailItem("Horario", horaTexto),
    buildDetailItem("Gabinete", turno.nombreGabinete),
    buildDetailItem("Total", `$${formatMoney(turno.precioTotal || turno.montoTotal || 0)}`),
    buildDetailItem("Anticipo sugerido", `$${formatMoney(turno.montoAnticipo || 0)}`),
    buildDetailItem("ID turno", turnoId),
  ].join("");

  return `
  <div style="margin:0;padding:28px;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
      <tr>
        <td style="padding:22px 26px;background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);">
          <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#cbd5e1;margin-bottom:8px;">Turnos App</div>
          <div style="font-size:22px;line-height:1.3;font-weight:700;color:#ffffff;">${esc(asunto)}</div>
          <div style="margin-top:12px;display:inline-block;padding:6px 12px;border-radius:999px;background:${badge.bg};border:1px solid ${badge.border};color:${badge.fg};font-size:12px;font-weight:700;">${esc(estadoLabel)}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:24px 26px 18px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${details}
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 26px 22px;border-top:1px solid #f1f5f9;color:#64748b;font-size:12px;">
          Notificación automatica generada al recibir una solicitud o confirmar un turno.
        </td>
      </tr>
    </table>
  </div>
  `;
}

exports.notificarAdminNuevoTurno = onDocumentWritten(
  {
    document: "turnos/{turnoId}",
    region: "us-central1",
    secrets: [RESEND_API_KEY, ADMIN_EMAIL, FROM_EMAIL],
  },
  async (event) => {
    const afterSnap = event.data?.after;
    if (!afterSnap?.exists) return;

    const beforeSnap = event.data?.before;
    const beforeTurno = beforeSnap?.exists ? beforeSnap.data() || {} : null;
    const turno = afterSnap.data() || {};
    const turnoId = afterSnap.id;

    const estadoTurno = resolveEstadoTurno(turno);
    if (!ESTADOS_NOTIFICABLES.has(estadoTurno)) {
      return;
    }

    const estadoPrevio = beforeTurno ? resolveEstadoTurno(beforeTurno) : null;
    const cambioAEstadoNotificable =
      beforeTurno == null ||
      !ESTADOS_NOTIFICABLES.has(estadoPrevio) ||
      estadoPrevio !== estadoTurno;

    if (!cambioAEstadoNotificable) {
      return;
    }

    const db = getAdmin().firestore();
    const turnoRef = db.collection("turnos").doc(turnoId);

    if (turno.adminMailEnviado === true) {
      return;
    }

    const apiKey = String(RESEND_API_KEY.value() || "").trim();
    const from = String(FROM_EMAIL.value() || "").trim();
    const to = String(ADMIN_EMAIL.value() || "").trim();

    if (!apiKey || !from || !to) {
      throw new Error("Faltan secrets de mail: RESEND_API_KEY, FROM_EMAIL o ADMIN_EMAIL");
    }

    const resend = new Resend(apiKey);
    const { fechaTexto, horaTexto } = formatFechaHora(
      turno.fecha,
      turno.horaInicio,
      turno.horaFin,
    );

    const asunto = getAsunto(estadoTurno);
    const html = buildMailHtml({
      asunto,
      turnoId,
      turno,
      estadoTurno,
      fechaTexto,
      horaTexto,
    });

    try {
      const resp = await resend.emails.send({
        from,
        to,
        subject: asunto,
        html,
      });

      await turnoRef.update({
        adminMailEnviado: true,
        adminMailEnviadoAt: FieldValue.serverTimestamp(),
        adminMailId: resp?.data?.id || null,
      });
    } catch (error) {
      console.error("Error enviando mail al admin:", error);

      await turnoRef.update({
        adminMailErrorAt: FieldValue.serverTimestamp(),
        adminMailErrorMensaje: error?.message || "Error desconocido",
      });

      throw error;
    }
  },
);

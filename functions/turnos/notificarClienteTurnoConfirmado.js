const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const { getAdmin } = require("../_lib/firebaseAdmin");
const { FieldValue } = require("firebase-admin/firestore");
const { Resend } = require("resend");

const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const FROM_EMAIL = defineSecret("FROM_EMAIL");
const BUSINESS_TIME_ZONE = "America/Argentina/Buenos_Aires";

function resolveEstadoTurno(turno = {}) {
  return String(turno.estadoTurno || turno.estado || "").trim().toLowerCase();
}

function esc(v) {
  return String(v || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("es-AR");
}

function formatFecha(fecha) {
  if (!fecha) return "-";
  const parsed = new Date(`${fecha}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: BUSINESS_TIME_ZONE,
  });
}

function formatHora(value) {
  const ts = Number(value || 0);
  if (!ts) return "-";
  const parsed = new Date(ts);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: BUSINESS_TIME_ZONE,
  });
}

function buildHtml({ turno = {} }) {
  const fecha = formatFecha(turno.fecha);
  const horaInicio = formatHora(turno.horaInicio);
  const horaFin = formatHora(turno.horaFin);
  const horario =
    horaInicio !== "-" && horaFin !== "-" ? `${horaInicio} - ${horaFin}` : horaInicio;

  return `
    <div style="margin:0;padding:28px;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
        <tr>
          <td style="padding:22px 26px;background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);">
            <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#cbd5e1;margin-bottom:8px;">Turnos App</div>
            <div style="font-size:22px;line-height:1.3;font-weight:700;color:#ffffff;">Tu turno fue confirmado</div>
          </td>
        </tr>
        <tr>
          <td style="padding:22px 26px;color:#1f2937;">
            <p style="margin:0 0 10px;">Hola <b>${esc(turno.nombreCliente || "Cliente")}</b>, tu reserva ya quedó confirmada.</p>
            <p style="margin:0 0 8px;"><b>Servicio:</b> ${esc(turno.nombreServicio || "-")}</p>
            <p style="margin:0 0 8px;"><b>Fecha:</b> ${esc(fecha)}</p>
            <p style="margin:0 0 8px;"><b>Horario:</b> ${esc(horario)}</p>
            <p style="margin:0 0 8px;"><b>Gabinete:</b> ${esc(turno.nombreGabinete || "-")}</p>
            <p style="margin:0;"><b>Total:</b> $${esc(formatMoney(turno.montoTotal || turno.precioTotal || 0))}</p>
          </td>
        </tr>
      </table>
    </div>
  `;
}

async function resolveEmailCliente({ db, turno = {} }) {
  const emailTurno = String(turno.clienteEmail || "").trim().toLowerCase();
  if (emailTurno) return emailTurno;

  const clienteId = String(turno.clienteId || turno.usuarioId || "").trim();
  if (!clienteId) return "";

  const clienteSnap = await db.collection("usuarios").doc(clienteId).get();
  if (!clienteSnap.exists) return "";

  const cliente = clienteSnap.data() || {};
  return String(cliente.email || "").trim().toLowerCase();
}

exports.notificarClienteTurnoConfirmado = onDocumentWritten(
  {
    document: "turnos/{turnoId}",
    region: "us-central1",
    secrets: [RESEND_API_KEY, FROM_EMAIL],
  },
  async (event) => {
    const afterSnap = event.data?.after;
    if (!afterSnap?.exists) return;

    const beforeSnap = event.data?.before;
    const beforeTurno = beforeSnap?.exists ? beforeSnap.data() || {} : null;
    const turno = afterSnap.data() || {};
    const turnoId = afterSnap.id;

    if (turno.clienteMailConfirmacionEnviado === true) return;

    const estadoActual = resolveEstadoTurno(turno);
    if (estadoActual !== "confirmado") return;

    const estadoPrevio = beforeTurno ? resolveEstadoTurno(beforeTurno) : "";
    const cambioAConfirmado = !beforeTurno || estadoPrevio !== "confirmado";
    const pagoConfirmadoRecien =
      Boolean(turno.pagoConfirmadoAt) && !Boolean(beforeTurno?.pagoConfirmadoAt);

    if (!cambioAConfirmado && !pagoConfirmadoRecien) return;

    const apiKey = String(RESEND_API_KEY.value() || "").trim();
    const from = String(FROM_EMAIL.value() || "").trim();
    if (!apiKey || !from) {
      throw new Error("Faltan secrets de mail: RESEND_API_KEY o FROM_EMAIL");
    }

    const db = getAdmin().firestore();
    const emailCliente = await resolveEmailCliente({ db, turno });
    if (!emailCliente) {
      console.warn(
        `No se envia mail de confirmacion: turno ${turnoId} sin email de cliente`,
      );
      await afterSnap.ref.update({
        clienteMailConfirmacionErrorAt: FieldValue.serverTimestamp(),
        clienteMailConfirmacionErrorMensaje: "Cliente sin email",
      });
      return;
    }

    const resend = new Resend(apiKey);
    const subject = `Turno confirmado - ${String(turno.nombreServicio || "Servicio")}`;
    const html = buildHtml({ turno });

    try {
      const resp = await resend.emails.send({
        from,
        to: emailCliente,
        subject,
        html,
      });

      await afterSnap.ref.update({
        clienteMailConfirmacionEnviado: true,
        clienteMailConfirmacionEnviadoAt: FieldValue.serverTimestamp(),
        clienteMailConfirmacionDestino: emailCliente,
        clienteMailConfirmacionId: resp?.data?.id || null,
      });
      console.log(
        `Mail de confirmacion enviado a cliente para turno ${turnoId} (${emailCliente})`,
      );
    } catch (error) {
      console.error("Error enviando mail de confirmacion al cliente:", error);
      await afterSnap.ref.update({
        clienteMailConfirmacionErrorAt: FieldValue.serverTimestamp(),
        clienteMailConfirmacionErrorMensaje: error?.message || "Error desconocido",
      });
      throw error;
    }
  },
);

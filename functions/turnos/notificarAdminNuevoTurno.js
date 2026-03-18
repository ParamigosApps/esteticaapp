const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const { getAdmin } = require("../_lib/firebaseAdmin");
const { FieldValue } = require("firebase-admin/firestore");
const { Resend } = require("resend");

const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const ADMIN_EMAIL = defineSecret("ADMIN_EMAIL");
const FROM_EMAIL = defineSecret("FROM_EMAIL");
const ESTADOS_NOTIFICABLES = new Set(["confirmado", "pendiente_aprobacion"]);
const PLACEHOLDER = "-";

function esc(v) {
  return String(v ?? PLACEHOLDER)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resolveEstadoTurno(turno = {}) {
  return String(turno.estadoTurno || turno.estado || "").trim();
}

function getAsunto(estadoTurno) {
  return estadoTurno === "pendiente_aprobacion"
    ? "Nueva reserva pendiente de aprobacion"
    : "Nuevo turno confirmado";
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("es-AR");
}

function formatFechaHora(fecha, horaInicio) {
  if (!fecha || !horaInicio) return { fechaTexto: "-", horaTexto: "-" };

  const d = new Date(Number(horaInicio));
  const fechaObj = new Date(`${fecha}T00:00:00`);

  return {
    fechaTexto: fechaObj.toLocaleDateString("es-AR", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }),
    horaTexto: d.toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

function buildRow(label, value) {
  return `<p><b>${esc(label)}:</b> ${esc(value)}</p>`;
}

function buildMailHtml({ asunto, turnoId, turno, estadoTurno, fechaTexto, horaTexto }) {
  const rows = [
    buildRow("Servicio", turno.nombreServicio),
    buildRow("Cliente", turno.nombreCliente),
    buildRow("Telefono", turno.telefonoCliente),
    buildRow("Fecha", fechaTexto),
    buildRow("Hora", horaTexto),
    buildRow("Gabinete", turno.nombreGabinete),
    buildRow("Estado", estadoTurno),
    buildRow("Total", `$${formatMoney(turno.precioTotal || turno.montoTotal || 0)}`),
    buildRow("Anticipo", `$${formatMoney(turno.montoAnticipo || 0)}`),
    buildRow("ID turno", turnoId),
  ].join("");

  return `
    <div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;">
      <h2 style="margin-bottom:16px;">${esc(asunto)}</h2>
      ${rows}
    </div>
  `;
}

exports.notificarAdminNuevoTurno = onDocumentCreated(
  {
    document: "turnos/{turnoId}",
    region: "us-central1",
    secrets: [RESEND_API_KEY, ADMIN_EMAIL, FROM_EMAIL],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const turno = snap.data();
    const turnoId = snap.id;

    if (!turno) return;

    const estadoTurno = resolveEstadoTurno(turno);
    if (!ESTADOS_NOTIFICABLES.has(estadoTurno)) {
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

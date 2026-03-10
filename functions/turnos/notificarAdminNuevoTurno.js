const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const { getAdmin } = require("../_lib/firebaseAdmin");
const { FieldValue } = require("firebase-admin/firestore");
const { Resend } = require("resend");

const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const ADMIN_EMAIL = defineSecret("ADMIN_EMAIL");
const FROM_EMAIL = defineSecret("FROM_EMAIL");

function esc(v) {
  return String(v ?? "-")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

    if (!["confirmado", "pendiente_aprobacion"].includes(turno.estado)) {
      return;
    }

    const db = getAdmin().firestore();
    const turnoRef = db.collection("turnos").doc(turnoId);

    if (turno.adminMailEnviado === true) {
      return;
    }

    const resend = new Resend(RESEND_API_KEY.value());

    const { fechaTexto, horaTexto } = formatFechaHora(
      turno.fecha,
      turno.horaInicio,
    );

    const asunto =
      turno.estado === "pendiente_aprobacion"
        ? "Nueva reserva pendiente de aprobación"
        : "Nuevo turno confirmado";

    const html = `
      <div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;">
        <h2 style="margin-bottom:16px;">${esc(asunto)}</h2>

        <p><b>Servicio:</b> ${esc(turno.nombreServicio)}</p>
        <p><b>Cliente:</b> ${esc(turno.nombreCliente)}</p>
        <p><b>Teléfono:</b> ${esc(turno.telefonoCliente)}</p>
        <p><b>Fecha:</b> ${esc(fechaTexto)}</p>
        <p><b>Hora:</b> ${esc(horaTexto)}</p>
        <p><b>Gabinete:</b> ${esc(turno.nombreGabinete)}</p>
        <p><b>Estado:</b> ${esc(turno.estado)}</p>
        <p><b>Total:</b> $${Number(turno.precioTotal || 0).toLocaleString("es-AR")}</p>
        <p><b>Anticipo:</b> $${Number(turno.montoAnticipo || 0).toLocaleString("es-AR")}</p>
        <p><b>ID turno:</b> ${esc(turnoId)}</p>
      </div>
    `;

    try {
      const resp = await resend.emails.send({
        from: FROM_EMAIL.value(),
        to: ADMIN_EMAIL.value(),
        subject: asunto,
        html,
      });

      await turnoRef.update({
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
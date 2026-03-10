const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const { getAdmin } = require("../_lib/firebaseAdmin");

// Elegí tu proveedor (Meta o Twilio). Acá dejo un placeholder genérico.
const WHATSAPP_TOKEN = defineSecret("WHATSAPP_TOKEN");

async function enviarWhatsAppRecordatorio({ telefono, texto }) {
  // TODO: implementar con Meta o Twilio.
  // Importante: este método debe tirar error si falla, así podés loguear y reintentar.
  // Ejemplo: await fetch(...)

  console.log("Enviar WA a:", telefono, "texto:", texto);
}

exports.enviarRecordatorios24h = onSchedule(
  {
    region: "us-central1",
    schedule: "every 5 minutes",
    timeZone: "America/Argentina/Buenos_Aires",
    secrets: [WHATSAPP_TOKEN],
  },
  async () => {
    const db = getAdmin().firestore();

    // Ventana: turnos que empiezan entre (ahora + 24h) y (ahora + 24h + 5min)
        const ahora = Date.now();

        const desde = ahora + 24 * 60 * 60 * 1000;
        const hasta = desde + 5 * 60 * 1000; // ventana 5 min

    const snap = await db
    .collection("turnos")
    .where("estado", "==", "confirmado")
    .where("horaInicio", ">=", desde)
    .where("horaInicio", "<", hasta)
    .where("recordatorio24Enviado", "==", false)
    .where("recordatorio24Procesando", "==", false)
    .get();

    if (snap.empty) return;

        for (const docSnap of snap.docs) {
        const turnoRef = docSnap.ref;

        try {
            // 🔒 Paso 1: lock suave
            const ok = await db.runTransaction(async (tx) => {
            const fresh = await tx.get(turnoRef);
            if (!fresh.exists) return false;

            const data = fresh.data();
            if (data.recordatorio24Enviado) return false;

            // Solo marcamos que está "procesándose"
            tx.update(turnoRef, {
                recordatorio24Procesando: true,
            });

            return true;
            });

            if (!ok) continue;

            const turno = docSnap.data();

            const clienteId = turno.clienteId;
            if (!clienteId) continue;

            const clienteSnap = await db.collection("usuarios").doc(clienteId).get();
            if (!clienteSnap.exists) continue;

            const telefono = clienteSnap.data().telefono;
            if (!telefono) continue;

            const fechaHora = new Date(turno.horaInicio);

            const texto = `Recordatorio: tenés tu turno mañana a las ${fechaHora.toLocaleTimeString(
            "es-AR",
            { hour: "2-digit", minute: "2-digit" }
            )}.`;

            // 📤 Paso 2: enviar
            await enviarWhatsAppRecordatorio({ telefono, texto });

            // ✅ Paso 3: marcar enviado SOLO si no falló
            await turnoRef.update({
            recordatorio24Enviado: true,
            recordatorio24EnviadoAt:
                getAdmin().firestore.FieldValue.serverTimestamp(),
            recordatorio24Procesando: false,
            recordatorio24TelefonoUsado: telefono,
            });

        } catch (e) {
            console.error("Error recordatorio turno", docSnap.id, e);

            // limpiar lock si falló
            await turnoRef.update({
            recordatorio24Procesando: false,
            });
        }
        }
  }
);
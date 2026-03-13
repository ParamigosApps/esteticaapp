const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getAdmin } = require("../_lib/firebaseAdmin");
const { WHATSAPP_TOKEN, enviarWhatsApp } = require("./whatsapp");

const TIME_ZONE = "America/Argentina/Buenos_Aires";

function getReservasConfigDefault() {
  return {
    whatsappHabilitado: false,
    enviarWhatsappPendienteTest: false,
    horaRecordatorioWhatsapp: "10:00",
    whatsappCodigoPais: "54",
    whatsappPhoneNumberId: "",
    whatsappTemplateIdioma: "es_AR",
    whatsappTemplateSolicitud: "",
    whatsappTemplateRecordatorio: "",
  };
}

function getPartsInTimeZone(date, timeZone = TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type) => parts.find((part) => part.type === type)?.value;

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    dateISO: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

function sumarDiasISO(fechaISO, dias) {
  const [y, m, d] = String(fechaISO).split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

function shouldRunNow(currentParts, horaConfig) {
  if (typeof horaConfig !== "string" || !horaConfig.includes(":")) {
    return false;
  }

  const [hour, minute] = horaConfig.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return false;
  }

  const currentMinuteOfDay = currentParts.hour * 60 + currentParts.minute;
  const targetMinuteOfDay = hour * 60 + minute;

  return (
    currentMinuteOfDay >= targetMinuteOfDay &&
    currentMinuteOfDay < targetMinuteOfDay + 5
  );
}

function getEstadoTurno(turno = {}) {
  return turno.estadoTurno || turno.estado || "pendiente";
}

function formatHora(ms) {
  return new Date(Number(ms)).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  });
}

function formatFecha(fechaISO) {
  const [year, month, day] = String(fechaISO).split("-").map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1, 12, 0, 0)).toLocaleDateString(
    "es-AR",
    {
      weekday: "long",
      day: "2-digit",
      month: "long",
      timeZone: TIME_ZONE,
    },
  );
}

function buildReminderMessage(turno) {
  return [
    `Recordatorio: tenes un turno manana, ${formatFecha(turno.fecha)}, a las ${formatHora(turno.horaInicio)}.`,
    turno.nombreServicio ? `Servicio: ${turno.nombreServicio}.` : null,
    "Si necesitas ayuda, respondenos por este medio.",
  ]
    .filter(Boolean)
    .join(" ");
}

exports.enviarRecordatorios24h = onSchedule(
  {
    region: "us-central1",
    schedule: "every 5 minutes",
    timeZone: TIME_ZONE,
    secrets: [WHATSAPP_TOKEN],
  },
  async () => {
    const db = getAdmin().firestore();
    const configSnap = await db.collection("configuracion").doc("reservas").get();
    const reservasConfig = configSnap.exists
      ? { ...getReservasConfigDefault(), ...configSnap.data() }
      : getReservasConfigDefault();

    if (!reservasConfig.whatsappHabilitado) return;

    const nowParts = getPartsInTimeZone(new Date());
    if (!shouldRunNow(nowParts, reservasConfig.horaRecordatorioWhatsapp)) {
      return;
    }

    const fechaObjetivo = sumarDiasISO(nowParts.dateISO, 1);
    const snap = await db
      .collection("turnos")
      .where("fecha", "==", fechaObjetivo)
      .get();

    if (snap.empty) return;

    for (const docSnap of snap.docs) {
      const turnoRef = docSnap.ref;

      try {
        const ok = await db.runTransaction(async (tx) => {
          const fresh = await tx.get(turnoRef);
          if (!fresh.exists) return false;

          const data = fresh.data() || {};
          const estadoTurno = getEstadoTurno(data);

          if (estadoTurno !== "confirmado") return false;
          if (data.recordatorioProximoDiaClave === fechaObjetivo) return false;
          if (data.recordatorioProximoDiaProcesando) return false;

          tx.update(turnoRef, {
            recordatorioProximoDiaProcesando: true,
          });

          return true;
        });

        if (!ok) continue;

        const turno = docSnap.data() || {};
        const clienteId = turno.clienteId;

        let telefono = turno.telefonoCliente || turno.clienteTelefono || null;

        if (!telefono && clienteId) {
          const clienteSnap = await db.collection("usuarios").doc(clienteId).get();
          if (clienteSnap.exists) {
            const cliente = clienteSnap.data() || {};
            telefono =
              cliente.telefono ||
              cliente.phone ||
              cliente.celular ||
              null;
          }
        }

        if (!telefono) {
          await turnoRef.update({
            recordatorioProximoDiaProcesando: false,
          });
          continue;
        }

        await enviarWhatsApp({
          telefono,
          texto: buildReminderMessage(turno),
          phoneNumberId: reservasConfig.whatsappPhoneNumberId,
          templateName: reservasConfig.whatsappTemplateRecordatorio,
          languageCode: reservasConfig.whatsappTemplateIdioma,
          bodyParameters: [
            turno.nombreCliente || "Cliente",
            turno.nombreServicio || "Servicio",
            formatFecha(turno.fecha),
            formatHora(turno.horaInicio),
          ],
          countryCode: reservasConfig.whatsappCodigoPais,
        });

        await turnoRef.update({
          recordatorio24Enviado: true,
          recordatorio24EnviadoAt:
            getAdmin().firestore.FieldValue.serverTimestamp(),
          recordatorio24TelefonoUsado: telefono,
          recordatorio24Procesando: false,
          recordatorioProximoDiaClave: fechaObjetivo,
          recordatorioProximoDiaEnviadoAt:
            getAdmin().firestore.FieldValue.serverTimestamp(),
          recordatorioProximoDiaTelefonoUsado: telefono,
          recordatorioProximoDiaProcesando: false,
        });
      } catch (error) {
        console.error("Error recordatorio turno", docSnap.id, error);

        await turnoRef.update({
          recordatorio24Procesando: false,
          recordatorioProximoDiaProcesando: false,
        });
      }
    }
  },
);

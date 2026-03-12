// --------------------------------------------------
// functions/turnos/marcarTurnosFinalizados.js
// Marca automáticamente como "finalizado" los turnos
// cuya horaFin ya pasó, siempre que no estén cancelados,
// rechazados, perdidos o ya finalizados.
// --------------------------------------------------

const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const { getAdmin } = require("../_lib/firebaseAdmin");

function resolverEstadoTurno(turno) {
  if (turno?.estadoTurno) return turno.estadoTurno;

  switch (turno?.estado) {
    case "pendiente_pago":
    case "pendiente_pago_mp":
      return "pendiente";
    case "pendiente_aprobacion":
      return "pendiente_aprobacion";
    case "señado":
    case "confirmado":
      return "confirmado";
    case "cancelado":
      return "cancelado";
    case "rechazado":
      return "rechazado";
    case "vencido":
    case "expirado":
      return "cancelado";
    default:
      return "pendiente";
  }
}

exports.marcarTurnosFinalizados = onSchedule(
  {
    schedule: "0 * * * *", // cada 1 hora
    timeZone: "America/Argentina/Buenos_Aires",
    region: "us-central1",
    retryCount: 0,
  },
  async () => {
    const admin = getAdmin();
    const db = admin.firestore();

    const now = Date.now();

    // Ventana de seguridad: revisa turnos terminados en las últimas 72 hs.
    // Así, si una corrida falla, la próxima los vuelve a capturar.
    const desde = now - 72 * 60 * 60 * 1000;

    const snap = await db
      .collection("turnos")
      .where("horaFin", ">=", desde)
      .where("horaFin", "<=", now)
      .get();

    if (snap.empty) {
      logger.info("marcarTurnosFinalizados: no hay turnos para revisar");
      return null;
    }

    const elegibles = snap.docs.filter((docSnap) => {
      const t = docSnap.data() || {};
      const estadoTurno = resolverEstadoTurno(t);

      if (!t.horaFin) return false;

      if (
        ["cancelado", "rechazado", "perdido", "finalizado"].includes(
          estadoTurno,
        )
      ) {
        return false;
      }

      return true;
    });

    if (!elegibles.length) {
      logger.info("marcarTurnosFinalizados: sin turnos para actualizar", {
        leidos: snap.size,
      });
      return null;
    }

    // Batch en bloques para no jugártela con límites
    for (let i = 0; i < elegibles.length; i += 400) {
      const batch = db.batch();

      elegibles.slice(i, i + 400).forEach((docSnap) => {
        batch.update(docSnap.ref, {
          estadoTurno: "finalizado",
          finalizadoAutomatico: true,
          finalizadoAt: admin.firestore.FieldValue.serverTimestamp(),
          finalizadoEn: admin.firestore.FieldValue.serverTimestamp(),
          finalizadoPor: "sistema",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      await batch.commit();
    }

    logger.info("marcarTurnosFinalizados: OK", {
      leidos: snap.size,
      actualizados: elegibles.length,
    });

    return null;
  },
);

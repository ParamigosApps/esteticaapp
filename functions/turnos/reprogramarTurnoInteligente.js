const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getAdmin } = require("../_lib/firebaseAdmin");
const { FieldValue } = require("firebase-admin/firestore");

const HORA_REPROGRAMACION_MINIMA = 48;
const MAX_REPROGRAMACIONES_CLIENTE = 1;

function extraerGabineteIdsDesdeServicio(servicio) {
  const raw = Array.isArray(servicio?.gabinetes) ? servicio.gabinetes : [];

  return raw
    .map((g) => {
      if (typeof g === "string") return g.trim();
      if (g && typeof g === "object") {
        return String(g.id || g.gabineteId || "").trim();
      }
      return "";
    })
    .filter(Boolean);
}

function puedeReprogramarTurno(turno) {
  if (!turno) return false;

  if (
    ["cancelado", "rechazado", "vencido"].includes(turno.estado)
  ) {
    return false;
  }

  const start = Number(turno.horaInicio || 0);
  if (!start) return false;

  const diffH = (start - Date.now()) / 3600000;
  if (diffH < HORA_REPROGRAMACION_MINIMA) return false;

  const count = Number(turno.reprogramacionesCount || 0);
  if (count >= MAX_REPROGRAMACIONES_CLIENTE) return false;

  return true;
}

exports.reprogramarTurnoInteligente = onCall(
  { region: "us-central1" },
  async (request) => {
    console.log("=== reprogramarTurnoInteligente INPUT ===");
    console.log("UID:", request.auth?.uid);
    console.log("DATA:", JSON.stringify(request.data));

    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "No autenticado");
    }

    const {
      turnoId,
      fecha,
      horaInicio,
      horaFin,
      modoAsignacion = "balanceado",
    } = request.data || {};

    if (!turnoId || !fecha || horaInicio == null || horaFin == null) {
      throw new HttpsError("invalid-argument", "Datos incompletos");
    }

    const inicioNum = Number(horaInicio);
    const finNum = Number(horaFin);

    if (isNaN(inicioNum) || isNaN(finNum)) {
      throw new HttpsError("invalid-argument", "Horario inválido");
    }

    if (finNum <= inicioNum) {
      throw new HttpsError("invalid-argument", "Rango horario inválido");
    }

    const db = getAdmin().firestore();
    const clienteId = request.auth.uid;
    const turnoRef = db.collection("turnos").doc(turnoId);

    const turnoSnap = await turnoRef.get();
    if (!turnoSnap.exists) {
      throw new HttpsError("not-found", "Turno no encontrado");
    }

    const turnoActual = turnoSnap.data();

    if (turnoActual.clienteId !== clienteId) {
      throw new HttpsError("permission-denied", "No podés reprogramar este turno");
    }

    if (!puedeReprogramarTurno(turnoActual)) {
      throw new HttpsError(
        "failed-precondition",
        `Solo podés reprogramar con al menos ${HORA_REPROGRAMACION_MINIMA} horas de anticipación y hasta ${MAX_REPROGRAMACIONES_CLIENTE} vez`
      );
    }

    if (!turnoActual.servicioId) {
      throw new HttpsError("failed-precondition", "El turno no tiene servicio asociado");
    }

    const servicioSnap = await db.collection("servicios").doc(turnoActual.servicioId).get();
    if (!servicioSnap.exists) {
      throw new HttpsError("not-found", "Servicio no encontrado");
    }

    const servicio = servicioSnap.data();
    const idsValidos = extraerGabineteIdsDesdeServicio(servicio);

    if (!idsValidos.length) {
      throw new HttpsError("failed-precondition", "El servicio no tiene gabinetes configurados");
    }

    return await db.runTransaction(async (tx) => {
      const turnoSnapTx = await tx.get(turnoRef);
      if (!turnoSnapTx.exists) {
        throw new HttpsError("not-found", "Turno no encontrado");
      }

      const turnoTx = turnoSnapTx.data();

      if (turnoTx.clienteId !== clienteId) {
        throw new HttpsError("permission-denied", "No podés reprogramar este turno");
      }

      if (!puedeReprogramarTurno(turnoTx)) {
        throw new HttpsError(
          "failed-precondition",
          `Solo podés reprogramar con al menos ${HORA_REPROGRAMACION_MINIMA} horas de anticipación y hasta ${MAX_REPROGRAMACIONES_CLIENTE} vez`
        );
      }

      const gabineteDocs = await Promise.all(
        idsValidos.map((id) => tx.get(db.collection("gabinetes").doc(id)))
      );

      const gabinetes = gabineteDocs
        .filter((snap) => snap.exists)
        .map((snap) => ({ id: snap.id, ...snap.data() }))
        .filter((g) => g.activo !== false);

      if (!gabinetes.length) {
        throw new HttpsError("failed-precondition", "Sin gabinetes activos");
      }

      const turnosSnap = await tx.get(
        db.collection("turnos").where("fecha", "==", fecha)
      );

      const ahora = Date.now();

      const turnosActivos = turnosSnap.docs
        .map((d) => ({
          id: d.id,
          ...d.data(),
        }))
        .filter((t) => t.id !== turnoId)
        .filter((t) =>
          ["pendiente_pago_mp", "pendiente_aprobacion", "confirmado"].includes(t.estado)
        )
        .filter((t) => {
          if (!t.venceEn) return true;
          return t.venceEn > ahora;
        });

      const conflictoServicio = turnosActivos.some((t) =>
        t.servicioId === turnoTx.servicioId &&
        inicioNum < Number(t.horaFin) &&
        finNum > Number(t.horaInicio)
      );

      if (conflictoServicio) {
        throw new HttpsError("failed-precondition", "Horario ocupado");
      }

      const candidatos = gabinetes.filter((g) => {
        const solapado = turnosActivos.some((t) => {
          return (
            t.gabineteId === g.id &&
            inicioNum < Number(t.horaFin) &&
            finNum > Number(t.horaInicio)
          );
        });

        return !solapado;
      });

      if (!candidatos.length) {
        throw new HttpsError("failed-precondition", "Horario ocupado");
      }

      let gabineteElegido;

      if (modoAsignacion === "prioridad") {
        gabineteElegido = candidatos.sort(
          (a, b) => (a.prioridad ?? 999) - (b.prioridad ?? 999)
        )[0];
      } else {
        const carga = candidatos.map((g) => ({
          ...g,
          carga: turnosActivos.filter((t) => t.gabineteId === g.id).length,
        }));

        carga.sort((a, b) => {
          if (a.carga !== b.carga) return a.carga - b.carga;
          return (a.prioridad ?? 999) - (b.prioridad ?? 999);
        });

        gabineteElegido = carga[0];
      }

      tx.update(turnoRef, {
        fecha,
        horaInicio: inicioNum,
        horaFin: finNum,

        gabineteId: gabineteElegido.id,
        nombreGabinete:
          gabineteElegido.nombreGabinete || gabineteElegido.nombre || "",

        reprogramado: true,
        reprogramadoAt: FieldValue.serverTimestamp(),
        reprogramadoEn: FieldValue.serverTimestamp(),
        reprogramadoPor: "cliente",
        motivoReprogramacion: "reprogramacion_cliente",

        reprogramacionesCount: FieldValue.increment(1),

        ultimaFechaAnterior: turnoTx.fecha || null,
        ultimaHoraInicioAnterior: Number(turnoTx.horaInicio || 0) || null,
        ultimaHoraFinAnterior: Number(turnoTx.horaFin || 0) || null,
        ultimoGabineteIdAnterior: turnoTx.gabineteId || null,
        ultimoNombreGabineteAnterior: turnoTx.nombreGabinete || null,

        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        ok: true,
        turnoId,
        gabineteAsignado: gabineteElegido.id,
        nombreGabinete:
          gabineteElegido.nombreGabinete || gabineteElegido.nombre || "",
        fecha,
        horaInicio: inicioNum,
        horaFin: finNum,
        reprogramacionesCount: Number(turnoTx.reprogramacionesCount || 0) + 1,
      };
    });
  },
);

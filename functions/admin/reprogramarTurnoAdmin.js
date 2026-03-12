const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { FieldValue } = require("firebase-admin/firestore");
const { getAdmin } = require("../_lib/firebaseAdmin");
const {
  assertAdmin,
  resolveEstadoTurno,
  extraerGabineteIdsDesdeServicio,
} = require("./adminTurnosShared");

exports.reprogramarTurnoAdmin = onCall({ region: "us-central1" }, async (request) => {
  assertAdmin(request);

  const {
    turnoId,
    fecha,
    horaInicio,
    horaFin,
    motivoReprogramacion = "reprogramacion_admin",
    modoAsignacion = "balanceado",
  } = request.data || {};

  if (!turnoId || !fecha || horaInicio == null || horaFin == null) {
    throw new HttpsError("invalid-argument", "Datos incompletos");
  }

  const inicioNum = Number(horaInicio);
  const finNum = Number(horaFin);

  if (!Number.isFinite(inicioNum) || !Number.isFinite(finNum) || finNum <= inicioNum) {
    throw new HttpsError("invalid-argument", "Rango horario inválido");
  }

  const db = getAdmin().firestore();
  const turnoRef = db.collection("turnos").doc(turnoId);

  return db.runTransaction(async (tx) => {
    const turnoSnap = await tx.get(turnoRef);
    if (!turnoSnap.exists) {
      throw new HttpsError("not-found", "Turno no encontrado");
    }

    const turno = turnoSnap.data() || {};
    const estadoTurno = resolveEstadoTurno(turno);

    if (["cancelado", "rechazado", "finalizado", "ausente"].includes(estadoTurno)) {
      throw new HttpsError(
        "failed-precondition",
        `No se puede reprogramar un turno en estado ${estadoTurno}`,
      );
    }

    if (!turno.servicioId) {
      throw new HttpsError("failed-precondition", "El turno no tiene servicio asociado");
    }

    const servicioRef = db.collection("servicios").doc(turno.servicioId);
    const servicioSnap = await tx.get(servicioRef);
    if (!servicioSnap.exists) {
      throw new HttpsError("not-found", "Servicio no encontrado");
    }

    const servicio = servicioSnap.data() || {};
    const idsValidos = extraerGabineteIdsDesdeServicio(servicio);
    if (!idsValidos.length) {
      throw new HttpsError("failed-precondition", "El servicio no tiene gabinetes configurados");
    }

    const gabineteDocs = await Promise.all(
      idsValidos.map((id) => tx.get(db.collection("gabinetes").doc(id))),
    );

    const gabinetes = gabineteDocs
      .filter((snap) => snap.exists)
      .map((snap) => ({ id: snap.id, ...snap.data() }))
      .filter((g) => g.activo !== false);

    if (!gabinetes.length) {
      throw new HttpsError("failed-precondition", "Sin gabinetes activos");
    }

    const turnosSnap = await tx.get(
      db.collection("turnos").where("fecha", "==", fecha),
    );

    const ahora = Date.now();

    const turnosActivos = turnosSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((t) => t.id !== turnoId)
      .filter((t) => ["pendiente", "pendiente_aprobacion", "confirmado"].includes(resolveEstadoTurno(t)))
      .filter((t) => !t.venceEn || Number(t.venceEn) > ahora);

    const candidatos = gabinetes.filter((g) => {
      return !turnosActivos.some((t) => (
        t.gabineteId === g.id &&
        inicioNum < Number(t.horaFin) &&
        finNum > Number(t.horaInicio)
      ));
    });

    if (!candidatos.length) {
      throw new HttpsError("failed-precondition", "Horario ocupado");
    }

    let gabineteElegido;

    if (modoAsignacion === "prioridad") {
      gabineteElegido = candidatos.sort(
        (a, b) => (a.prioridad ?? 999) - (b.prioridad ?? 999),
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
      nombreGabinete: gabineteElegido.nombreGabinete || gabineteElegido.nombre || "",
      reprogramado: true,
      reprogramadoAt: FieldValue.serverTimestamp(),
      reprogramadoEn: FieldValue.serverTimestamp(),
      reprogramadoPor: "admin",
      motivoReprogramacion,
      reprogramacionesCount: FieldValue.increment(1),
      ultimaFechaAnterior: turno.fecha || null,
      ultimaHoraInicioAnterior: Number(turno.horaInicio || 0) || null,
      ultimaHoraFinAnterior: Number(turno.horaFin || 0) || null,
      ultimoGabineteIdAnterior: turno.gabineteId || null,
      ultimoNombreGabineteAnterior: turno.nombreGabinete || null,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: request.auth.uid,
    });

    return {
      ok: true,
      turnoId,
      fecha,
      horaInicio: inicioNum,
      horaFin: finNum,
      gabineteAsignado: gabineteElegido.id,
    };
  });
});

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getAdmin } = require("../_lib/firebaseAdmin");
const { FieldValue } = require("firebase-admin/firestore");

const HORA_REPROGRAMACION_MINIMA = 48;
const MAX_REPROGRAMACIONES_CLIENTE = 1;

function getMaxReprogramacionesCliente(reservasConfig = {}) {
  return Math.max(
    0,
    Number(
      reservasConfig?.maxReprogramacionesUsuario ?? MAX_REPROGRAMACIONES_CLIENTE,
    ),
  );
}

function resolveEstadoTurno(turno = {}) {
  if (turno?.estadoTurno) return turno.estadoTurno;

  switch (turno?.estado) {
    case "pendiente_pago_mp":
      return "pendiente";
    case "pendiente_aprobacion":
      return "pendiente_aprobacion";
    case "senado":
    case "señado":
    case "confirmado":
      return "confirmado";
    case "cancelado":
      return "cancelado";
    case "rechazado":
      return "rechazado";
    case "perdido":
      return "perdido";
    case "finalizado":
      return "finalizado";
    case "expirado":
    case "vencido":
      return "vencido";
    default:
      return "pendiente";
  }
}

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

function puedeReprogramarTurno(turno, reservasConfig = {}) {
  if (!turno) return false;
  if (reservasConfig?.permitirReprogramacionUsuario === false) return false;

  const maxReprogramaciones = getMaxReprogramacionesCliente(reservasConfig);
  if (maxReprogramaciones < 1) return false;

  const estadoTurno = resolveEstadoTurno(turno);
  if (["cancelado", "rechazado", "perdido", "finalizado", "ausente"].includes(estadoTurno)) {
    return false;
  }

  const start = Number(turno?.horaInicio || 0);
  if (!start) return false;

  const diffH = (start - Date.now()) / 3600000;
  if (diffH < HORA_REPROGRAMACION_MINIMA) return false;

  const count = Number(turno?.reprogramacionesCount || 0);
  return count < maxReprogramaciones;
}

function buildReprogramacionErrorMessage(reservasConfig = {}) {
  const maxReprogramaciones = getMaxReprogramacionesCliente(reservasConfig);
  if (reservasConfig?.permitirReprogramacionUsuario === false) {
    return "La reprogramacion por parte del usuario esta desactivada";
  }

  return `Solo podes reprogramar con al menos ${HORA_REPROGRAMACION_MINIMA} horas de anticipacion y hasta ${maxReprogramaciones} ${maxReprogramaciones === 1 ? "vez" : "veces"}`;
}

function estaDentroVentanaAgenda(servicio, fechaIso) {
  const maxDias = Math.max(1, Number(servicio?.agendaMaxDias || 7));
  const diasVentana = maxDias <= 1 ? 90 : maxDias;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const fecha = new Date(`${fechaIso}T00:00:00`);
  fecha.setHours(0, 0, 0, 0);

  const fechaAgendaDesde =
    typeof servicio?.agendaDisponibleDesde === "string" &&
    servicio.agendaDisponibleDesde !== "null" &&
    servicio.agendaDisponibleDesde !== "undefined" &&
    /^\d{4}-\d{2}-\d{2}$/.test(servicio.agendaDisponibleDesde)
      ? new Date(`${servicio.agendaDisponibleDesde}T00:00:00`)
      : null;

  if (fechaAgendaDesde) {
    fechaAgendaDesde.setHours(0, 0, 0, 0);
    if (fecha < fechaAgendaDesde) return false;
  }

  const limite = new Date(hoy);
  limite.setDate(limite.getDate() + (diasVentana - 1));

  if (servicio?.agendaTipo === "mensual") {
    const mesBaseOffset =
      servicio?.agendaMensualModo === "mes_siguiente" ? 1 : 0;
    const mesHasta = servicio?.agendaMensualRepiteMesSiguiente
      ? mesBaseOffset + 2
      : mesBaseOffset + 1;
    const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + mesHasta, 0);
    finMes.setHours(0, 0, 0, 0);

    if (finMes < limite) {
      limite.setTime(finMes.getTime());
    }
  }

  return fecha >= hoy && fecha <= limite;
}

function getDiaConfig(servicio, fechaIso) {
  if (servicio?.agendaTipo === "mensual") {
    const fecha = new Date(`${fechaIso}T00:00:00`);
    const diaMes = fecha.getDate();
    const agendaMensual = Array.isArray(servicio?.agendaMensual)
      ? servicio.agendaMensual
      : [];

    return (
      agendaMensual.find(
        (item) => Number(item?.diaMes) === Number(diaMes),
      ) || null
    );
  }

  const fecha = new Date(`${fechaIso}T00:00:00`);
  const diaSemana = fecha.getDay();

  if (
    !Array.isArray(servicio?.horariosServicio) ||
    !servicio.horariosServicio.length
  ) {
    return null;
  }

  return (
    servicio.horariosServicio.find(
      (item) => Number(item?.diaSemana) === Number(diaSemana),
    ) || null
  );
}

function formatHourLocal(timestamp) {
  return new Date(Number(timestamp)).toLocaleTimeString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function horarioPermitidoPorServicio(servicio, fechaIso, inicioMs, finMs) {
  const configDia = getDiaConfig(servicio, fechaIso);
  if (!configDia) return true;
  if (!configDia.activo) return false;

  const inicioHora = formatHourLocal(inicioMs);
  const finHora = formatHourLocal(finMs);
  const franjas = Array.isArray(configDia.franjas) ? configDia.franjas : [];

  return franjas.some((franja) => {
    if (!franja?.desde || !franja?.hasta) return false;
    return inicioHora >= franja.desde && finHora <= franja.hasta;
  });
}

exports.reprogramarTurnoInteligente = onCall(
  { region: "us-central1" },
  async (request) => {
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

    if (!Number.isFinite(inicioNum) || !Number.isFinite(finNum) || finNum <= inicioNum) {
      throw new HttpsError("invalid-argument", "Rango horario invalido");
    }

    if (inicioNum <= Date.now()) {
      throw new HttpsError("failed-precondition", "No se pueden reservar horarios pasados");
    }

    const db = getAdmin().firestore();
    const clienteId = request.auth.uid;
    const turnoRef = db.collection("turnos").doc(turnoId);
    const reservasConfigSnap = await db.collection("configuracion").doc("reservas").get();
    const reservasConfig = reservasConfigSnap.exists ? reservasConfigSnap.data() || {} : {};

    const turnoSnap = await turnoRef.get();
    if (!turnoSnap.exists) {
      throw new HttpsError("not-found", "Turno no encontrado");
    }

    const turnoActual = turnoSnap.data() || {};
    if ((turnoActual.clienteId || turnoActual.usuarioId) !== clienteId) {
      throw new HttpsError("permission-denied", "No autorizado");
    }

    if (!puedeReprogramarTurno(turnoActual, reservasConfig)) {
      throw new HttpsError(
        "failed-precondition",
        buildReprogramacionErrorMessage(reservasConfig),
      );
    }

    if (!turnoActual.servicioId) {
      throw new HttpsError("failed-precondition", "El turno no tiene servicio asociado");
    }

    const servicioSnap = await db.collection("servicios").doc(turnoActual.servicioId).get();
    if (!servicioSnap.exists) {
      throw new HttpsError("not-found", "Servicio no encontrado");
    }

    const servicio = servicioSnap.data() || {};
    const idsValidos = extraerGabineteIdsDesdeServicio(servicio);

    if (!idsValidos.length) {
      throw new HttpsError("failed-precondition", "El servicio no tiene gabinetes configurados");
    }

    if (!estaDentroVentanaAgenda(servicio, fecha)) {
      throw new HttpsError(
        "failed-precondition",
        "La fecha elegida esta fuera de la ventana de agenda del servicio",
      );
    }

    if (!horarioPermitidoPorServicio(servicio, fecha, inicioNum, finNum)) {
      throw new HttpsError(
        "failed-precondition",
        "El horario elegido no esta disponible segun la agenda del servicio",
      );
    }

    return db.runTransaction(async (tx) => {
      const turnoTxSnap = await tx.get(turnoRef);
      if (!turnoTxSnap.exists) {
        throw new HttpsError("not-found", "Turno no encontrado");
      }

      const turnoTx = turnoTxSnap.data() || {};
      if ((turnoTx.clienteId || turnoTx.usuarioId) !== clienteId) {
        throw new HttpsError("permission-denied", "No autorizado");
      }

      if (!puedeReprogramarTurno(turnoTx, reservasConfig)) {
        throw new HttpsError(
          "failed-precondition",
          buildReprogramacionErrorMessage(reservasConfig),
        );
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
        .filter((t) =>
          ["pendiente", "pendiente_aprobacion", "confirmado"].includes(resolveEstadoTurno(t)),
        )
        .filter((t) => !t.venceEn || Number(t.venceEn) > ahora);

      const conflictoServicio = turnosActivos.some((t) => (
        t.servicioId === turnoTx.servicioId &&
        inicioNum < Number(t.horaFin) &&
        finNum > Number(t.horaInicio)
      ));

      if (conflictoServicio) {
        throw new HttpsError("failed-precondition", "Horario ocupado");
      }

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
        reprogramadoPor: "cliente",
        motivoReprogramacion: "reprogramacion_cliente",
        reprogramacionesCount: FieldValue.increment(1),
        ultimaFechaAnterior: turnoTx.fecha || null,
        ultimaHoraInicioAnterior: Number(turnoTx.horaInicio || 0) || null,
        ultimaHoraFinAnterior: Number(turnoTx.horaFin || 0) || null,
        ultimoGabineteIdAnterior: turnoTx.gabineteId || null,
        ultimoNombreGabineteAnterior: turnoTx.nombreGabinete || null,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: clienteId,
      });

      return {
        ok: true,
        turnoId,
        gabineteAsignado: gabineteElegido.id,
        nombreGabinete: gabineteElegido.nombreGabinete || gabineteElegido.nombre || "",
        fecha,
        horaInicio: inicioNum,
        horaFin: finNum,
        reprogramacionesCount: Number(turnoTx.reprogramacionesCount || 0) + 1,
      };
    });
  },
);

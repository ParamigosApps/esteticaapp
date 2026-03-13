// --------------------------------------------------
// functions/turnos/crearTurnoInteligente.js
// --------------------------------------------------
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getAdmin } = require("../_lib/firebaseAdmin");
const { buildTurnoBaseCompat } = require("./turnoSchema");
const { calcularMontosTurno } = require("../config/comisiones");

const MAX_TURNOS_SIN_CONFIRMAR_SIN_TURNOS_CONFIRMADOS = 2;

function normalizarEstadoTurno(turno = {}) {
  if (turno.estadoTurno) return turno.estadoTurno;

  switch (turno.estado) {
    case "pendiente_pago_mp":
      return "pendiente";
    case "pendiente_aprobacion":
      return "pendiente_aprobacion";
    case "señado":
      return "confirmado";
    case "confirmado":
      return "confirmado";
    case "cancelado":
      return "cancelado";
    case "perdido":
      return "perdido";
    case "finalizado":
      return "finalizado";
    case "rechazado":
      return "rechazado";
    case "expirado":
      return "cancelado";
    default:
      return "pendiente";
  }
}

function esTurnoActivoYBloqueante(turno, ahora) {
  const estadoTurno = normalizarEstadoTurno(turno);

  if (!["pendiente", "pendiente_aprobacion", "confirmado"].includes(estadoTurno)) {
    return false;
  }

  // si tiene vencimiento y ya venció, no debe bloquear
  if (estadoTurno !== "confirmado" && turno.venceEn && Number(turno.venceEn) <= ahora) {
    return false;
  }

  return true;
}

function puedeContarParaLimiteCliente(turno, ahora) {
  if (!esTurnoActivoYBloqueante(turno, ahora)) return false;

  const inicio = Number(turno?.horaInicio || 0);
  if (Number.isFinite(inicio) && inicio > 0 && inicio < ahora) {
    return false;
  }

  return true;
}


function toISODateEnZona(date, timeZone = "America/Argentina/Buenos_Aires") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function sumarDiasISO(fechaISO, dias) {
  const [y, m, d] = String(fechaISO).split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

function getLimiteReservableMs(servicio) {
  const agendaMaxDias = Math.max(1, Number(servicio?.agendaMaxDias || 7));
  return Date.now() + agendaMaxDias * 24 * 60 * 60 * 1000;
}

function obtenerDiaSemanaISO(fechaISO) {
  const [y, m, d] = String(fechaISO).split("-").map(Number);
  if (!y || !m || !d) return null;

  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}

function horaTextoAMinutos(hora) {
  if (typeof hora !== "string" || !hora.includes(":")) return null;
  const [h, m] = hora.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function obtenerMinutosEnZona(ms, timeZone = "America/Argentina/Buenos_Aires") {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(Number(ms)));

  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function getReservasConfigDefault() {
  return {
    bloquearTurnosMananaSin12h: false,
  };
}

function cumpleReglaAnticipacionManana(
  inicioMs,
  reservasConfig = getReservasConfigDefault(),
) {
  if (!reservasConfig?.bloquearTurnosMananaSin12h) return true;

  const minutos = obtenerMinutosEnZona(inicioMs);
  const hour = Number.isFinite(minutos) ? Math.floor(minutos / 60) : null;

  if (hour == null || hour >= 12) return true;

  return Number(inicioMs) - Date.now() >= 12 * 60 * 60 * 1000;
}

function turnoDentroDeHorarioServicio(servicio, fechaISO, inicioMs, finMs) {
  if (!Array.isArray(servicio.horariosServicio) || !servicio.horariosServicio.length) {
    return true;
  }

  const diaSemana = obtenerDiaSemanaISO(fechaISO);
  if (diaSemana == null) return false;

  const configDia = servicio.horariosServicio.find(
    (h) => Number(h?.diaSemana) === Number(diaSemana),
  );

  if (!configDia?.activo) return false;

  const franjas = Array.isArray(configDia.franjas) ? configDia.franjas : [];
  if (!franjas.length) return false;

  const inicioMin = obtenerMinutosEnZona(inicioMs);
  const finMin = obtenerMinutosEnZona(finMs);

  if (!Number.isFinite(inicioMin) || !Number.isFinite(finMin)) return false;

  return franjas.some((f) => {
    const desde = horaTextoAMinutos(f?.desde);
    const hasta = horaTextoAMinutos(f?.hasta);

    return (
      Number.isFinite(desde) &&
      Number.isFinite(hasta) &&
      inicioMin >= desde &&
      finMin <= hasta
    );
  });
}

exports.crearTurnoInteligente = onCall(
  { region: "us-central1" },
  async (request) => {
    console.log("=== crearTurnoInteligente INPUT ===");
    console.log("UID:", request.auth?.uid);
    console.log("DATA:", JSON.stringify(request.data));

    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "No autenticado");
    }

const {
  servicioId,
  gabineteIds,
  fecha,
  horaInicio,
  horaFin,
  modoAsignacion,
  origenSolicitud = "web",
  metodoPagoSolicitado = null,
} = request.data || {};

    if (!servicioId || !fecha || horaInicio == null || horaFin == null) {
      throw new HttpsError("invalid-argument", "Datos incompletos");
    }

    if (!Array.isArray(gabineteIds)) {
      throw new HttpsError("invalid-argument", "gabineteIds debe ser array");
    }

    const idsValidos = gabineteIds.filter(
      (id) => typeof id === "string" && id.trim() !== ""
    );

    if (!idsValidos.length) {
      throw new HttpsError("invalid-argument", "gabineteIds inválidos");
    }

    if (idsValidos.length > 10) {
      throw new HttpsError("invalid-argument", "Máximo 10 gabinetes");
    }

    const db = getAdmin().firestore();
    const clienteId = request.auth.uid;

    const clienteSnap = await db.collection("usuarios").doc(clienteId).get();

    let nombreCliente = null;
    let telefonoCliente = null;
    let emailCliente = request.auth.token?.email || null;

    if (clienteSnap.exists) {
      const cliente = clienteSnap.data() || {};
      nombreCliente = cliente.nombre || cliente.nombreCompleto || null;
      telefonoCliente =
        cliente.telefono ||
        cliente.phone ||
        cliente.celular ||
        null;
      emailCliente = cliente.email || request.auth.token?.email || null;
    }

    // ============================================
    // 🔎 SERVICIO
    // ============================================
    const servicioSnap = await db.collection("servicios").doc(servicioId).get();

    if (!servicioSnap.exists) {
      throw new HttpsError("not-found", "Servicio no encontrado");
    }

    const servicio = servicioSnap.data() || {};
    const modoReserva = servicio.modoReserva || "automatico";
    const reservasConfigSnap = await db
      .collection("configuracion")
      .doc("reservas")
      .get();
    const reservasConfig = reservasConfigSnap.exists
      ? { ...getReservasConfigDefault(), ...reservasConfigSnap.data() }
      : getReservasConfigDefault();

    const pedirAnticipoServicio = Boolean(servicio.pedirAnticipo);
    const tipoAnticipo = servicio.tipoAnticipo || "online"; // online | manual
    const porcentajeAnticipo = Number(servicio.porcentajeAnticipo || 0);

    const nombreServicioFinal =
      servicio.nombreServicio ||
      servicio.nombre ||
      "Servicio";

    const agendaMaxDias = Math.max(1, Number(servicio.agendaMaxDias || 7));
    const hoyISO = toISODateEnZona(new Date());

    if (fecha < hoyISO) {
      throw new HttpsError(
        "failed-precondition",
        "No se pueden reservar turnos en fechas pasadas",
      );
    }

    return await db.runTransaction(async (tx) => {
      const inicioNum = Number(horaInicio);
      const finNum = Number(horaFin);

      if (Number.isNaN(inicioNum) || Number.isNaN(finNum)) {
        throw new HttpsError("invalid-argument", "Horario inválido");
      }

       if (finNum <= inicioNum) {
    throw new HttpsError("invalid-argument", "Rango horario inválido");
  }

    if (!cumpleReglaAnticipacionManana(inicioNum, reservasConfig)) {
      throw new HttpsError(
        "failed-precondition",
        "Los turnos antes de las 12:00 requieren al menos 12 horas de anticipacion",
      );
    }

    const ahoraMs = Date.now();
    const limiteReservableMs = getLimiteReservableMs(servicio);

    if (inicioNum <= ahoraMs) {
      throw new HttpsError(
        "failed-precondition",
        "No se pueden reservar horarios pasados"
      );
    }

    if (inicioNum > limiteReservableMs) {
      throw new HttpsError(
        "failed-precondition",
        `Este servicio solo permite reservar hasta ${agendaMaxDias} dias de anticipacion`,
      );
    }

    if (!turnoDentroDeHorarioServicio(servicio, fecha, inicioNum, finNum)) {
      throw new HttpsError(
        "failed-precondition",
        "El horario seleccionado no está disponible para este servicio",
      );
    }
      
      // 1️⃣ Traer gabinetes activos
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

      console.log("Gabinetes válidos:", gabinetes.map((g) => g.id));

      // 2️⃣ Traer turnos del día
      const turnosSnap = await tx.get(
        db.collection("turnos").where("fecha", "==", fecha)
      );

      const ahora = Date.now();

      const turnosActivos = turnosSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((t) => esTurnoActivoYBloqueante(t, ahora));

      const turnosClienteSnap = await tx.get(
        db.collection("turnos").where("clienteId", "==", clienteId)
      );

      const turnosClienteActivos = turnosClienteSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((t) => puedeContarParaLimiteCliente(t, ahora));

      const turnosClienteConfirmados = turnosClienteActivos.filter(
        (t) => normalizarEstadoTurno(t) === "confirmado"
      );

      const turnosClienteSinConfirmar = turnosClienteActivos.filter((t) =>
        ["pendiente", "pendiente_aprobacion"].includes(normalizarEstadoTurno(t))
      );

      if (
        turnosClienteConfirmados.length === 0 &&
        turnosClienteSinConfirmar.length >=
          MAX_TURNOS_SIN_CONFIRMAR_SIN_TURNOS_CONFIRMADOS
      ) {
        throw new HttpsError(
          "failed-precondition",
          `Alcanaste el limite de ${MAX_TURNOS_SIN_CONFIRMAR_SIN_TURNOS_CONFIRMADOS} solicitudes activas sin turnos confirmados. Espera una confirmacion antes de reservar otro turno.`,
        );
      }

      console.log("Turnos activos encontrados:", turnosActivos.length);
      console.log("Intentando reservar:", {
        fecha,
        horaInicio: inicioNum,
        horaFin: finNum,
      });

      // ============================================
      // 🔒 SERVICIO EXCLUSIVO POR HORARIO
      // ============================================
      const conflictoServicio = turnosActivos.some((t) =>
        t.servicioId === servicioId &&
        inicioNum < Number(t.horaFin) &&
        finNum > Number(t.horaInicio)
      );

      if (conflictoServicio) {
        throw new HttpsError("failed-precondition", "Horario ocupado");
      }

      const candidatos = gabinetes.filter((g) => {
        const solapado = turnosActivos.some((t) => {
          const conflicto =
            t.gabineteId === g.id &&
            inicioNum < Number(t.horaFin) &&
            finNum > Number(t.horaInicio);

          if (conflicto) {
            console.log("⚠️ Conflicto detectado:", {
              gabinete: g.id,
              turnoExistente: t.id,
            });
          }

          return conflicto;
        });

        return !solapado;
      });

      console.log("Candidatos finales:", candidatos.map((g) => g.id));

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

      // ============================================
      // 📌 ESTADOS INICIALES
      // ============================================
      const pricing = calcularMontosTurno({
        precioServicio: Number(servicio.precio || 0),
        porcentajeAnticipo: pedirAnticipoServicio ? porcentajeAnticipo : 0,
        cobrarComision: true,
      });

      const montoServicio = pricing.precioServicio;
      const comisionTurno = pricing.comisionTurno;
      const montoAnticipoServicio = pricing.montoAnticipoServicio;
      const montoAnticipoCalculado = pricing.montoAnticipoTotal;
      const montoTotal = pricing.montoTotal;
      const requiereAnticipo = montoAnticipoCalculado > 0;

      let estadoTurnoInicial;
      let estadoPagoInicial;
      let venceTurno = null;

      let metodoPagoEsperado = "sin_pago";

      if (montoTotal > 0) {
        if (tipoAnticipo === "online") {
          metodoPagoEsperado = "mercadopago";
        } else if (tipoAnticipo === "manual") {
          metodoPagoEsperado = "manual";
        }
      }

      if (metodoPagoSolicitado === "mercadopago") {
        metodoPagoEsperado = "mercadopago";
      }

      if (metodoPagoSolicitado === "manual") {
        metodoPagoEsperado = "manual";
      }

      if (modoReserva === "reserva") {
        estadoTurnoInicial = "pendiente_aprobacion";
        estadoPagoInicial = montoTotal > 0 ? "pendiente" : "abonado";
        venceTurno = Date.now() + 24 * 60 * 60 * 1000;
      } else {
        if (requiereAnticipo) {
          estadoTurnoInicial = "pendiente";
          estadoPagoInicial = "pendiente";
          venceTurno = Date.now() + 60 * 60 * 1000;
        } else {
          estadoTurnoInicial = "confirmado";
          estadoPagoInicial = montoTotal > 0 ? "pendiente" : "abonado";
        }
      }

      const montoPagado = 0;
      const saldoPendiente = Math.max(0, montoTotal - montoPagado);

      const ref = db.collection("turnos").doc();

      tx.set(ref, {
        ...buildTurnoBaseCompat({
          clienteId,
          nombreCliente,
          telefonoCliente,
          emailCliente,
          servicioId,
          nombreServicio: nombreServicioFinal,
          profesionalId: servicio.profesionalId || null,
          profesionalNombre: servicio.nombreProfesional || null,
          responsableGestion: servicio.responsableGestion || "admin",
          gabineteId: gabineteElegido.id,
          nombreGabinete:
            gabineteElegido.nombreGabinete || gabineteElegido.nombre || "",
          fecha,
          horaInicio: inicioNum,
          horaFin: finNum,
          estadoTurno: estadoTurnoInicial,
          estadoPago: estadoPagoInicial,
          origenTurno: origenSolicitud,
          metodoPagoEsperado,
          metodoPagoUsado: null,
          requiereAnticipo,
          tipoAnticipo,
          montoServicio,
          comisionTurno,
          montoAnticipoServicio,
          montoAnticipo: montoAnticipoCalculado,
          montoTotal,
          montoPagado,
          saldoPendiente,
          venceEn: venceTurno,
        }),
        recordatorio24Enviado: false,
        recordatorio24Procesando: false,
      });

      return {
        ok: true,
        turnoId: ref.id,
        gabineteAsignado: gabineteElegido.id,
        estadoTurnoInicial,
        estadoPagoInicial,
        venceEn: venceTurno,
      };
    });
  }
);

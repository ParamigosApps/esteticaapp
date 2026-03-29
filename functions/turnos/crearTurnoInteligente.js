// --------------------------------------------------
// functions/turnos/crearTurnoInteligente.js
// --------------------------------------------------
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getAdmin } = require("../_lib/firebaseAdmin");
const { buildTurnoBaseCompat } = require("./turnoSchema");
const { calcularMontosTurno } = require("../config/comisiones");
const { WHATSAPP_TOKEN, enviarWhatsApp } = require("./whatsapp");

const MAX_TURNOS_SIN_CONFIRMAR_SIN_TURNOS_CONFIRMADOS = 8;
const AGENDA_24HS_FALLBACK_DIAS = 90;
const RESERVA_PAGO_MP_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutos

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

function getLimiteMensualReservableMs(servicio) {
  const hoy = new Date();
  const mesBaseOffset =
    servicio?.agendaMensualModo === "mes_siguiente" ? 1 : 0;
  const mesHasta = servicio?.agendaMensualRepiteMesSiguiente
    ? mesBaseOffset + 2
    : mesBaseOffset + 1;
  const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + mesHasta, 0);
  finMes.setHours(23, 59, 59, 999);
  return finMes.getTime();
}

function getLimiteReservableMs(servicio) {
  if (servicio?.agendaTipo === "mensual") {
    return getLimiteMensualReservableMs(servicio);
  }

  const agendaMaxDias = Math.max(1, Number(servicio?.agendaMaxDias || 7));
  const diasVentana =
    agendaMaxDias <= 1 ? AGENDA_24HS_FALLBACK_DIAS : agendaMaxDias;
  return Date.now() + diasVentana * 24 * 60 * 60 * 1000;
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

function franjaValida(franja) {
  return (
    franja &&
    typeof franja.desde === "string" &&
    typeof franja.hasta === "string" &&
    franja.desde < franja.hasta
  );
}

function mayorHora(a, b) {
  return String(a || "") >= String(b || "") ? a : b;
}

function menorHora(a, b) {
  return String(a || "") <= String(b || "") ? a : b;
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

function obtenerFechaEnZona(fechaISO, timeZone = "America/Argentina/Buenos_Aires") {
  const [y, m, d] = String(fechaISO).split("-").map(Number);
  if (!y || !m || !d) return null;

  const utcDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const zonedISO = toISODateEnZona(utcDate, timeZone);
  const [zy, zm, zd] = zonedISO.split("-").map(Number);
  return new Date(zy, zm - 1, zd);
}

function obtenerFranjasMensualesDelDia(servicio, fecha, rangoCompleto) {
  const hoy = new Date();
  const mesBaseOffset =
    servicio?.agendaMensualModo === "mes_siguiente" ? 1 : 0;
  const mesesPermitidos = [mesBaseOffset];

  if (Boolean(servicio?.agendaMensualRepiteMesSiguiente)) {
    mesesPermitidos.push(mesBaseOffset + 1);
  }

  const coincideMesPermitido = mesesPermitidos.some((offset) => {
    const mesPermitido = new Date(
      hoy.getFullYear(),
      hoy.getMonth() + offset,
      1,
    );

    return (
      fecha.getFullYear() === mesPermitido.getFullYear() &&
      fecha.getMonth() === mesPermitido.getMonth()
    );
  });

  if (!coincideMesPermitido) return [];

  const diaMes = fecha.getDate();
  const agendaMensual = Array.isArray(servicio?.agendaMensual)
    ? servicio.agendaMensual
    : [];

  const configDia = agendaMensual.find(
    (item) => Number(item?.diaMes) === Number(diaMes),
  );

  if (!configDia?.activo) return [];

  const franjasMensuales = Array.isArray(configDia.franjas)
    ? configDia.franjas.filter(franjaValida)
    : [];

  if (!franjasMensuales.length) return [];

  return franjasMensuales.map((franja) => ({
    desde: mayorHora(rangoCompleto.desde, franja.desde),
    hasta: menorHora(rangoCompleto.hasta, franja.hasta),
  }));
}

function obtenerFranjasSemanalesDelDia(servicio, diaSemana, rangoCompleto) {
  let franjasFinales = [
    {
      desde: rangoCompleto.desde,
      hasta: rangoCompleto.hasta,
    },
  ];

  if (Array.isArray(servicio.horariosServicio) && servicio.horariosServicio.length) {
    const configDia = servicio.horariosServicio.find(
      (h) => Number(h?.diaSemana) === Number(diaSemana),
    );

    if (!configDia?.activo) return [];

    const franjasServicio = Array.isArray(configDia.franjas)
      ? configDia.franjas.filter(franjaValida)
      : [];

    if (!franjasServicio.length) return [];

    franjasFinales = franjasServicio.map((franja) => ({
      desde: mayorHora(rangoCompleto.desde, franja.desde),
      hasta: menorHora(rangoCompleto.hasta, franja.hasta),
    }));
  }

  return franjasFinales;
}

function obtenerFranjasServicioDelDia(servicio, fecha) {
  const diaSemana = fecha.getDay();
  const agendaTipo = servicio?.agendaTipo === "mensual" ? "mensual" : "semanal";
  const rangoCompleto = { desde: "00:00", hasta: "23:59" };

  let franjasFinales =
    agendaTipo === "mensual"
      ? obtenerFranjasMensualesDelDia(servicio, fecha, rangoCompleto)
      : obtenerFranjasSemanalesDelDia(servicio, diaSemana, rangoCompleto);

  const restriccion = servicio?.restricciones?.find(
    (r) => Number(r?.dia) === Number(diaSemana),
  );

  if (restriccion) {
    franjasFinales = franjasFinales.map((franja) => ({
      desde: restriccion.desde
        ? mayorHora(franja.desde, restriccion.desde)
        : franja.desde,
      hasta: restriccion.hasta
        ? menorHora(franja.hasta, restriccion.hasta)
        : franja.hasta,
    }));
  }

  return franjasFinales.filter(franjaValida);
}

function getReservasConfigDefault() {
  return {
    bloquearTurnosMananaSin12h: false,
    whatsappHabilitado: false,
    enviarWhatsappPendienteTest: false,
    horaRecordatorioWhatsapp: "10:00",
    whatsappCodigoPais: "54",
    whatsappPhoneNumberId: "",
    whatsappTemplateIdioma: "es_AR",
    whatsappTemplateSolicitud: "",
    whatsappTemplateConfirmacion: "confirmacion_turno",
    whatsappTemplateRecordatorio: "",
  };
}

function formatHora(ms) {
  return new Date(Number(ms)).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

function formatFecha(fechaISO) {
  const [y, m, d] = String(fechaISO).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).toLocaleDateString(
    "es-AR",
    {
      weekday: "long",
      day: "2-digit",
      month: "long",
      timeZone: "America/Argentina/Buenos_Aires",
    },
  );
}

function buildMensajeSolicitud({
  estadoTurnoInicial,
  nombreServicioFinal,
  fecha,
  horaInicio,
}) {
  if (estadoTurnoInicial === "confirmado") {
    return [
      "Tu turno fue confirmado.",
      `Servicio: ${nombreServicioFinal}.`,
      `Fecha: ${formatFecha(fecha)}.`,
      `Hora: ${formatHora(horaInicio)}.`,
    ].join(" ");
  }

  return [
    "Recibimos tu solicitud y tu turno quedo pendiente.",
    `Servicio: ${nombreServicioFinal}.`,
    `Fecha: ${formatFecha(fecha)}.`,
    `Hora: ${formatHora(horaInicio)}.`,
    "Te vamos a avisar por este medio cuando quede confirmado.",
  ].join(" ");
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
  const fecha = obtenerFechaEnZona(fechaISO);
  if (!fecha) return false;

  const franjas = obtenerFranjasServicioDelDia(servicio, fecha);
  if (!franjas.length) return true;

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

function normalizarDiasNoLaborables(items = []) {
  if (!Array.isArray(items)) return [];

  const vistos = new Set();
  const resultado = [];

  items.forEach((item) => {
    const fecha =
      typeof item === "string"
        ? item.trim()
        : String(item?.fecha || "").trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return;
    if (vistos.has(fecha)) return;

    vistos.add(fecha);
    resultado.push(fecha);
  });

  return resultado;
}

function esDiaNoLaborable(fechaISO, diasNoLaborables = []) {
  return normalizarDiasNoLaborables(diasNoLaborables).includes(
    String(fechaISO || "").trim(),
  );
}

exports.crearTurnoInteligente = onCall(
  { region: "us-central1", secrets: [WHATSAPP_TOKEN] },
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
  precioVariableItemsSeleccionados = [],
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
    const diasVentanaAgenda =
      agendaMaxDias <= 1 ? AGENDA_24HS_FALLBACK_DIAS : agendaMaxDias;
    const hoyISO = toISODateEnZona(new Date());

    if (fecha < hoyISO) {
      throw new HttpsError(
        "failed-precondition",
        "No se pueden reservar turnos en fechas pasadas",
      );
    }

    if (
      typeof servicio?.agendaDisponibleDesde === "string" &&
      servicio.agendaDisponibleDesde !== "null" &&
      servicio.agendaDisponibleDesde !== "undefined" &&
      /^\d{4}-\d{2}-\d{2}$/.test(servicio.agendaDisponibleDesde) &&
      fecha < servicio.agendaDisponibleDesde
    ) {
      throw new HttpsError(
        "failed-precondition",
        `Este servicio habilita agenda a partir del ${servicio.agendaDisponibleDesde}`,
      );
    }

    const horariosConfigSnap = await db
      .collection("configuracion")
      .doc("horarios")
      .get();
    const diasNoLaborables = horariosConfigSnap.exists
      ? horariosConfigSnap.data()?.diasNoLaborables || []
      : [];

    if (esDiaNoLaborable(fecha, diasNoLaborables)) {
      throw new HttpsError(
        "failed-precondition",
        "El dia seleccionado esta marcado como no laborable",
      );
    }

    const resultado = await db.runTransaction(async (tx) => {
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
      const limiteTexto = new Date(Number(limiteReservableMs)).toLocaleDateString(
        "es-AR",
      );
      throw new HttpsError(
        "failed-precondition",
        servicio?.agendaTipo === "mensual"
          ? `Este servicio solo permite reservar hasta el ${limiteTexto}`
          : `Este servicio solo permite reservar hasta ${diasVentanaAgenda} dias de anticipacion`,
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
          `Alcanzaste el limite de ${MAX_TURNOS_SIN_CONFIRMAR_SIN_TURNOS_CONFIRMADOS} solicitudes activas sin turnos confirmados. Espera una confirmacion antes de reservar otro turno.`,
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
      const itemsDisponibles = Array.isArray(servicio.itemsPrecioVariable)
        ? servicio.itemsPrecioVariable.filter(
            (item) =>
              item &&
              item.activo !== false &&
              String(item.nombre || "").trim() &&
              Number(item.monto || 0) > 0,
          )
        : [];

      const nombresSolicitados = Array.isArray(precioVariableItemsSeleccionados)
        ? precioVariableItemsSeleccionados
            .map((item) => String(item?.nombre || "").trim())
            .filter(Boolean)
        : [];
      const nombresSolicitadosUnicos = [...new Set(nombresSolicitados)];

      if (
        servicio?.precioVariableModo === "single" &&
        nombresSolicitadosUnicos.length > 1
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Este servicio solo permite seleccionar un adicional",
        );
      }

      const itemsVariableSeleccionados = itemsDisponibles.filter((item) =>
        nombresSolicitadosUnicos.includes(String(item.nombre || "").trim()),
      );

      const ajusteServicio = itemsVariableSeleccionados.reduce(
        (acc, item) => acc + Math.max(0, Number(item?.monto || 0)),
        0,
      );

      const pricing = calcularMontosTurno({
        precioServicio: Number(servicio.precio || 0),
        ajusteServicio,
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
          venceTurno = Date.now() + RESERVA_PAGO_MP_TIMEOUT_MS;
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
          precioVariable: Boolean(servicio.precioVariable),
          itemsPrecioVariable: itemsVariableSeleccionados.map((item) => ({
            nombre: String(item.nombre || "").trim(),
            monto: Math.max(0, Number(item.monto || 0)),
          })),
          montoExtraServicio: ajusteServicio,
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

    if (
      resultado?.turnoId &&
      telefonoCliente &&
      reservasConfig.whatsappHabilitado
    ) {
      try {
        const ubicacionSnap = await db
          .collection("configuracion")
          .doc("ubicacion")
          .get();
        const ubicacion = ubicacionSnap.exists ? ubicacionSnap.data() || {} : {};
        const horarioTurno =
          horaFin != null
            ? `${formatHora(horaInicio)} - ${formatHora(horaFin)}`
            : formatHora(horaInicio);

        await enviarWhatsApp({
          telefono: telefonoCliente,
          phoneNumberId: reservasConfig.whatsappPhoneNumberId,
          templateName:
            String(
              reservasConfig.whatsappTemplateConfirmacion ||
                "confirmacion_turno",
            ).trim() || "confirmacion_turno",
          languageCode: reservasConfig.whatsappTemplateIdioma,
          bodyParameters: [
            nombreCliente || "Cliente",
            nombreServicioFinal,
            formatFecha(fecha),
            horarioTurno,
            servicio.nombreProfesional || "Profesional",
            ubicacion.mapsDireccion || "Sin dirección",
          ],
          countryCode: reservasConfig.whatsappCodigoPais,
        });

        await db.collection("turnos").doc(resultado.turnoId).update({
          whatsappConfirmacionEnviadaAt:
            getAdmin().firestore.FieldValue.serverTimestamp(),
          whatsappConfirmacionTelefonoUsado: telefonoCliente,
          whatsappConfirmacionTemplate:
            String(
              reservasConfig.whatsappTemplateConfirmacion ||
                "confirmacion_turno",
            ).trim() || "confirmacion_turno",
        });
      } catch (error) {
        console.error("No se pudo enviar WhatsApp de confirmacion", error);
      }
    }

    return resultado;
  }
);

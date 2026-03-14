import { mayorHora, menorHora } from "./timeUtils";

function toISODateLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function franjaValida(franja) {
  return (
    franja &&
    typeof franja.desde === "string" &&
    typeof franja.hasta === "string" &&
    franja.desde < franja.hasta
  );
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function parseISODateLocal(value) {
  const text = String(value || "").trim();
  if (!text || text === "null" || text === "undefined") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;

  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function mismaFecha(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function obtenerFranjasMensualesDelDia(servicio, fecha, rangoGabinete) {
  const hoy = new Date();
  const mesBaseOffset =
    servicio?.agendaMensualModo === "mes_siguiente" ? 1 : 0;
  const mesesPermitidos = [mesBaseOffset];

  if (Boolean(servicio?.agendaMensualRepiteMesSiguiente)) {
    mesesPermitidos.push(mesBaseOffset + 1);
  }

  const coincideMesPermitido = mesesPermitidos.some((offset) => {
    const mesPermitido = new Date(hoy.getFullYear(), hoy.getMonth() + offset, 1);
    return (
      fecha.getFullYear() === mesPermitido.getFullYear() &&
      fecha.getMonth() === mesPermitido.getMonth()
    );
  });

  if (!coincideMesPermitido) {
    return [];
  }

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
    desde: mayorHora(rangoGabinete.desde, franja.desde),
    hasta: menorHora(rangoGabinete.hasta, franja.hasta),
  }));
}

function obtenerFranjasSemanalesDelDia(servicio, diaSemana, rangoGabinete) {
  let franjasFinales = [
    {
      desde: rangoGabinete.desde,
      hasta: rangoGabinete.hasta,
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
      desde: mayorHora(rangoGabinete.desde, franja.desde),
      hasta: menorHora(rangoGabinete.hasta, franja.hasta),
    }));
  }

  return franjasFinales;
}

function obtenerFranjasServicioDelDia(servicio, fecha, rangoGabinete) {
  const diaSemana = fecha.getDay();
  const diaMes = fecha.getDate();
  const agendaTipo = servicio?.agendaTipo === "mensual" ? "mensual" : "semanal";

  let franjasFinales =
    agendaTipo === "mensual"
      ? obtenerFranjasMensualesDelDia(servicio, fecha, rangoGabinete)
      : obtenerFranjasSemanalesDelDia(servicio, diaSemana, rangoGabinete);

  const restriccion = servicio.restricciones?.find(
    (r) => Number(r.dia) === Number(diaSemana),
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

export function generarSlotsDia(agenda, servicio, fecha = new Date()) {
  if (!agenda || !servicio) return [];

  const fechaAgendaDesde = parseISODateLocal(servicio?.agendaDisponibleDesde);
  if (fechaAgendaDesde && startOfDay(fecha) < fechaAgendaDesde) return [];

  const duracionMin = Number(servicio.duracionMin);
  if (!duracionMin || duracionMin <= 0) return [];

  const duracionMs = duracionMin * 60000;
  const slots = [];

  const dia = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const diaSemana = dia.getDay();
  const fechaSlot = toISODateLocal(dia);

  const rangosDelDia = (agenda.horarios || []).filter(
    (h) => Number(h.diaSemana) === diaSemana,
  );

  if (!rangosDelDia.length) return [];

  for (const rango of rangosDelDia) {
    if (!rango.desde || !rango.hasta) continue;

    const franjasDisponibles = obtenerFranjasServicioDelDia(servicio, dia, rango);

    if (!franjasDisponibles.length) continue;

    for (const franja of franjasDisponibles) {
      const [dH, dM] = franja.desde.split(":").map(Number);
      const [hH, hM] = franja.hasta.split(":").map(Number);

      const desdeMin = dH * 60 + dM;
      const hastaMin = hH * 60 + hM;

      if (desdeMin >= hastaMin) continue;
      if ([dH, dM, hH, hM].some((n) => Number.isNaN(n))) continue;

      let cursor = new Date(dia);
      cursor.setHours(dH, dM, 0, 0);

      const cierre = new Date(dia);
      cierre.setHours(hH, hM, 0, 0);

      while (cursor.getTime() + duracionMs <= cierre.getTime()) {
        const inicio = cursor.getTime();
        const fin = inicio + duracionMs;

        const ocupadoPorTurno = (agenda.turnos || []).some((t) => {
          if (!t || !t.fecha) return false;
          if (t.fecha !== fechaSlot) return false;
          if (t.gabineteId !== rango.gabineteId) return false;

          const inicioTurno = Number(t.horaInicio);
          const finTurno = Number(t.horaFin);

          if (!Number.isFinite(inicioTurno) || !Number.isFinite(finTurno)) {
            return false;
          }

          return inicio < finTurno && fin > inicioTurno;
        });

        const ocupadoPorBloqueo = (agenda.bloqueos || []).some((b) => {
          if (!b || !b.desde || !b.hasta) return false;

          return (
            b.gabineteId === rango.gabineteId &&
            inicio < Number(b.hasta) &&
            fin > Number(b.desde)
          );
        });

        slots.push({
          inicio,
          fin,
          gabineteId: rango.gabineteId,
          ocupado: Boolean(ocupadoPorTurno || ocupadoPorBloqueo),
        });

        cursor = new Date(cursor.getTime() + duracionMs);
      }
    }
  }

  const agrupados = {};

  for (const slot of slots) {
    const key = slot.inicio;

    if (!agrupados[key]) {
      agrupados[key] = {
        inicio: slot.inicio,
        fin: slot.fin,
        disponibles: 0,
        total: 0,
      };
    }

    agrupados[key].total += 1;

    if (!slot.ocupado) {
      agrupados[key].disponibles += 1;
    }
  }

  const esHoy = fechaSlot === toISODateLocal(new Date());
    const ahoraMs = Date.now();

    return Object.values(agrupados)
      .map((g) => {
        const ocupadoPorMismoServicio = (agenda.turnos || []).some((t) => {
          if (!t || !t.fecha) return false;
          if (t.fecha !== fechaSlot) return false;
          if (t.servicioId !== servicio.id) return false;

          const inicioTurno = Number(t.horaInicio);
          const finTurno = Number(t.horaFin);

          if (!Number.isFinite(inicioTurno) || !Number.isFinite(finTurno)) {
            return false;
          }

          return g.inicio < finTurno && g.fin > inicioTurno;
        });

        const sinGabinetesDisponibles = g.disponibles === 0;
        const horarioPasadoDeHoy = esHoy && g.inicio <= ahoraMs;

        return {
          inicio: g.inicio,
          fin: g.fin,
          ocupado:
            ocupadoPorMismoServicio ||
            sinGabinetesDisponibles ||
            horarioPasadoDeHoy,
        };
      })
      .sort((a, b) => a.inicio - b.inicio);
}

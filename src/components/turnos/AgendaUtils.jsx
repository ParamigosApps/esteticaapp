export function generarSlotsDia(agenda, servicio, fecha = new Date()) {
  if (!agenda || !servicio) return [];

  const duracionMin = Number(servicio.duracionMin);
  if (!duracionMin || duracionMin <= 0) return [];

  const duracionMs = duracionMin * 60000;
  const slots = [];

  const dia = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const diaSemana = dia.getDay();

  const rangosDelDia = (agenda.horarios || []).filter(
    (h) => Number(h.diaSemana) === diaSemana,
  );

  if (!rangosDelDia.length) return [];

  for (const rango of rangosDelDia) {
    if (!rango.desde || !rango.hasta) continue;

    let desdeFinal = rango.desde;
    let hastaFinal = rango.hasta;

    const restriccion = servicio.restricciones?.find(
      (r) => Number(r.dia) === diaSemana,
    );

    if (restriccion) {
      if (restriccion.desde)
        desdeFinal = mayorHora(desdeFinal, restriccion.desde);
      if (restriccion.hasta)
        hastaFinal = menorHora(hastaFinal, restriccion.hasta);
    }

    const [dH, dM] = desdeFinal.split(":").map(Number);
    const [hH, hM] = hastaFinal.split(":").map(Number);

    const desdeMin = dH * 60 + dM;
    const hastaMin = hH * 60 + hM;

    if (desdeMin >= hastaMin) continue;

    const [hA, mA] = desdeFinal.split(":").map(Number);
    const [hC, mC] = hastaFinal.split(":").map(Number);

    if (isNaN(hA) || isNaN(hC)) continue;

    let cursor = new Date(dia);
    cursor.setHours(hA, mA, 0, 0);

    const cierre = new Date(dia);
    cierre.setHours(hC, mC, 0, 0);

    while (
      !isNaN(duracionMs) &&
      cursor.getTime() + duracionMs <= cierre.getTime()
    ) {
      const inicio = cursor.getTime();
      const fin = inicio + duracionMs;

      const ocupadoPorTurno = (agenda.turnos || []).some((t) => {
        if (!t || !t.fecha) return false;

        const fechaSlot = dia.toISOString().slice(0, 10);
        if (t.fecha !== fechaSlot) return false;

        if (t.gabineteId !== rango.gabineteId) return false;

        const inicioTurno = Number(t.horaInicio);
        const finTurno = Number(t.horaFin);

        if (!Number.isFinite(inicioTurno) || !Number.isFinite(finTurno))
          return false;
        return inicio < finTurno && fin > inicioTurno;
      });

      const ocupadoPorBloqueo = (agenda.bloqueos || []).some((b) => {
        if (!b || !b.desde || !b.hasta) return false;
        return (
          b.gabineteId === rango.gabineteId && inicio < b.hasta && fin > b.desde
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

  return Object.values(agrupados)
    .map((g) => {
      const fechaSlot = dia.toISOString().slice(0, 10);

      // 🔒 1️⃣ Exclusividad por servicio
      const ocupadoPorMismoServicio = (agenda.turnos || []).some((t) => {
        if (!t || !t.fecha) return false;
        if (t.fecha !== fechaSlot) return false;
        if (t.servicioId !== servicio.id) return false;

        const inicioTurno = Number(t.horaInicio);
        const finTurno = Number(t.horaFin);

        if (!Number.isFinite(inicioTurno) || !Number.isFinite(finTurno))
          return false;

        return g.inicio < finTurno && g.fin > inicioTurno;
      });

      // 🔓 2️⃣ Disponibilidad real de gabinetes
      const sinGabinetesDisponibles = g.disponibles === 0;

      return {
        inicio: g.inicio,
        fin: g.fin,
        ocupado: ocupadoPorMismoServicio || sinGabinetesDisponibles,
      };
    })
    .sort((a, b) => a.inicio - b.inicio);
}

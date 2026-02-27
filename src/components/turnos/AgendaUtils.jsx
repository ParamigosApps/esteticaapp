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

    if (desdeFinal >= hastaFinal) continue;

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
        if (!t || !t.inicio || !t.fin) return false;
        return (
          t.gabineteId === rango.gabineteId && inicio < t.fin && fin > t.inicio
        );
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

  // 🔥 Agrupar por inicio (hora)
  const agrupados = {};

  for (const slot of slots) {
    const key = slot.inicio;

    if (!agrupados[key]) {
      agrupados[key] = {
        inicio: slot.inicio,
        fin: slot.fin,
        ocupado: true, // asumimos ocupado hasta probar lo contrario
      };
    }

    // Si alguno está libre, el horario es libre
    if (!slot.ocupado) {
      agrupados[key].ocupado = false;
    }
  }

  return Object.values(agrupados).sort((a, b) => a.inicio - b.inicio);
}

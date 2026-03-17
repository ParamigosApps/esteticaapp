export function getEstadoTurno(t) {
  if (t?.estadoTurno) return t.estadoTurno;

  switch (t?.estado) {
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

export function esTurnoRechazadoOVencido(t) {
  const estadoTurnoRaw = String(t?.estadoTurno || t?.estado || "").toLowerCase();
  const estadoPagoRaw = String(t?.estadoPago || "").toLowerCase();

  return (
    estadoTurnoRaw === "rechazado" ||
    estadoTurnoRaw === "vencido" ||
    estadoTurnoRaw === "expirado" ||
    estadoPagoRaw === "rechazado" ||
    estadoPagoRaw === "expirado"
  );
}

export function getEstadoPago(t) {
  if (t?.estadoPago) return t.estadoPago;

  switch (t?.estado) {
    case "pendiente_pago":
    case "pendiente_pago_mp":
      return "pendiente";
    case "pendiente_aprobacion":
      return "pendiente_aprobacion";
    case "señado":
      return "parcial";
    case "confirmado": {
      const total = Number(t?.montoTotal ?? t?.precioTotal ?? t?.total ?? 0);
      const pagado = Number(t?.montoPagado ?? t?.pagadoTotal ?? 0);

      if (total > 0 && pagado > 0 && pagado < total) return "parcial";
      if (total > 0 && pagado >= total) return "abonado";
      return total > 0 ? "pendiente" : "abonado";
    }
    case "rechazado":
      return "rechazado";
    case "vencido":
    case "expirado":
      return "expirado";
    default:
      return "pendiente";
  }
}

export function getMontoAValidarPago(t) {
  const total = Number(t?.montoTotal ?? t?.precioTotal ?? t?.total ?? 0);

  const anticipo = Number(
    t?.montoAnticipo ?? t?.montoSena ?? t?.seña ?? t?.sena ?? 0,
  );

  const pagado = Number(t?.montoPagado ?? t?.pagadoTotal ?? 0);

  if (pagado > 0) return pagado;
  if (anticipo > 0 && anticipo < total) return anticipo;

  return total;
}

export function getMetodoPagoEsperado(t) {
  return t?.metodoPagoEsperado || t?.metodoPago || "manual";
}

export function formatearDuracion(inicio, fin) {
  const minutos = Math.round((Number(fin) - Number(inicio)) / 60000);

  if (minutos >= 60) {
    const horas = Math.floor(minutos / 60);
    const resto = minutos % 60;
    return resto > 0 ? `${horas}h ${resto}m` : `${horas}h`;
  }

  return `${minutos} min`;
}

export function formatearHora(timestamp) {
  if (!timestamp) return "-";

  return new Date(Number(timestamp)).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatearFecha(fechaISO) {
  if (!fechaISO) return "-";

  const [year, month, day] = fechaISO.split("-");
  return `${day}/${month}/${year}`;
}


export function puedeCancelarTurno(estadoTurno) {
  return !["cancelado", "realizado", "ausente"].includes(estadoTurno);
}

function yaPasoElTurno(turno) {
  const referencia = Number(turno?.horaFin || turno?.horaInicio || 0);
  if (!referencia) return false;
  return referencia <= Date.now();
}

export function puedeMarcarRealizado(turno, estadoTurno) {
  return ["confirmado"].includes(estadoTurno) && yaPasoElTurno(turno);
}

export function puedeMarcarAusente(turno, estadoTurno) {
  return ["confirmado"].includes(estadoTurno) && yaPasoElTurno(turno);
}

export function puedeReprogramarTurno(estadoTurno) {
  return !["cancelado", "realizado"].includes(estadoTurno);
}

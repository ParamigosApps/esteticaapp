// src/config/comisiones.js

export const COMISION_DEFAULT_ENTRADA = 1
export const COMISION_DEFAULT_CATALOGO = 0
export const COMISION_FIJA_TURNO = 300

// --------------------------------------------------
// ENTRADAS
// --------------------------------------------------
export function obtenerComisionEntrada({ evento, lote } = {}) {
  if (Number.isFinite(evento?.comisionPorEntrada)) {
    return Number(evento.comisionPorEntrada)
  }

  if (Number.isFinite(lote?.comisionPorEntrada)) {
    return Number(lote.comisionPorEntrada)
  }

  return COMISION_DEFAULT_ENTRADA
}

// --------------------------------------------------
// COMPRAS / CATALOGO
// --------------------------------------------------
export function obtenerComisionCatalogo() {
  return COMISION_DEFAULT_CATALOGO
}

// --------------------------------------------------
// TURNOS
// --------------------------------------------------
export function obtenerComisionTurno() {
  return COMISION_FIJA_TURNO
}

export function calcularMontosTurno({
  precioServicio = 0,
  ajusteServicio = 0,
  porcentajeAnticipo = 0,
  cobrarComision = true,
} = {}) {
  const precioBase =
    Math.max(0, Number(precioServicio || 0)) +
    Math.max(0, Number(ajusteServicio || 0))
  const porcentaje = Math.max(0, Number(porcentajeAnticipo || 0))
  const comision = cobrarComision ? obtenerComisionTurno() : 0

  const montoAnticipoServicio =
    precioBase > 0 && porcentaje > 0
      ? Math.round((precioBase * porcentaje) / 100)
      : 0

  return {
    precioServicio: precioBase,
    comisionTurno: comision,
    montoAnticipoServicio,
    montoAnticipoTotal: montoAnticipoServicio + comision,
    montoTotal: precioBase + comision,
    saldoServicioPendiente: Math.max(0, precioBase - montoAnticipoServicio),
  }
}

export function normalizarMontosTurno(turno = {}) {
  const montoServicio = Math.max(
    0,
    Number(turno.montoServicio ?? turno.precioServicio ?? turno.precio ?? 0),
  )
  const comisionTurno = Math.max(
    0,
    Number(turno.comisionTurno ?? turno.montoComision ?? 0),
  )
  const montoAnticipoServicio = Math.max(
    0,
    Number(turno.montoAnticipoServicio ?? 0),
  )
  const montoAnticipo = Math.max(
    0,
    Number(turno.montoAnticipo ?? turno.senaRequerida ?? montoAnticipoServicio + comisionTurno),
  )
  const montoTotal = Math.max(
    0,
    Number(turno.montoTotal ?? turno.precioTotal ?? montoServicio + comisionTurno),
  )
  const montoPagado = Math.max(0, Number(turno.montoPagado ?? 0))

  return {
    montoServicio,
    comisionTurno,
    montoAnticipoServicio,
    montoAnticipo,
    montoTotal,
    montoPagado,
  }
}

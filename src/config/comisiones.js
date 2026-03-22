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

export function parseAmount(value) {
  if (Number.isFinite(value)) return Number(value)

  const raw = String(value ?? '').trim()
  if (!raw) return 0

  const cleaned = raw.replace(/\s+/g, '').replace(/[$]/g, '')
  const hasDot = cleaned.includes('.')
  const hasComma = cleaned.includes(',')

  if (hasDot && hasComma) {
    const lastDot = cleaned.lastIndexOf('.')
    const lastComma = cleaned.lastIndexOf(',')
    const decimalSep = lastDot > lastComma ? '.' : ','
    const thousandsSep = decimalSep === '.' ? ',' : '.'
    const normalized = cleaned
      .replace(new RegExp(`\\${thousandsSep}`, 'g'), '')
      .replace(decimalSep, '.')
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : 0
  }

  if (hasDot) {
    if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
      const parsed = Number(cleaned.replace(/\./g, ''))
      return Number.isFinite(parsed) ? parsed : 0
    }
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : 0
  }

  if (hasComma) {
    if (/^\d{1,3}(,\d{3})+$/.test(cleaned)) {
      const parsed = Number(cleaned.replace(/,/g, ''))
      return Number.isFinite(parsed) ? parsed : 0
    }
    const parsed = Number(cleaned.replace(/,/g, '.'))
    return Number.isFinite(parsed) ? parsed : 0
  }

  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

export function calcularMontosTurno({
  precioServicio = 0,
  ajusteServicio = 0,
  porcentajeAnticipo = 0,
  cobrarComision = true,
} = {}) {
  const precioBase =
    Math.max(0, parseAmount(precioServicio)) +
    Math.max(0, parseAmount(ajusteServicio))
  const porcentaje = Math.max(0, Number(porcentajeAnticipo || 0))

  const montoAnticipoServicio =
    precioBase > 0 && porcentaje > 0
      ? Math.round((precioBase * porcentaje) / 100)
      : 0
  const comision = cobrarComision && precioBase > 0 ? obtenerComisionTurno() : 0

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
    parseAmount(turno.montoServicio ?? turno.precioServicio ?? turno.precio ?? 0),
  )
  const comisionTurno = Math.max(
    0,
    parseAmount(turno.comisionTurno ?? turno.montoComision ?? 0),
  )
  const montoAnticipoServicio = Math.max(
    0,
    parseAmount(turno.montoAnticipoServicio ?? 0),
  )
  const montoAnticipo = Math.max(
    0,
    parseAmount(turno.montoAnticipo ?? turno.senaRequerida ?? montoAnticipoServicio + comisionTurno),
  )
  const montoTotal = Math.max(
    0,
    parseAmount(turno.montoTotal ?? turno.precioTotal ?? montoServicio + comisionTurno),
  )
  const montoPagado = Math.max(0, parseAmount(turno.montoPagado ?? 0))

  return {
    montoServicio,
    comisionTurno,
    montoAnticipoServicio,
    montoAnticipo,
    montoTotal,
    montoPagado,
  }
}

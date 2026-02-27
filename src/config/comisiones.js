// src/config/comisiones.js

export const COMISION_DEFAULT_ENTRADA = 1
export const COMISION_DEFAULT_CATALOGO = 0

// --------------------------------------------------
// ENTRADAS
// --------------------------------------------------
export function obtenerComisionEntrada({ evento, lote } = {}) {
  // prioridad: evento > lote > default
  if (Number.isFinite(evento?.comisionPorEntrada)) {
    return Number(evento.comisionPorEntrada)
  }

  if (Number.isFinite(lote?.comisionPorEntrada)) {
    return Number(lote.comisionPorEntrada)
  }

  return COMISION_DEFAULT_ENTRADA
}

// --------------------------------------------------
// COMPRAS / CATÁLOGO
// --------------------------------------------------
export function obtenerComisionCatalogo() {
  // hoy no se cobra, mañana solo cambia este valor
  return COMISION_DEFAULT_CATALOGO
}

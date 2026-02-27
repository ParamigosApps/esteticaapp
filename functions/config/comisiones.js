// functions/config/comisiones.js

const COMISION_DEFAULT_ENTRADA = 1
const COMISION_DEFAULT_CATALOGO = 0

function obtenerComisionCatalogo() {
  return COMISION_DEFAULT_CATALOGO
}

function obtenerComisionEntrada({ evento, lote } = {}) {
  if (Number.isFinite(evento?.comisionPorEntrada)) {
    return Number(evento.comisionPorEntrada)
  }

  if (Number.isFinite(lote?.comisionPorEntrada)) {
    return Number(lote.comisionPorEntrada)
  }

  return COMISION_DEFAULT_ENTRADA
}

module.exports = {
  COMISION_DEFAULT_ENTRADA,
  COMISION_DEFAULT_CATALOGO,
  obtenerComisionCatalogo,
  obtenerComisionEntrada,
}

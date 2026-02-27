function formatearFecha(fecha = new Date()) {
  try {
    let d = fecha

    if (typeof fecha?.toDate === 'function') {
      d = fecha.toDate()
    } else if (!(fecha instanceof Date)) {
      d = new Date(fecha)
    }

    if (isNaN(d.getTime())) return '—'

    const dia = String(d.getDate()).padStart(2, '0')
    const mes = String(d.getMonth() + 1).padStart(2, '0')
    const anio = d.getFullYear()
    const horas = String(d.getHours()).padStart(2, '0')
    const mins = String(d.getMinutes()).padStart(2, '0')

    return `${dia}/${mes}/${anio}, ${horas}:${mins}HS`
  } catch {
    return '—'
  }
}
function formatearSoloFecha(fecha = new Date()) {
  try {
    let d = fecha

    if (typeof fecha?.toDate === 'function') {
      d = fecha.toDate()
    } else if (!(fecha instanceof Date)) {
      d = new Date(fecha)
    }

    if (isNaN(d.getTime())) return '—'

    const dia = String(d.getDate()).padStart(2, '0')
    const mes = String(d.getMonth() + 1).padStart(2, '0')
    const anio = d.getFullYear()

    return `${dia}/${mes}/${anio}`
  } catch {
    return '—'
  }
}
module.exports = { formatearFecha }

// --------------------------------------------------------------
// src/utils/utils.js
// --------------------------------------------------------------
import Toastify from 'toastify-js'
// Formatea una fecha a: "23/11/2025, 07:35HS"

export function formatearFecha(fecha) {
  if (!fecha) return '—'

  let d = null

  // 🔥 Firestore Timestamp
  if (typeof fecha?.toDate === 'function') {
    d = fecha.toDate()

    // 📅 Date nativo
  } else if (fecha instanceof Date) {
    d = fecha

    // ⏱ seconds Firestore plano
  } else if (typeof fecha?.seconds === 'number') {
    d = new Date(fecha.seconds * 1000)

    // 📦 string / number
  } else {
    d = new Date(fecha)
  }

  if (!d || isNaN(d.getTime())) return '—'

  const dia = String(d.getDate()).padStart(2, '0')
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const año = d.getFullYear()

  const horas = String(d.getHours()).padStart(2, '0')
  const mins = String(d.getMinutes()).padStart(2, '0')

  return `${dia}/${mes}/${año}, ${horas}:${mins}HS`
}
export function formatearSoloFecha(valor) {
  if (!valor) return '—'

  let fecha = null

  // 1️⃣ Firestore Timestamp
  if (typeof valor?.toDate === 'function') {
    fecha = valor.toDate()

    // 2️⃣ Date nativo
  } else if (valor instanceof Date) {
    fecha = valor

    // 3️⃣ Número (timestamp en ms)
  } else if (typeof valor === 'number') {
    fecha = new Date(valor)

    // 4️⃣ String (ISO, yyyy-mm-dd, timestamp string)
  } else if (typeof valor === 'string') {
    const num = Number(valor)
    fecha = !isNaN(num) ? new Date(num) : new Date(valor)
  }

  // ❌ Fecha inválida
  if (!fecha || isNaN(fecha.getTime())) return '—'

  const dia = String(fecha.getDate()).padStart(2, '0')
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  const año = fecha.getFullYear()

  return `${dia}/${mes}/${año}`
}

// Fecha evento legible: "Martes 30 de Diciembre 2025 - 20:30 hs."
export function formatearFechaEventoDescriptiva(
  fechaInicio,
  horaInicio = null
) {
  if (!fechaInicio) return '—'

  let fecha = null

  // Firestore Timestamp
  if (typeof fechaInicio?.toDate === 'function') {
    fecha = fechaInicio.toDate()
  } else if (fechaInicio instanceof Date) {
    fecha = fechaInicio
  } else {
    fecha = new Date(fechaInicio)
  }

  if (!fecha || isNaN(fecha.getTime())) return '—'

  // Fecha larga en español
  const fechaTexto = fecha.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  // Hora
  let horaTexto = ''
  if (horaInicio) {
    horaTexto = ` - ${horaInicio} hs.`
  } else {
    const h = fecha.getHours()
    const m = fecha.getMinutes()
    if (h || m) {
      horaTexto = ` - ${String(h).padStart(2, '0')}:${String(m).padStart(
        2,
        '0'
      )} hs`
    }
  }

  // Capitalizar primera letra
  const capitalizada = fechaTexto.charAt(0).toUpperCase() + fechaTexto.slice(1)

  return capitalizada + horaTexto
}

// Fecha exacta de compra
export function obtenerFechaCompra() {
  return formatearFecha(new Date())
}

export function normalizarPrecio(valor) {
  if (typeof valor === 'number') return valor

  if (typeof valor === 'string') {
    const limpio = valor
      .replace(/\$/g, '')
      .replace(/\./g, '')
      .replace(/,/g, '')
      .trim()

    const num = Number(limpio)
    return Number.isFinite(num) ? num : 0
  }

  return 0
}

export const format = n => n.toLocaleString('es-AR')

export function abrirLoginGlobal() {
  document.dispatchEvent(new CustomEvent('abrir-login', { detail: 'forced' }))
}

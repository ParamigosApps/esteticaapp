// =====================================================
// timeUtils.js
// Utilidades puras para manejo de horas y minutos
// =====================================================

/**
 * Genera minutos según intervalo (default 5)
 * Ej: generarMinutos(5) → [0,5,10,...55]
 */
export function generarMinutos(step = 5) {
  const arr = [];
  for (let i = 0; i < 60; i += step) {
    arr.push(i);
  }
  return arr;
}

/**
 * Formatea hora/minuto a string HH:MM
 */
export function formatearHora(hora, minuto) {
  return `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
}

/**
 * Convierte "HH:MM" a minutos absolutos
 * Ej: "09:30" → 570
 */
export function horaAminutos(horaStr) {
  const [h, m] = horaStr.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Verifica si una hora es válida
 */
export function esRangoValido(desde, hasta) {
  return horaAminutos(desde) < horaAminutos(hasta);
}
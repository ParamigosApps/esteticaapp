// =====================================================
// scheduleUtils.js
// Lógica de negocio para horarios
// =====================================================

import { horaAminutos } from "./timeUtils";

/**
 * Verifica si hay solapamiento entre horarios
 */
export function haySolape(horarios, nuevo) {
  return horarios.some((h) => {
    if (h.dia !== nuevo.dia) return false;

    const a1 = horaAminutos(h.desde);
    const a2 = horaAminutos(h.hasta);
    const b1 = horaAminutos(nuevo.desde);
    const b2 = horaAminutos(nuevo.hasta);

    return !(b2 <= a1 || b1 >= a2);
  });
}

/**
 * Ordena horarios por día y hora
 */
export function ordenarHorarios(horarios) {
  return [...horarios].sort((a, b) => {
    if (a.dia !== b.dia) return a.dia - b.dia;
    return horaAminutos(a.desde) - horaAminutos(b.desde);
  });
}
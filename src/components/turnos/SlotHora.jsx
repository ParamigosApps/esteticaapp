// --------------------------------------------------
// src/components/turnos/SlotHora.jsx
// --------------------------------------------------

export default function SlotHora({ slot, slotSeleccionado, onClick }) {
  const hora = new Date(slot.inicio).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const isSelected = slotSeleccionado?.horaInicio === slot.inicio;
  return (
    <button
      className={`slot 
    ${slot.ocupado ? "ocupado" : "libre"} 
    ${isSelected ? "selected" : ""}
  `}
      disabled={slot.ocupado}
      onClick={() => onClick?.(slot)}
    >
      {hora}
    </button>
  );
}

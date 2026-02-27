// --------------------------------------------------
// src/components/turnos/SlotHora.jsx
// --------------------------------------------------

export default function SlotHora({ slot, onClick }) {
  const hora = new Date(slot.inicio).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <button
      className={`slot ${slot.ocupado ? "ocupado" : "libre"}`}
      disabled={slot.ocupado}
      onClick={() => onClick?.(slot)}
    >
      {hora}
    </button>
  );
}

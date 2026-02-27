import { useState } from "react";
import {
  generarMinutos,
  formatearHora,
  esRangoValido,
} from "../../utils/timeUtils";

export default function TimeRangeSelector({ onAdd, showDay = true }) {
  const [dia, setDia] = useState(1);
  const [desdeHora, setDesdeHora] = useState(9);
  const [desdeMin, setDesdeMin] = useState(0);
  const [hastaHora, setHastaHora] = useState(18);
  const [hastaMin, setHastaMin] = useState(0);

  function handleAdd() {
    const desde = formatearHora(desdeHora, desdeMin);
    const hasta = formatearHora(hastaHora, hastaMin);

    if (!esRangoValido(desde, hasta)) return;

    onAdd({ dia, desde, hasta });
  }

  return (
    <div className="admin-row" style={{ gap: 20, alignItems: "center" }}>
      {showDay && (
        <select value={dia} onChange={(e) => setDia(Number(e.target.value))}>
          {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((d, i) => (
            <option key={i} value={i}>
              {d}
            </option>
          ))}
        </select>
      )}

      {/* DESDE */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <strong>Desde:</strong>
        <select
          value={desdeHora}
          onChange={(e) => setDesdeHora(Number(e.target.value))}
        >
          {[...Array(24)].map((_, h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, "0")}
            </option>
          ))}
        </select>
        :
        <select
          value={desdeMin}
          onChange={(e) => setDesdeMin(Number(e.target.value))}
        >
          {generarMinutos().map((m) => (
            <option key={m} value={m}>
              {String(m).padStart(2, "0")}
            </option>
          ))}
        </select>
      </div>

      {/* HASTA */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <strong>Hasta:</strong>
        <select
          value={hastaHora}
          onChange={(e) => setHastaHora(Number(e.target.value))}
        >
          {[...Array(24)].map((_, h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, "0")}
            </option>
          ))}
        </select>
        :
        <select
          value={hastaMin}
          onChange={(e) => setHastaMin(Number(e.target.value))}
        >
          {generarMinutos().map((m) => (
            <option key={m} value={m}>
              {String(m).padStart(2, "0")}
            </option>
          ))}
        </select>
      </div>

      <button className="admin-button secondary" onClick={handleAdd}>
        Agregar
      </button>
    </div>
  );
}

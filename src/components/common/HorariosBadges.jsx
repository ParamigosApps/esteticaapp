// --------------------------------------------------
// HorariosBadges.jsx — Estilo Gabinetes (Pills)
// --------------------------------------------------

export default function HorariosBadges({
  horarios = [],
  diaKey = "dia",
  onDelete,
}) {
  if (!horarios?.length) return null;

  const dias = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

  const ordenados = [...horarios].sort((a, b) => {
    const dA = Number(a[diaKey] ?? 0);
    const dB = Number(b[diaKey] ?? 0);

    if (dA !== dB) return dA - dB;
    return String(a.desde ?? "").localeCompare(String(b.desde ?? ""));
  });

  return (
    <div className="schedule-badges">
      {ordenados.map((h, i) => {
        const diaIndex = Number(h[diaKey]);

        return (
          <div key={h.id ?? i} className="schedule-pill">
            <span>
              {dias[diaIndex] ?? "?"} {h.desde}-{h.hasta}
            </span>

            {onDelete && (
              <button className="pill-delete" onClick={() => onDelete(h, i)}>
                ×
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

import { useEffect, useState, useMemo } from "react";
import { db } from "../../Firebase";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  query,
  orderBy,
} from "firebase/firestore";

export default function TurnosAdminPanel() {
  const [turnos, setTurnos] = useState([]);
  const [clientes, setClientes] = useState({});
  const [gabinetes, setGabinetes] = useState({});
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [fechaFiltro, setFechaFiltro] = useState("");

  // ==============================
  // TURNOS
  // ==============================
  useEffect(() => {
    const q = query(
      collection(db, "turnos"),
      orderBy("fecha", "asc"), // primero por fecha
      orderBy("horaInicio", "asc"), // después por hora
    );

    return onSnapshot(q, (snap) => {
      setTurnos(
        snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })),
      );
    });
  }, []);

  // ==============================
  // CLIENTES
  // ==============================
  useEffect(() => {
    return onSnapshot(collection(db, "clientes"), (snap) => {
      const map = {};
      snap.docs.forEach((d) => {
        map[d.id] = d.data();
      });
      setClientes(map);
    });
  }, []);

  // ==============================
  // GABINETES
  // ==============================
  useEffect(() => {
    return onSnapshot(collection(db, "gabinetes"), (snap) => {
      const map = {};
      snap.docs.forEach((d) => {
        map[d.id] = d.data();
      });
      setGabinetes(map);
    });
  }, []);

  function formatearDuracion(inicio, fin) {
    const minutos = Math.round((fin - inicio) / 60000);

    if (minutos >= 60) {
      const horas = Math.floor(minutos / 60);
      const resto = minutos % 60;
      return resto > 0 ? `${horas}h ${resto}m` : `${horas}h`;
    }

    return `${minutos} min`;
  }

  function formatearHora(timestamp) {
    if (!timestamp) return "-";

    return new Date(Number(timestamp)).toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatearFecha(fechaISO) {
    if (!fechaISO) return "-";

    const [year, month, day] = fechaISO.split("-");
    return `${day}/${month}/${year}`;
  }
  // ==============================
  // FILTROS
  // ==============================
  const turnosFiltrados = useMemo(() => {
    return turnos.filter((t) => {
      if (filtroEstado !== "todos" && t.estado !== filtroEstado) return false;

      if (fechaFiltro && t.fecha !== fechaFiltro) return false;

      return true;
    });
  }, [turnos, filtroEstado, fechaFiltro]);

  // ==============================
  // ACCIONES
  // ==============================
  async function aprobarTurno(turnoId) {
    await updateDoc(doc(db, "turnos", turnoId), {
      estado: "confirmado",
      aprobadoEn: serverTimestamp(),
      venceEn: null,
    });
  }

  async function rechazarTurno(turnoId) {
    await updateDoc(doc(db, "turnos", turnoId), {
      estado: "rechazado",
      rechazadoEn: serverTimestamp(),
      venceEn: null,
    });
  }

  // ==============================
  // UI
  // ==============================
  function badgeEstado(estado) {
    const config = {
      pendiente_aprobacion: {
        texto: "Confirmación pendiente",
        color: "#ef6c00",
      },
      pendiente_pago_mp: {
        texto: "Falta pago MP",
        color: "#8e24aa",
      },
      confirmado: {
        texto: "Confirmado",
        color: "#2e7d32",
      },
      rechazado: {
        texto: "Rechazado",
        color: "#c62828",
      },
      expirado: {
        texto: "Expirado",
        color: "#757575",
      },
    };

    const data = config[estado] || {
      texto: "Desconocido",
      color: "#999",
    };

    return (
      <span
        style={{
          display: "inline-block",
          padding: "6px 10px",
          borderRadius: 20,
          fontSize: 12,
          backgroundColor: data.color,
          color: "white",
          whiteSpace: "nowrap",
        }}
      >
        {data.texto}
      </span>
    );
  }

  return (
    <div className="admin-panel">
      <h2>Turnos / Reservas</h2>

      {/* FILTROS */}
      <div style={{ marginBottom: 16 }}>
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
        >
          <option value="todos">Todos</option>
          <option value="confirmado">Confirmados</option>
          <option value="pendiente_aprobacion">Pendiente aprobación</option>
          <option value="pendiente_pago_mp">Pendiente pago online</option>
          <option value="rechazado">Rechazado</option>
          <option value="expirado">Expirado</option>
        </select>

        <input
          className="input-admin"
          type="date"
          value={fechaFiltro}
          onChange={(e) => setFechaFiltro(e.target.value)}
        />
      </div>

      {/* TABLA */}
      <div className="tabla-turnos-wrapper">
        <table className="tabla-turnos">
          <colgroup>
            <col style={{ width: "110px" }} />
            <col style={{ width: "120px" }} />
            <col style={{ width: "80px" }} />
            <col style={{ width: "180px" }} />
            <col style={{ width: "200px" }} />
            <col style={{ width: "140px" }} />
            <col style={{ width: "160px" }} />
            <col style={{ width: "160px" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Horario</th>
              <th>Duración</th>
              <th>Cliente</th>
              <th>Servicio</th>
              <th>Gabinete</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>

          <tbody>
            {turnosFiltrados.map((t) => {
              const cliente = clientes[t.clienteId];
              const gabinete = gabinetes[t.gabineteId];

              const ahora = new Date().getTime();

              return (
                <tr key={t.id}>
                  <td>{formatearFecha(t.fecha)}</td>

                  <td>
                    {formatearHora(t.horaInicio)} - {formatearHora(t.horaFin)}
                  </td>

                  <td>{formatearDuracion(t.horaInicio, t.horaFin)}</td>

                  <td>
                    {cliente?.nombre ||
                      cliente?.email ||
                      t.clienteId.slice(0, 8)}
                  </td>

                  <td>{t.nombreServicio}</td>

                  <td>{gabinete?.nombreGabinete || t.gabineteId}</td>

                  <td>
                    {badgeEstado(t.estado)}
                    {t.venceEn &&
                      t.venceEn < ahora &&
                      t.estado !== "confirmado" && (
                        <div style={{ fontSize: 10, color: "#c62828" }}>
                          Expirado
                        </div>
                      )}
                  </td>

                  <td>
                    {t.estado === "pendiente_aprobacion" && (
                      <>
                        <button
                          className="swal-btn-aprobar"
                          onClick={() => aprobarTurno(t.id)}
                        >
                          Aprobar
                        </button>
                        <button
                          className="swal-btn-rechazar"
                          onClick={() => rechazarTurno(t.id)}
                        >
                          Rechazar
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

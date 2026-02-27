// --------------------------------------------------
// src/components/turnos/TurnosPanel.jsx
// --------------------------------------------------
import { useEffect, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";

import Swal from "sweetalert2";

import { generarSlotsDia } from "./AgendaUtils";
import SlotHora from "./SlotHora";

export default function TurnosPanel({ servicio }) {
  const [agenda, setAgenda] = useState(null);
  const [loading, setLoading] = useState(true);

  const [fechaSeleccionada, setFechaSeleccionada] = useState(new Date());
  const [slotSeleccionado, setSlotSeleccionado] = useState(null);
  const [loadingReserva, setLoadingReserva] = useState(false);
  const fn = httpsCallable(getFunctions(), "crearTurnoInteligente");

  useEffect(() => {
    const gabineteIds = (servicio?.gabinetes || [])
      .map((g) => (typeof g === "string" ? g : g?.id))
      .filter((id) => typeof id === "string" && id.trim() !== "");

    if (!gabineteIds.length) {
      setAgenda(null);
      setLoading(false);
      return;
    }

    let activo = true;

    async function cargar() {
      try {
        setLoading(true);

        const getAgendaFn = httpsCallable(getFunctions(), "getAgendaGabinete");

        const res = await getAgendaFn({ gabineteIds });
        console.log("AGENDA BACKEND:", res.data);
        if (activo) {
          setAgenda(res.data || null);
        }
      } catch (err) {
        console.error("Error cargando agenda:", err);
      } finally {
        if (activo) setLoading(false);
      }
    }

    cargar();

    return () => {
      activo = false;
    };
  }, [servicio?.gabinetes]);

  function generarProximosDias(cantidad = 7) {
    const dias = [];
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    let cursor = new Date(hoy);

    while (dias.length < cantidad) {
      dias.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    return dias;
  }

  async function reservarTurno() {
    if (!slotSeleccionado) return;

    const fecha = fechaSeleccionada.toISOString().slice(0, 10);

    try {
      setLoadingReserva(true);

      const inicio = slotSeleccionado.horaInicio;
      const fin = slotSeleccionado.horaFin;

      const gabineteIds = (servicio?.gabinetes || []).filter(
        (id) => typeof id === "string" && id.trim() !== "",
      );

      await fn({
        servicioId: servicio.id,
        servicioNombre: servicio.nombre,
        gabineteIds,
        fecha,
        horaInicio: inicio,
        horaFin: fin,
        modoAsignacion: servicio.modoAsignacion || "auto",
      });

      Swal.fire({
        icon: "success",
        title: "Turno reservado",
        text: "Tu turno fue confirmado correctamente",
      });

      setSlotSeleccionado(null);

      const getAgendaFn = httpsCallable(getFunctions(), "getAgendaGabinete");
      const res = await getAgendaFn({ gabineteIds });
      setAgenda(res.data || null);
    } catch (err) {
      console.error("Error reservando turno:", err);

      Swal.fire({
        icon: "warning",
        title: "Horario ocupado",
        text: "Ese turno ya fue reservado por otro cliente",
      });
    } finally {
      setLoadingReserva(false);
    }
  }

  if (loading) return <p>Cargando agenda...</p>;
  if (!agenda) return null;

  const dias = generarProximosDias(10);

  const slots = generarSlotsDia(agenda, servicio, fechaSeleccionada);

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  console.log("SERVICIO:", servicio);
  console.log("GABINETES:", servicio?.gabinetes);
  console.log("LOADING:", loading);

  console.log("SERVICIO COMPLETO:", servicio);
  console.log("GABINETES RAW:", servicio?.gabinetes);
  return (
    <div className="agenda-panel">
      {/* CALENDARIO HORIZONTAL */}
      <div className="calendario-horizontal mb-3">
        {dias.map((d) => {
          const activo = d.toDateString() === fechaSeleccionada.toDateString();

          const pasado = d < hoy;

          // 🔥 verificar disponibilidad real
          const slotsDelDia = generarSlotsDia(agenda, servicio, d);
          const tieneDisponibilidad = slotsDelDia.some((s) => !s.ocupado);

          const deshabilitado = pasado || !tieneDisponibilidad;

          return (
            <button
              key={d.toISOString()}
              disabled={deshabilitado}
              className={`dia-btn ${activo ? "activo" : ""} ${
                deshabilitado ? "disabled" : ""
              }`}
              onClick={() => {
                if (!deshabilitado) setFechaSeleccionada(d);
              }}
            >
              <div>
                {d.toLocaleDateString("es-AR", {
                  weekday: "short",
                })}
              </div>
              <strong>{d.getDate()}</strong>
            </button>
          );
        })}
      </div>

      <div className="mb-2 text-center">
        <h5>
          {fechaSeleccionada.toLocaleDateString("es-AR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </h5>
      </div>

      {/* SLOTS DEL DÍA SELECCIONADO */}
      <div className="slots-grid">
        {slots.length === 0 && (
          <p className="text-muted">No hay horarios disponibles.</p>
        )}

        {slots.map((s) => (
          <SlotHora
            key={s.inicio}
            slot={s}
            onClick={() => {
              if (s.ocupado) return;

              setSlotSeleccionado({
                fecha: fechaSeleccionada.toISOString().slice(0, 10),
                horaInicio: s.inicio,
                horaFin: s.fin,
                gabineteId: s.gabineteId,
              });
            }}
          />
        ))}
      </div>

      {/* BOTÓN CONFIRMAR */}
      {slotSeleccionado && (
        <div className="mt-3">
          <button
            className="btn btn-dark w-100"
            onClick={reservarTurno}
            disabled={loadingReserva}
          >
            {loadingReserva ? "Reservando..." : "Confirmar turno"}
          </button>
        </div>
      )}
    </div>
  );
}

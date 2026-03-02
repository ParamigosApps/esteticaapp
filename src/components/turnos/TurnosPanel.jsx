// --------------------------------------------------
// src/components/turnos/TurnosPanel.jsx
// --------------------------------------------------
import { useEffect, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";

import Swal from "sweetalert2";

import { generarSlotsDia } from "./AgendaUtils";
import { swalResumenTurno } from "../../utils/swalUtils";

import { showLoading, hideLoading } from "../../services/loadingService";

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

        const result = await getAgendaFn({ gabineteIds });

        if (activo) {
          setAgenda(result.data ?? null);
        }
        console.log("AGENDA STATE:", agenda);
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
  }, [servicio?.id]);

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

      const gabineteIds = (servicio?.gabinetes || [])
        .map((g) => (typeof g === "string" ? g : g?.id))
        .filter((id) => typeof id === "string" && id.trim() !== "");

      const res = await fn({
        servicioId: servicio.id,
        nombreServicio: servicio.nombreServicio,
        gabineteIds,
        fecha,
        horaInicio: inicio,
        horaFin: fin,
        modoAsignacion: servicio.modoAsignacion || "auto",
      });

      if (servicio.modoReserva === "reserva") {
        Swal.fire({
          icon: "success",
          title: "Solicitud enviada",
          text: "Espera la confirmación por Whatsapp",
          confirmButtonText: "Aceptar",
        });
      }

      setSlotSeleccionado(null);

      const getAgendaFn = httpsCallable(getFunctions(), "getAgendaGabinete");
      const resultAgenda = await getAgendaFn({ gabineteIds });
      setAgenda(resultAgenda.data || null);

      return res?.data;
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

  async function handleReservaManual() {
    const data = await reservarTurno();
    if (!data?.turnoId) return;

    const mensaje = encodeURIComponent(`
Hola! Me gustaria reserva el siguiente turno:

Servicio: ${servicio.nombreServicio}
Fecha: ${fechaFormateada}
Horario: ${horaInicioFormateada} - ${horaFinFormateada}
Turno ID: ${data.turnoId.slice(0, 8)}
`);

    window.open(`https://wa.me/5491130580879?text=${mensaje}`, "_blank");
  }

  async function handleReservaAutomaticaMP() {
    const data = await reservarTurno();
    if (!data?.turnoId) return;

    const iniciarPagoFn = httpsCallable(getFunctions(), "iniciarPagoTurnoMP");

    const pago = await iniciarPagoFn({
      turnoId: data.turnoId,
    });

    if (pago?.data?.init_point) {
      window.location.href = pago.data.init_point;
    }
  }

  async function handleConfirmacion() {
    const resumen = await swalResumenTurno({
      servicio: servicio.nombreServicio,
      profesional: servicio.nombreProfesional,
      fecha: fechaFormateada,
      horaInicio: horaInicioFormateada,
      horaFin: horaFinFormateada,
      duracion: servicio.duracionMin,
      precio: servicio.precio,
      modoReserva: servicio.modoReserva,
    });

    if (!resumen.isConfirmed) return;

    const requierePagoOnline =
      servicio.pedirAnticipo && Number(servicio.porcentajeAnticipo || 0) > 0;

    console.log(
      "pedir anticipo: " +
        servicio.pedirAnticipo +
        "tipoAnticipo:" +
        servicio.tipoAnticipo,
    );
    if (servicio.modoReserva === "reserva") {
      await handleReservaManual();
    } else if (requierePagoOnline) {
      try {
        showLoading({
          title: "Redirigiendo a MercadoPago",
          text: "Aguarde unos instantes...",
        });
        await handleReservaAutomaticaMP();
      } finally {
        hideLoading();
      }
    } else {
      await reservarTurno(); // confirmación directa
    }
  }

  if (loading)
    return (
      <div
        className="d-flex justify-content-center align-items-center"
        style={{ minHeight: "70px" }}
      >
        <p className="text-muted mb-0">Cargando agenda...</p>
      </div>
    );
  if (!agenda) return null;

  const dias = generarProximosDias(18);

  const slots = generarSlotsDia(agenda, servicio, fechaSeleccionada);

  const fechaFormateada = slotSeleccionado
    ? new Date(slotSeleccionado.horaInicio).toLocaleDateString("es-AR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : null;

  const horaInicioFormateada = slotSeleccionado
    ? new Date(slotSeleccionado.horaInicio).toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const horaFinFormateada = slotSeleccionado
    ? new Date(slotSeleccionado.horaFin).toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  let textBtnTurno =
    servicio.modoReserva === "reserva"
      ? "Solicitar turno"
      : "Pagar y confirmar";

  return (
    <div
      className="agenda-panel"
      onClick={(e) => {
        if (!e.target.closest(".slot")) {
          setSlotSeleccionado(null);
        }
      }}
    >
      <h5 className="agenda-titulo">
        <b>{servicio.nombreServicio.toUpperCase()}</b>
      </h5>
      {/* CALENDARIO HORIZONTAL */}
      <div className="calendario-horizontal">
        {dias.map((d) => {
          const activo = d.toDateString() === fechaSeleccionada.toDateString();

          const pasado = d < hoy;

          const diaSemana = d.getDay();

          const hayHorarioEseDia = agenda.horarios?.some(
            (h) => Number(h.diaSemana) === diaSemana,
          );

          const slotsDelDia = hayHorarioEseDia
            ? generarSlotsDia(agenda, servicio, d)
            : [];

          const tieneDisponibilidad =
            hayHorarioEseDia && slotsDelDia.some((s) => !s.ocupado);

          const deshabilitado = pasado || !tieneDisponibilidad;
          return (
            <button
              key={d.toISOString()}
              disabled={deshabilitado}
              className={`dia-btn ${activo ? "activo" : ""} ${
                deshabilitado ? "disabled" : ""
              }`}
              onClick={() => {
                if (deshabilitado) return;

                setFechaSeleccionada(d);
                setSlotSeleccionado(null);
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

      <div className="mb-2 mt-4 text-center">
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
            slotSeleccionado={slotSeleccionado}
            onClick={() => {
              if (s.ocupado) return;

              setSlotSeleccionado({
                ...s,
                fecha: fechaSeleccionada.toISOString().slice(0, 10),
                horaInicio: s.inicio,
                horaFin: s.fin,
              });
            }}
          />
        ))}
      </div>

      {/* BOTÓN CONFIRMAR */}
      {slotSeleccionado && (
        <div className="resumen-turno mt-4 p-3 ">
          <h6 className="fw-bold mb-2">Resumen del turno</h6>

          <div>
            <strong>Servicio:</strong> {servicio.nombreServicio}
          </div>
          <div>
            <strong>Profesional:</strong> {servicio.nombreProfesional}
          </div>
          <div>
            <strong>Fecha:</strong> {fechaFormateada}
          </div>

          <div>
            <strong>Horario:</strong> {horaInicioFormateada} -{" "}
            {horaFinFormateada}
          </div>

          <div className="mb-1">
            <strong>Duración:</strong> {servicio.duracionMin} min
          </div>

          {servicio.precio > 0 && (
            <div>
              <strong>Precio:</strong> ${servicio.precio}
            </div>
          )}

          {servicio.pedirAnticipo && servicio.modoReserva == "automatico" && (
            <>
              <div className="mb-1">
                <span className="text-muted fw-semibold">
                  {"  -  "}Reservas con el {servicio.porcentajeAnticipo}% del
                  total (
                  <strong>
                    $
                    {(
                      (servicio.precio * servicio.porcentajeAnticipo) /
                      100
                    ).toLocaleString("es-AR")}
                  </strong>
                  )
                </span>
              </div>

              <div className="mb-3 mt-3">
                <span className="text-success fw-semibold">
                  ¡Podes confirmar el turno en este momento!
                </span>
              </div>
            </>
          )}

          {servicio.pedirAnticipo && servicio.modoReserva == "reserva" && (
            <>
              <div className="mb-1">
                <span className="text-muted fw-semibold">
                  Reservas con el {servicio.porcentajeAnticipo}% del total (
                  <strong>
                    $
                    {(
                      (servicio.precio * servicio.porcentajeAnticipo) /
                      100
                    ).toLocaleString("es-AR")}
                  </strong>
                  )
                </span>
              </div>
              <div className="mb-3 mt-3">
                <span className="text-danger fw-semibold">
                  ¡Este turno se confirma por WhatsApp!
                </span>
              </div>
            </>
          )}

          <button
            className="swal-btn-confirm d-block mx-auto"
            onClick={handleConfirmacion}
            disabled={loadingReserva}
          >
            {loadingReserva ? "Reservando..." : textBtnTurno}
          </button>
        </div>
      )}
    </div>
  );
}

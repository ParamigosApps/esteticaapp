// --------------------------------------------------
// src/components/turnos/TurnosPanel.jsx
// --------------------------------------------------
import { useEffect, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";

import { useAuth } from "../../context/AuthContext";

import Swal from "sweetalert2";

import { generarSlotsDia } from "../../public/utils/generarSlotsDia";
import {
  swalRequiereLogin,
  swalResumenTurno,
} from "../../public/utils/swalUtils";
import { showLoading, hideLoading } from "../../services/loadingService";

import SlotHora from "./panels/SlotHora";

function toISODateLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getMonthRange(baseDate) {
  const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const end = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);

  return {
    fechaDesde: toISODateLocal(start),
    fechaHasta: toISODateLocal(end),
  };
}

function generarDiasDelMes(baseDate) {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const primerDia = new Date(year, month, 1);
  const ultimoDia = new Date(year, month + 1, 0);

  const dias = [];
  let cursor = new Date(primerDia);

  while (cursor <= ultimoDia) {
    const copia = new Date(cursor);

    if (
      copia >= hoy ||
      copia.getMonth() !== hoy.getMonth() ||
      copia.getFullYear() !== hoy.getFullYear()
    ) {
      dias.push(copia);
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return dias;
}

function getFechaMaxReservable(servicio) {
  const maxDias = Math.max(1, Number(servicio?.agendaMaxDias || 7));

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const max = new Date(hoy);
  max.setDate(max.getDate() + maxDias - 1);
  max.setHours(0, 0, 0, 0);

  return max;
}

function calcularMontoAnticipo(servicio) {
  const precio = Number(servicio?.precio || 0);
  const porcentaje = Number(servicio?.porcentajeAnticipo || 0);

  if (precio <= 0 || porcentaje <= 0) return 0;

  return Math.round((precio * porcentaje) / 100);
}

function buscarPrimerDiaDisponible(dias, agenda, servicio) {
  for (const d of dias) {
    const diaSemana = d.getDay();

    const hayHorarioEseDia = agenda?.horarios?.some(
      (h) => Number(h.diaSemana) === diaSemana,
    );

    if (!hayHorarioEseDia) continue;

    const slotsDelDia = generarSlotsDia(agenda, servicio, d);
    const tieneDisponibilidad = slotsDelDia.some((s) => !s.ocupado);

    if (tieneDisponibilidad) {
      return d;
    }
  }

  return null;
}

export default function TurnosPanel({ servicio }) {
  const { user, loading: authLoading } = useAuth();

  const [agenda, setAgenda] = useState(null);
  const [loading, setLoading] = useState(true);

  const [fechaSeleccionada, setFechaSeleccionada] = useState(new Date());
  const [slotSeleccionado, setSlotSeleccionado] = useState(null);
  const [loadingReserva, setLoadingReserva] = useState(false);

  const fn = httpsCallable(getFunctions(), "crearTurnoInteligente");

  const precioTotal = Number(servicio?.precio || 0);
  const porcentajeAnticipo = Number(servicio?.porcentajeAnticipo || 0);
  const montoAnticipo = calcularMontoAnticipo(servicio);
  const saldoPendiente = Math.max(0, precioTotal - montoAnticipo);

  const esReservaManual = servicio?.modoReserva === "reserva";

  const requierePagoOnline =
    servicio?.pedirAnticipo &&
    montoAnticipo > 0 &&
    (servicio?.tipoAnticipo || "online") === "online" &&
    !esReservaManual;

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
        const { fechaDesde, fechaHasta } = getMonthRange(fechaSeleccionada);

        const result = await getAgendaFn({
          gabineteIds,
          fechaDesde,
          fechaHasta,
        });

        if (activo) {
          setAgenda(result.data ?? null);
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
  }, [
    servicio?.id,
    fechaSeleccionada.getFullYear(),
    fechaSeleccionada.getMonth(),
  ]);

  useEffect(() => {
    if (!agenda) return;

    const dias = generarDiasDelMes(fechaSeleccionada);
    if (!dias.length) return;

    const fechaActualKey = toISODateLocal(fechaSeleccionada);

    const diaActual = dias.find((d) => toISODateLocal(d) === fechaActualKey);
    const primerDisponible = buscarPrimerDiaDisponible(dias, agenda, servicio);

    if (!primerDisponible) return;

    const diaActualTieneDisponibilidad = diaActual
      ? generarSlotsDia(agenda, servicio, diaActual).some((s) => !s.ocupado)
      : false;

    if (!diaActualTieneDisponibilidad) {
      const nuevaFecha = new Date(primerDisponible);
      nuevaFecha.setHours(0, 0, 0, 0);

      if (toISODateLocal(nuevaFecha) !== fechaActualKey) {
        setFechaSeleccionada(nuevaFecha);
        setSlotSeleccionado(null);
      }
    }
  }, [agenda, servicio, fechaSeleccionada]);

  function cambiarMes(offset) {
    const nueva = new Date(fechaSeleccionada);
    nueva.setDate(1);
    nueva.setMonth(nueva.getMonth() + offset);
    setFechaSeleccionada(nueva);
    setSlotSeleccionado(null);
  }

  async function reservarTurno() {
    if (!slotSeleccionado) return;

    const fecha = toISODateLocal(fechaSeleccionada);
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
      const { fechaDesde, fechaHasta } = getMonthRange(fechaSeleccionada);

      const resultAgenda = await getAgendaFn({
        gabineteIds,
        fechaDesde,
        fechaHasta,
      });

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
    if (authLoading) return;

    if (!user) {
      await swalRequiereLogin();
      return;
    }

    const resumen = await swalResumenTurno({
      servicio: servicio.nombreServicio,
      profesional: servicio.nombreProfesional,
      fecha: fechaFormateada,
      horaInicio: horaInicioFormateada,
      horaFin: horaFinFormateada,
      duracion: servicio.duracionMin,
      precio: servicio.precio,
      precioAnticipo: montoAnticipo || null,
      modoReserva: servicio.modoReserva,
    });

    if (!resumen.isConfirmed) return;

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

  const dias = generarDiasDelMes(fechaSeleccionada);

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

  const fechaMaxReservable = getFechaMaxReservable(servicio);

  const primerDiaMesActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

  const primerDiaMesAnterior = new Date(
    fechaSeleccionada.getFullYear(),
    fechaSeleccionada.getMonth() - 1,
    1,
  );

  const primerDiaMesSiguiente = new Date(
    fechaSeleccionada.getFullYear(),
    fechaSeleccionada.getMonth() + 1,
    1,
  );

  const puedeIrMesAnterior = primerDiaMesAnterior >= primerDiaMesActual;
  const puedeIrMesSiguiente = primerDiaMesSiguiente <= fechaMaxReservable;

  let textBtnTurno = "Confirmar turno";

  if (esReservaManual) {
    textBtnTurno = "Solicitar turno";
  } else if (requierePagoOnline) {
    textBtnTurno = `Abonar $${montoAnticipo.toLocaleString("es-AR")} y confirmar`;
  }

  return (
    <div
      className="agenda-panel"
      onClick={(e) => {
        const clickEnSlot = e.target.closest(".slot");
        const clickEnResumen = e.target.closest(".resumen-turno");
        const clickEnAgenda = e.target.closest(".agenda-panel");

        if (!clickEnSlot && !clickEnResumen && !clickEnAgenda) {
          setSlotSeleccionado(null);
        }
      }}
    >
      <div className="agenda-header">
        {" "}
        <small className="agenda-disponibilidad">
          Agenda abierta hasta el{" "}
          <b>{fechaMaxReservable.toLocaleDateString("es-AR")}</b>
        </small>
      </div>
      <h5 className="agenda-titulo">
        <b>{servicio.nombreServicio.toUpperCase()}</b>
      </h5>
      <div className="d-flex justify-content-between align-items-center mb-3 mt-4">
        <div className="text-center mb-2"></div>
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          onClick={() => cambiarMes(-1)}
          disabled={!puedeIrMesAnterior}
        >
          ← Mes anterior
        </button>

        <div style={{ fontWeight: 700 }}>
          {fechaSeleccionada.toLocaleDateString("es-AR", {
            month: "long",
            year: "numeric",
          })}
        </div>

        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          onClick={() => cambiarMes(1)}
          disabled={!puedeIrMesSiguiente}
        >
          Mes siguiente →
        </button>
      </div>
      {/* CALENDARIO HORIZONTAL */}
      <div className="calendario-horizontal">
        {dias.map((d) => {
          const activo = d.toDateString() === fechaSeleccionada.toDateString();

          const pasado = d < hoy;
          const fueraDeAgenda = d > fechaMaxReservable;

          const diaSemana = d.getDay();

          const hayHorarioEseDia = agenda.horarios?.some(
            (h) => Number(h.diaSemana) === diaSemana,
          );

          const slotsDelDia = hayHorarioEseDia
            ? generarSlotsDia(agenda, servicio, d)
            : [];

          const tieneDisponibilidad =
            hayHorarioEseDia && slotsDelDia.some((s) => !s.ocupado);

          const deshabilitado = pasado || fueraDeAgenda || !tieneDisponibilidad;
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
          <>
            <div className="w-100 text-center">
              <p className="text-muted mb-0">No hay horarios disponibles.</p>
            </div>
          </>
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
                fecha: toISODateLocal(fechaSeleccionada),
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

          <div>
            <strong>Duración:</strong> {servicio.duracionMin} min
          </div>

          {precioTotal > 0 && (
            <>
              <div>
                <strong>Costo servicio:</strong> $
                {precioTotal.toLocaleString("es-AR")}
              </div>
            </>
          )}

          {requierePagoOnline && (
            <div className="mb-3 mt-1">
              <span className="total-seña text-success fw-semibold">
                Abonas <b>${montoAnticipo.toLocaleString("es-AR")}</b> para
                confirmar el turno.{" "}
                {montoAnticipo != precioTotal && (
                  <span className=" ">
                    ¡El valor restante se abona el día del servicio!
                  </span>
                )}
              </span>
            </div>
          )}

          {esReservaManual && servicio.pedirAnticipo && montoAnticipo > 0 && (
            <div className="mb-3 mt-1">
              <span className="total-seña text-danger fw-semibold">
                Este turno se solicita por WhatsApp. Reservas este servicio con
                <b> ${montoAnticipo.toLocaleString("es-AR")}</b>.
              </span>
            </div>
          )}

          {esReservaManual &&
            (!servicio.pedirAnticipo || montoAnticipo <= 0) && (
              <div className="mb-3 mt-1">
                <span className="total-seña text-danger fw-semibold">
                  ¡Este turno se confirma por WhatsApp!
                </span>
              </div>
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

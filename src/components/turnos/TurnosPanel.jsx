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
import { formatearSoloFecha } from "../../public/utils/utils";
import { showLoading, hideLoading } from "../../services/loadingService";
import { calcularMontosTurno } from "../../config/comisiones.js";

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

function getPrecioEfectivo(servicio) {
  const precio = Number(servicio?.precio || 0);
  const precioEfectivo = Number(servicio?.precioEfectivo || 0);

  if (precioEfectivo > 0 && precioEfectivo < precio) {
    return precioEfectivo;
  }

  return 0;
}

export default function TurnosPanel({ servicio }) {
  const { user, loading: authLoading } = useAuth();

  const [agenda, setAgenda] = useState(null);
  const [loading, setLoading] = useState(true);

  const [fechaSeleccionada, setFechaSeleccionada] = useState(new Date());
  const [slotSeleccionado, setSlotSeleccionado] = useState(null);
  const [loadingReserva, setLoadingReserva] = useState(false);

  const fn = httpsCallable(getFunctions(), "crearTurnoInteligente");

  const pricingTurno = calcularMontosTurno({
    precioServicio: Number(servicio?.precio || 0),
    porcentajeAnticipo: servicio?.pedirAnticipo
      ? Number(servicio?.porcentajeAnticipo || 0)
      : 0,
    cobrarComision: true,
  });
  const precioServicio = pricingTurno.precioServicio;
  const precioTotal = pricingTurno.montoTotal;
  const comisionTurno = pricingTurno.comisionTurno;
  const montoAnticipoServicio = pricingTurno.montoAnticipoServicio;
  const montoAnticipo = pricingTurno.montoAnticipoTotal;
  const saldoPendiente = Math.max(0, precioTotal - montoAnticipo);
  const requiereAnticipoTurno = montoAnticipo > 0;
  const precioEfectivo = getPrecioEfectivo(servicio);
  const ahorroEfectivo = Math.max(0, precioServicio - precioEfectivo);
  const saldoServicioEfectivo = Math.max(
    0,
    precioEfectivo - montoAnticipoServicio,
  );
  const saldoServicioTransferencia = Math.max(
    0,
    precioServicio - montoAnticipoServicio,
  );
  const esReservaManual = servicio?.modoReserva === "reserva";

  const requierePagoOnline =
    requiereAnticipoTurno &&
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

  async function reservarTurno(metodoPagoSolicitado = null) {
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
        metodoPagoSolicitado,
      });

      if (servicio.modoReserva === "reserva") {
        const fechaTurno = new Date(
          slotSeleccionado.horaInicio,
        ).toLocaleDateString("es-AR", {
          weekday: "long",
          day: "numeric",
          month: "long",
        });

        const horaDesde = new Date(
          slotSeleccionado.horaInicio,
        ).toLocaleTimeString("es-AR", {
          hour: "2-digit",
          minute: "2-digit",
        });

        const horaHasta = new Date(slotSeleccionado.horaFin).toLocaleTimeString(
          "es-AR",
          {
            hour: "2-digit",
            minute: "2-digit",
          },
        );

        Swal.fire({
          icon: "success",
          title: "Solicitud enviada",
          width: 520,
          html: `
            <div class="swal-reserva-ok">
              <div class="swal-reserva-ok-copy">
                <p class="swal-reserva-ok-lead">
                  Recibimos tu solicitud para <strong>${servicio.nombreServicio}</strong>.
                </p>
                <p class="swal-reserva-ok-text">
                  Te responderemos por WhatsApp para confirmar el turno y coordinar los pasos siguientes.
                </p>
              </div>

              <div class="swal-reserva-ok-card">
                <div class="swal-reserva-ok-row">
                  <span>Fecha</span>
                  <strong>${fechaTurno}</strong>
                </div>
                <div class="swal-reserva-ok-row">
                  <span>Horario</span>
                  <strong>${horaDesde} - ${horaHasta}</strong>
                </div>
                <div class="swal-reserva-ok-row">
                  <span>Profesional</span>
                  <strong>${servicio.nombreProfesional || "-"}</strong>
                </div>
              </div>

              ${
                saldoPendiente > 0
                  ? `
                    <div class="swal-reserva-ok-note">
                      Espera la confirmacion por WhatsApp antes de transferir la sena. Una vez confirmado, el saldo restante se abona el dia del turno.
                    </div>
                  `
                  : ""
              }
            </div>
          `,
          confirmButtonText: "Aceptar",
          customClass: {
            popup: "swal-popup-custom",
            confirmButton: "swal-btn-confirm",
          },
          buttonsStyling: false,
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
        title: "No se pudo reservar",
        text:
          err?.message ||
          err?.details ||
          "Ocurrio un problema al intentar reservar el turno.",
      });
    } finally {
      setLoadingReserva(false);
    }
  }

  async function handleReservaManual() {
    const data = await reservarTurno("manual");
    if (!data?.turnoId) return;

    const mensaje = encodeURIComponent(`
Hola! Me gustaria reservar el siguiente turno:

Servicio: ${servicio.nombreServicio}
Fecha: ${fechaFormateada}
Horario: ${horaInicioFormateada} - ${horaFinFormateada}
Turno ID: ${data.turnoId.slice(0, 8)}
`);

    window.open(`https://wa.me/5491130580879?text=${mensaje}`, "_blank");
  }

  async function handleReservaAutomaticaMP() {
    const data = await reservarTurno("mercadopago");
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
      precio: precioServicio,
      precioTotal,
      precioAnticipo: montoAnticipo || null,
      comisionTurno,
      anticipoServicio: montoAnticipoServicio,
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
      await reservarTurno(
        (servicio?.tipoAnticipo || "online") === "manual" ? "manual" : null,
      );
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
        <small className="agenda-disponibilidad">
          Agenda abierta hasta el{" "}
          <b>{formatearSoloFecha(fechaMaxReservable)}</b>
        </small>
      </div>

      <h5 className="agenda-titulo">
        <b>{servicio.nombreServicio.toUpperCase()}</b>
      </h5>

      {precioEfectivo > 0 && (
        <div className="agenda-cash-note">
          {requierePagoOnline ? (
            <div className="agenda-cash-copy">
              <div>
                Señas por transferencia con:{" "}
                <strong>${montoAnticipo.toLocaleString("es-AR")}</strong>.
              </div>
              <div>
                El dia del turno podes abonar lo restante en efectivo por{" "}
                <strong>
                  ${saldoServicioEfectivo.toLocaleString("es-AR")}
                </strong>
                {ahorroEfectivo > 0 ? (
                  <>
                    {" "}
                    y ahorrar{" "}
                    <strong>${ahorroEfectivo.toLocaleString("es-AR")}</strong>
                  </>
                ) : null}
                .
              </div>
              <div>
                O abonando por transferencia:{" "}
                <strong>
                  ${saldoServicioTransferencia.toLocaleString("es-AR")}
                </strong>
                .
              </div>
            </div>
          ) : (
            <>
              En efectivo abonas{" "}
              <strong>${precioEfectivo.toLocaleString("es-AR")}</strong>
              {ahorroEfectivo > 0 ? (
                <span>
                  {" "}
                  y ahorras ${ahorroEfectivo.toLocaleString("es-AR")}.
                </span>
              ) : null}
            </>
          )}
        </div>
      )}

      <div className="d-flex justify-content-between align-items-center mb-3 mt-4">
        <div className="text-center mb-2"></div>
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          onClick={() => cambiarMes(-1)}
          disabled={!puedeIrMesAnterior}
        >
          {"<-"} Mes anterior
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
          Mes siguiente {"->"}
        </button>
      </div>

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

      <div className="slots-grid">
        {slots.length === 0 && (
          <div className="w-100 text-center">
            <p className="text-muted mb-0">No hay horarios disponibles.</p>
          </div>
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

      {slotSeleccionado && (
        <div className="resumen-turno mt-4 p-3 ">
          <h6 className="fw-bold mb-2">Resumen del turno</h6>

          <div className="resumen-turno-row">
            <strong>Servicio:</strong> {servicio.nombreServicio}
          </div>
          <div className="resumen-turno-row">
            <strong>Profesional:</strong> {servicio.nombreProfesional}
          </div>
          <div className="resumen-turno-row">
            <strong>Fecha:</strong> {fechaFormateada}
          </div>
          <div className="resumen-turno-row">
            <strong>Horario:</strong> {horaInicioFormateada} -{" "}
            {horaFinFormateada}
          </div>
          <div className="resumen-turno-row">
            <strong>Duracion:</strong> {servicio.duracionMin} min
          </div>

          {precioTotal > 0 && (
            <div className="resumen-turno-pricing">
              <div className="resumen-turno-row">
                <strong>Valor del servicio:</strong> $
                {precioServicio.toLocaleString("es-AR")}
              </div>
              {precioEfectivo > 0 && (
                <div className="resumen-turno-row resumen-turno-row-cash">
                  <strong>Valor abonando en efectivo:</strong> $
                  {precioEfectivo.toLocaleString("es-AR")}
                </div>
              )}
              {requierePagoOnline && montoAnticipoServicio > 0 && (
                <div className="resumen-turno-row resumen-turno-row-muted">
                  <strong>Seña del servicio:</strong> $
                  {montoAnticipoServicio.toLocaleString("es-AR")}
                </div>
              )}
              {requierePagoOnline && comisionTurno > 0 && (
                <div className="resumen-turno-row resumen-turno-row-muted">
                  <strong>Cargo de reserva online:</strong> $
                  {comisionTurno.toLocaleString("es-AR")}
                </div>
              )}
              <div className="resumen-turno-row resumen-turno-total">
                <strong>
                  {requierePagoOnline ? "Total a abonar online:" : "Total:"}
                </strong>{" "}
                ${precioTotal.toLocaleString("es-AR")}
              </div>
            </div>
          )}

          {requierePagoOnline && (
            <div className="mb-3 mt-1">
              <span className="total-sena text-success fw-semibold">
                Abonas <b>${montoAnticipo.toLocaleString("es-AR")}</b> para
                confirmar el turno online.{" "}
                {montoAnticipo !== precioTotal && (
                  <span>El dia del servicio abonas el saldo restante.</span>
                )}
              </span>
            </div>
          )}

          {esReservaManual && requiereAnticipoTurno && montoAnticipo > 0 && (
            <div className="mb-3 mt-1">
              <span className="total-sena text-danger fw-semibold">
                Este turno se solicita por WhatsApp. Reservas este servicio con
                <b> ${montoAnticipo.toLocaleString("es-AR")}</b>.
              </span>
              <div className="resumen-turno-meta">
                Anticipo del servicio: $
                {montoAnticipoServicio.toLocaleString("es-AR")}
              </div>
              {comisionTurno > 0 && (
                <div className="resumen-turno-meta-muted">
                  Cargo de reserva online: $
                  {comisionTurno.toLocaleString("es-AR")}.
                </div>
              )}
            </div>
          )}

          {esReservaManual &&
            (!requiereAnticipoTurno || montoAnticipo <= 0) && (
              <div className="mb-3 mt-1">
                <span className="total-sena text-danger fw-semibold">
                  Este turno se confirma por WhatsApp.
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

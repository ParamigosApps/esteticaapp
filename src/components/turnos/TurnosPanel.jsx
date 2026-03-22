// --------------------------------------------------
// src/components/turnos/TurnosPanel.jsx
// --------------------------------------------------
import { useEffect, useMemo, useRef, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { doc, getDoc } from "firebase/firestore";

import { useAuth } from "../../context/AuthContext";
import { db } from "../../Firebase";

import Swal from "sweetalert2";

import { generarSlotsDia } from "../../public/utils/generarSlotsDia";
import {
  swalRequiereLogin,
  swalResumenTurno,
  swalTurnoConfirmado,
} from "../../public/utils/swalUtils";
import { formatearSoloFecha } from "../../public/utils/utils";
import { showLoading, hideLoading } from "../../services/loadingService";
import { calcularMontosTurno, parseAmount } from "../../config/comisiones.js";

import SlotHora from "./panels/SlotHora";

function getReservaErrorMessage(err) {
  const messageFromDetailsObject =
    err?.details && typeof err.details === "object"
      ? err.details.message || err.details.error || err.details.details
      : null;
  const messageFromCustomData =
    err?.customData && typeof err.customData === "object"
      ? err.customData.message ||
        err.customData.details?.message ||
        err.customData.details
      : null;

  if (typeof err?.details === "string" && err.details.trim()) {
    return err.details;
  }

  if (
    typeof messageFromDetailsObject === "string" &&
    messageFromDetailsObject.trim()
  ) {
    return messageFromDetailsObject.trim();
  }

  if (
    typeof messageFromCustomData === "string" &&
    messageFromCustomData.trim()
  ) {
    return messageFromCustomData.trim();
  }

  if (typeof err?.message === "string" && err.message.trim()) {
    return err.message
      .replace(/^firebaseerror:\s*/i, "")
      .replace(/^(functions\/[a-z-]+:\s*)/i, "")
      .trim();
  }

  return "Ocurrio un problema al intentar reservar el turno.";
}

function getReservaErrorAlert(err) {
  const message = getReservaErrorMessage(err);
  const knownMessages = [
    "Alcanzaste el limite de",
    "Este servicio solo permite reservar hasta",
    "No se pueden reservar turnos en fechas pasadas",
    "No se pueden reservar horarios pasados",
    "Los turnos antes de las 12:00 requieren",
    "El horario seleccionado no",
    "Horario ocupado",
    "Sin gabinetes activos",
    "Servicio no encontrado",
    "No autenticado",
    "Datos incompletos",
  ];

  const esMensajeConocido = knownMessages.some((text) =>
    message.toLowerCase().includes(text.toLowerCase()),
  );

  if (esMensajeConocido) {
    return {
      icon: "warning",
      title: "No se pudo reservar",
      text: message,
    };
  }

  return {
    icon: "error",
    title: "Ocurrio un error",
    text: "Ocurrio un problema inesperado al reservar. Por favor, comunicate con un administrador.",
  };
}

function formatearFechaHora(ms) {
  return new Date(Number(ms)).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toISODateLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function parseISODateLocal(value) {
  const text = String(value || "").trim();
  if (!text || text === "null" || text === "undefined") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;

  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function readPendingLoginAction() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem("pendingLoginAction");
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error("No se pudo leer la accion pendiente de login", error);
    return null;
  }
}

function getMonthRange(baseDate, fechaMax = null) {
  const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const end = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
  const fechaHasta = fechaMax && end > fechaMax ? new Date(fechaMax) : end;

  return {
    fechaDesde: toISODateLocal(start),
    fechaHasta: toISODateLocal(fechaHasta),
  };
}

function generarDiasDelMes(baseDate, fechaMax = null, fechaMin = null) {
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

    if (copia >= (fechaMin || hoy) && (!fechaMax || copia <= fechaMax)) {
      dias.push(copia);
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return dias;
}

const AGENDA_24HS_FALLBACK_DIAS = 90;

function getLimiteReservableMs(servicio) {
  const maxDias = Math.max(1, Number(servicio?.agendaMaxDias || 7));
  const diasVentana = maxDias <= 1 ? AGENDA_24HS_FALLBACK_DIAS : maxDias;
  const fechaMax = new Date();
  fechaMax.setHours(0, 0, 0, 0);
  fechaMax.setDate(fechaMax.getDate() + (diasVentana - 1));
  fechaMax.setHours(23, 59, 59, 999);
  return fechaMax.getTime();
}

function getFechaMaxReservable(servicio) {
  return startOfDay(new Date(getLimiteReservableMs(servicio)));
}

function slotDentroDeVentanaAgenda(slot, limiteReservableMs) {
  return Number(slot?.inicio) <= Number(limiteReservableMs);
}

function formatearSlotPackLabel(horaInicioMs) {
  const fechaObj = new Date(Number(horaInicioMs || 0));
  if (Number.isNaN(fechaObj.getTime())) return "-";

  const dia = fechaObj.toLocaleDateString("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
  const hora = fechaObj.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const horaCompacta = hora.endsWith(":00")
    ? `${hora.slice(0, 2)}hs`
    : `${hora}hs`;
  return `${dia.replace(".", "")} - ${horaCompacta}`;
}

function getReservasConfigDefault() {
  return {
    bloquearTurnosMananaSin12h: false,
  };
}

function getFechaMaxReservableReal(servicio, fechaMaxBase) {
  if (servicio?.agendaTipo === "mensual") {
    const hoy = new Date();
    const mesBaseOffset =
      servicio?.agendaMensualModo === "mes_siguiente" ? 1 : 0;
    const mesHasta = servicio?.agendaMensualRepiteMesSiguiente
      ? mesBaseOffset + 2
      : mesBaseOffset + 1;
    const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + mesHasta, 0);
    finMes.setHours(0, 0, 0, 0);

    return finMes < fechaMaxBase ? finMes : fechaMaxBase;
  }

  return fechaMaxBase;
}

function getFechaMinReservable(servicio) {
  const hoy = startOfDay(new Date());
  const fechaAgendaDesde = parseISODateLocal(servicio?.agendaDisponibleDesde);

  if (fechaAgendaDesde && fechaAgendaDesde > hoy) {
    return fechaAgendaDesde;
  }

  return hoy;
}

const ANTICIPACION_MINIMA_TURNOS_MANANA_HORAS = 12;

function cumpleReglaAnticipacionManana(
  inicioMs,
  reservasConfig,
  servicio = null,
) {
  if (!reservasConfig?.bloquearTurnosMananaSin12h) return true;
  if (Math.max(1, Number(servicio?.agendaMaxDias || 7)) <= 1) return true;

  return (
    Number(inicioMs) - Date.now() >=
    ANTICIPACION_MINIMA_TURNOS_MANANA_HORAS * 60 * 60 * 1000
  );
}

function buscarPrimerDiaDisponible(
  dias,
  agenda,
  servicio,
  fechaMax = null,
  limiteReservableMs = null,
  reservasConfig = getReservasConfigDefault(),
) {
  for (const d of dias) {
    if (fechaMax && d > fechaMax) continue;

    const diaSemana = d.getDay();

    const hayHorarioEseDia = agenda?.horarios?.some(
      (h) => Number(h.diaSemana) === diaSemana,
    );

    if (!hayHorarioEseDia) continue;

    const slotsDelDia = generarSlotsDia(agenda, servicio, d);
    const tieneDisponibilidad = slotsDelDia.some(
      (s) =>
        !s.ocupado &&
        cumpleReglaAnticipacionManana(s.inicio, reservasConfig, servicio) &&
        slotDentroDeVentanaAgenda(s, limiteReservableMs),
    );

    if (tieneDisponibilidad) {
      return d;
    }
  }

  return null;
}

function getPrecioEfectivo(servicio) {
  const precio = parseAmount(servicio?.precio || 0);
  const precioEfectivo = parseAmount(servicio?.precioEfectivo || 0);

  if (precioEfectivo > 0 && precioEfectivo < precio) {
    return precioEfectivo;
  }

  return 0;
}

function formatearFechaCorta(date) {
  return new Date(date).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function unirFechasLegibles(fechas = []) {
  if (!fechas.length) return "";
  if (fechas.length === 1) return fechas[0];
  if (fechas.length === 2) return `${fechas[0]} y ${fechas[1]}`;

  return `${fechas.slice(0, -1).join(", ")} y ${fechas[fechas.length - 1]}`;
}

function sumarDiasDate(baseDate, dias) {
  const next = new Date(baseDate);
  next.setDate(next.getDate() + Number(dias || 0));
  next.setHours(0, 0, 0, 0);
  return next;
}

function getWhatsappUrl(numero, mensaje) {
  const soloDigitos = String(numero || "").replace(/\D/g, "");
  if (!soloDigitos) return "";

  const numeroConPais = soloDigitos.startsWith("54")
    ? soloDigitos
    : `54${soloDigitos}`;

  return `https://wa.me/${numeroConPais}?text=${encodeURIComponent(mensaje)}`;
}

function getFechasAgendaMensualTexto(
  servicio,
  fechaMinReservable,
  fechaMaxReservable,
) {
  if (servicio?.agendaTipo !== "mensual") return "";

  const agendaMensual = Array.isArray(servicio?.agendaMensual)
    ? servicio.agendaMensual.filter(
        (item) =>
          item?.activo !== false &&
          Array.isArray(item?.franjas) &&
          item.franjas.length,
      )
    : [];

  if (!agendaMensual.length) return "";

  const mesBaseOffset = servicio?.agendaMensualModo === "mes_siguiente" ? 1 : 0;
  const meses = servicio?.agendaMensualRepiteMesSiguiente ? 2 : 1;
  const fechas = [];
  const fechaMin = startOfDay(fechaMinReservable || new Date());

  for (let offset = 0; offset < meses; offset += 1) {
    const year = fechaMin.getFullYear();
    const month = fechaMin.getMonth() + mesBaseOffset + offset;
    const ultimoDiaMes = new Date(year, month + 1, 0).getDate();

    agendaMensual.forEach((item) => {
      const dia = Number(item?.diaMes || 0);
      if (!Number.isFinite(dia) || dia < 1 || dia > ultimoDiaMes) return;

      const fecha = startOfDay(new Date(year, month, dia));
      if (fecha < fechaMin || fecha > fechaMaxReservable) return;

      fechas.push(fecha);
    });
  }

  const fechasTexto = unirFechasLegibles(
    fechas
      .sort((a, b) => a.getTime() - b.getTime())
      .map((fecha) => formatearFechaCorta(fecha)),
  );

  if (!fechasTexto) return "";

  return `Agenda disponible solo para ${fechasTexto}`;
}

export default function TurnosPanel({ servicio }) {
  const { user, loading: authLoading } = useAuth();

  const [agenda, setAgenda] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reservasConfig, setReservasConfig] = useState(
    getReservasConfigDefault(),
  );
  const [socialConfig, setSocialConfig] = useState({ whatsappContacto: "" });

  const [fechaSeleccionada, setFechaSeleccionada] = useState(() =>
    getFechaMinReservable(servicio),
  );
  const [slotSeleccionado, setSlotSeleccionado] = useState(null);
  const [turnosPackSeleccionados, setTurnosPackSeleccionados] = useState([]);
  const resumenTurnoRef = useRef(null);
  const [itemsSeleccionados, setItemsSeleccionados] = useState([]);
  const [loadingReserva, setLoadingReserva] = useState(false);

  const fn = httpsCallable(getFunctions(), "crearTurnoInteligente");
  const itemsPrecioVariable = Array.isArray(servicio?.itemsPrecioVariable)
    ? servicio.itemsPrecioVariable.filter(
        (item) => item?.activo !== false && Number(item?.monto || 0) > 0,
      )
    : [];
  const precioVariableModo =
    servicio?.precioVariableModo === "single" ? "single" : "multiple";
  const itemsVariablesSeleccionados = itemsPrecioVariable.filter((item) =>
    itemsSeleccionados.includes(String(item?.nombre || "")),
  );
  const ajusteServicio = itemsVariablesSeleccionados.reduce(
    (acc, item) => acc + Math.max(0, parseAmount(item?.monto || 0)),
    0,
  );
  const precioBaseServicio = Math.max(0, parseAmount(servicio?.precio || 0));

  const pricingTurno = calcularMontosTurno({
    precioServicio: parseAmount(servicio?.precio || 0),
    ajusteServicio,
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
  const montoReservaManual = montoAnticipoServicio;
  const saldoPendiente = Math.max(0, precioTotal - montoAnticipo);
  const requiereAnticipoTurno = montoAnticipoServicio > 0;
  const tieneComisionTurno = comisionTurno > 0;
  const precioEfectivoBase = getPrecioEfectivo(servicio);
  const precioEfectivo =
    precioEfectivoBase > 0 ? precioEfectivoBase + ajusteServicio : 0;
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
  const esPackServicio = Boolean(servicio?.esPack);
  const packCantidadTurnos = esPackServicio
    ? Math.max(2, Number(servicio?.packCantidadTurnos || 2))
    : 1;
  const packFrecuenciaDias = esPackServicio
    ? Math.max(1, Number(servicio?.packFrecuenciaDias || 7))
    : 0;
  const usaCargoReservaOnline =
    tieneComisionTurno && (servicio?.tipoAnticipo || "online") === "online";
  const porcentajeAnticipoServicio = servicio?.pedirAnticipo
    ? parseAmount(servicio?.porcentajeAnticipo || 0)
    : 0;
  const anticipoEsTotal =
    Boolean(servicio?.pedirAnticipo) && porcentajeAnticipoServicio >= 100;

  const requierePagoOnline = usaCargoReservaOnline && !esReservaManual;
  const valorTotalAbonandoEfectivo =
    precioEfectivo > 0
      ? precioEfectivo + (usaCargoReservaOnline ? comisionTurno : 0)
      : 0;
  const ahorroTotalEfectivo = Math.max(
    0,
    precioTotal - valorTotalAbonandoEfectivo,
  );
  const agendaEs24Horas =
    Math.max(1, Number(servicio?.agendaMaxDias || 7)) <= 1;
  const limiteReservableMs = getLimiteReservableMs(servicio);
  const fechaMinReservable = getFechaMinReservable(servicio);
  const fechaMaxReservable = getFechaMaxReservableReal(
    servicio,
    getFechaMaxReservable(servicio),
  );
  const agendaMensualTexto = getFechasAgendaMensualTexto(
    servicio,
    fechaMinReservable,
    fechaMaxReservable,
  );

  useEffect(() => {
    setItemsSeleccionados([]);
    setTurnosPackSeleccionados([]);
    setSlotSeleccionado(null);
  }, [servicio?.id]);

  useEffect(() => {
    if (fechaSeleccionada >= fechaMinReservable) return;

    const nuevaFecha = new Date(fechaMinReservable);
    nuevaFecha.setHours(0, 0, 0, 0);
    setFechaSeleccionada(nuevaFecha);
    setSlotSeleccionado(null);
  }, [fechaSeleccionada, fechaMinReservable]);

  function toggleItemVariable(nombre) {
    setItemsSeleccionados((prev) => {
      const yaSeleccionado = prev.includes(nombre);

      if (precioVariableModo === "single") {
        return yaSeleccionado ? [] : [nombre];
      }

      return yaSeleccionado
        ? prev.filter((item) => item !== nombre)
        : [...prev, nombre];
    });
  }

  useEffect(() => {
    if (!user || !servicio?.id) return;

    const intent = readPendingLoginAction();
    if (
      !intent ||
      intent.tipo !== "turno" ||
      intent.servicioId !== servicio.id
    ) {
      return;
    }

    if (!intent.fechaSeleccionada) return;

    const [year, month, day] = String(intent.fechaSeleccionada)
      .split("-")
      .map(Number);

    if (!year || !month || !day) return;

    const restoredDate = new Date(year, month - 1, day);
    restoredDate.setHours(0, 0, 0, 0);
    setFechaSeleccionada(restoredDate);
  }, [user, servicio?.id]);

  useEffect(() => {
    let cancelled = false;

    async function cargarReservasConfig() {
      try {
        const snap = await getDoc(doc(db, "configuracion", "reservas"));
        if (!cancelled) {
          setReservasConfig(
            snap.exists()
              ? { ...getReservasConfigDefault(), ...snap.data() }
              : getReservasConfigDefault(),
          );
        }
      } catch (error) {
        console.error("Error cargando reglas de reserva", error);
        if (!cancelled) setReservasConfig(getReservasConfigDefault());
      }
    }

    void cargarReservasConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function cargarSocialConfig() {
      try {
        const snap = await getDoc(doc(db, "configuracion", "social"));
        if (!cancelled) {
          setSocialConfig(
            snap.exists()
              ? { whatsappContacto: snap.data()?.whatsappContacto || "" }
              : { whatsappContacto: "" },
          );
        }
      } catch (error) {
        console.error("Error cargando contacto de WhatsApp", error);
        if (!cancelled) {
          setSocialConfig({ whatsappContacto: "" });
        }
      }
    }

    void cargarSocialConfig();

    return () => {
      cancelled = true;
    };
  }, []);

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
        const { fechaDesde, fechaHasta } = getMonthRange(
          fechaSeleccionada,
          fechaMaxReservable,
        );

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
    fechaMaxReservable.getTime(),
  ]);

  useEffect(() => {
    if (!agenda) return;

    const dias = generarDiasDelMes(
      fechaSeleccionada,
      fechaMaxReservable,
      fechaMinReservable,
    );
    if (!dias.length) return;

    const fechaActualKey = toISODateLocal(fechaSeleccionada);

    const diaActual = dias.find((d) => toISODateLocal(d) === fechaActualKey);
    const primerDisponible = buscarPrimerDiaDisponible(
      dias,
      agenda,
      servicio,
      fechaMaxReservable,
      limiteReservableMs,
      reservasConfig,
    );

    if (!primerDisponible) return;

    const diaActualTieneDisponibilidad = diaActual
      ? generarSlotsDia(agenda, servicio, diaActual).some(
          (s) =>
            !s.ocupado &&
            cumpleReglaAnticipacionManana(s.inicio, reservasConfig, servicio) &&
            slotDentroDeVentanaAgenda(s, limiteReservableMs),
        )
      : false;

    if (!diaActualTieneDisponibilidad) {
      const nuevaFecha = new Date(primerDisponible);
      nuevaFecha.setHours(0, 0, 0, 0);

      if (toISODateLocal(nuevaFecha) !== fechaActualKey) {
        setFechaSeleccionada(nuevaFecha);
        setSlotSeleccionado(null);
      }
    }
  }, [
    agenda,
    servicio,
    fechaSeleccionada,
    fechaMinReservable,
    fechaMaxReservable,
    limiteReservableMs,
    reservasConfig,
  ]);

  useEffect(() => {
    if (!user || !agenda || !servicio?.id) return;

    const intent = readPendingLoginAction();
    if (
      !intent ||
      intent.tipo !== "turno" ||
      intent.servicioId !== servicio.id
    ) {
      return;
    }

    if (intent.fechaSeleccionada !== toISODateLocal(fechaSeleccionada)) return;

    const slotIntent = intent.slotSeleccionado || {};
    const slotsDelDia = generarSlotsDia(agenda, servicio, fechaSeleccionada);
    const slotRestaurado = slotsDelDia.find(
      (slot) =>
        !slot.ocupado &&
        Number(slot.inicio) === Number(slotIntent.horaInicio) &&
        Number(slot.fin) === Number(slotIntent.horaFin),
    );

    if (!slotRestaurado) return;

    setSlotSeleccionado({
      ...slotRestaurado,
      fecha: toISODateLocal(fechaSeleccionada),
      horaInicio: slotRestaurado.inicio,
      horaFin: slotRestaurado.fin,
    });

    window.sessionStorage.removeItem("pendingLoginAction");
  }, [agenda, fechaSeleccionada, servicio, user]);

  useEffect(() => {
    if (!slotSeleccionado) return;
    if (typeof window === "undefined") return;
    if (window.innerWidth > 992) return;

    const timer = window.setTimeout(() => {
      resumenTurnoRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 160);

    return () => window.clearTimeout(timer);
  }, [slotSeleccionado]);

  function cambiarMes(offset) {
    const nueva = startOfDay(fechaSeleccionada);
    nueva.setDate(1);
    nueva.setMonth(nueva.getMonth() + offset);
    nueva.setHours(0, 0, 0, 0);
    setFechaSeleccionada(nueva);
    setSlotSeleccionado(null);
  }

  function ordenarTurnosPack(lista = []) {
    return [...lista].sort(
      (a, b) => Number(a?.horaInicio || 0) - Number(b?.horaInicio || 0),
    );
  }

  function getPrimerSlotDisponible(fechaObjetivo) {
    if (!agenda || !fechaObjetivo) return null;

    const slotsDia = generarSlotsDia(agenda, servicio, fechaObjetivo).filter(
      (slot) =>
        !slot.ocupado &&
        cumpleReglaAnticipacionManana(slot.inicio, reservasConfig, servicio) &&
        slotDentroDeVentanaAgenda(slot, limiteReservableMs),
    );

    const primerSlot = slotsDia[0];
    if (!primerSlot) return null;

    return {
      ...primerSlot,
      fecha: toISODateLocal(fechaObjetivo),
      horaInicio: primerSlot.inicio,
      horaFin: primerSlot.fin,
    };
  }

  async function agregarSesionPack() {
    if (!slotSeleccionado) return;

    const yaExiste = turnosPackSeleccionados.some(
      (item) =>
        Number(item?.horaInicio || 0) === Number(slotSeleccionado?.horaInicio),
    );
    if (yaExiste) {
      void Swal.fire({
        icon: "warning",
        title: "Sesion ya agregada",
        text: "Ese turno ya fue sumado al pack.",
      });
      return;
    }

    if (turnosPackSeleccionados.length >= packCantidadTurnos) {
      void Swal.fire({
        icon: "warning",
        title: "Pack completo",
        text: `Ya seleccionaste las ${packCantidadTurnos} sesiones del pack.`,
      });
      return;
    }

    if (turnosPackSeleccionados.length > 0) {
      const ordenadosActuales = ordenarTurnosPack(turnosPackSeleccionados);
      const ultimoTurno = ordenadosActuales[ordenadosActuales.length - 1];
      const ultimoDia = startOfDay(
        new Date(Number(ultimoTurno?.horaInicio || 0)),
      );
      const nuevoDia = startOfDay(
        new Date(Number(slotSeleccionado?.horaInicio || 0)),
      );
      const diferenciaDias = Math.floor(
        (nuevoDia.getTime() - ultimoDia.getTime()) / (24 * 60 * 60 * 1000),
      );

      if (
        !Number.isNaN(diferenciaDias) &&
        diferenciaDias > 0 &&
        diferenciaDias < packFrecuenciaDias
      ) {
        const confirmacion = await Swal.fire({
          icon: "warning",
          title: "Frecuencia menor a la recomendada",
          text: "¿Desea anadir un turno con menos de la frecuencia sugerida?",
          showCancelButton: true,
          confirmButtonText: "Si, anadir igual",
          cancelButtonText: "Volver",
          customClass: {
            popup: "swal-popup-custom",
            confirmButton: "swal-btn-confirm",
            cancelButton: "swal-btn-cancel",
          },
          buttonsStyling: false,
          reverseButtons: true,
        });

        if (!confirmacion.isConfirmed) {
          return;
        }
      }
    }

    const nuevosTurnosPack = ordenarTurnosPack([
      ...turnosPackSeleccionados,
      {
        ...slotSeleccionado,
        fecha: slotSeleccionado.fecha || toISODateLocal(fechaSeleccionada),
      },
    ]);

    setTurnosPackSeleccionados(nuevosTurnosPack);

    let slotSiguiente = null;
    const indiceSiguiente = nuevosTurnosPack.length;
    if (indiceSiguiente < packCantidadTurnos) {
      const basePack = startOfDay(
        new Date(Number(nuevosTurnosPack[0]?.horaInicio || 0)),
      );
      if (!Number.isNaN(basePack.getTime())) {
        const proximaSugerida = sumarDiasDate(
          basePack,
          indiceSiguiente * packFrecuenciaDias,
        );
        if (
          proximaSugerida >= fechaMinReservable &&
          proximaSugerida <= fechaMaxReservable
        ) {
          setFechaSeleccionada(proximaSugerida);
          slotSiguiente = getPrimerSlotDisponible(proximaSugerida);
        }
      }
    }

    setSlotSeleccionado(slotSiguiente);
  }

  function quitarSesionPack(index) {
    setTurnosPackSeleccionados((prev) =>
      prev.filter((_, itemIndex) => itemIndex !== index),
    );
  }

  async function refrescarAgendaActual() {
    const gabineteIds = (servicio?.gabinetes || [])
      .map((g) => (typeof g === "string" ? g : g?.id))
      .filter((id) => typeof id === "string" && id.trim() !== "");
    if (!gabineteIds.length) return;

    const getAgendaFn = httpsCallable(getFunctions(), "getAgendaGabinete");
    const { fechaDesde, fechaHasta } = getMonthRange(
      fechaSeleccionada,
      fechaMaxReservable,
    );
    const resultAgenda = await getAgendaFn({
      gabineteIds,
      fechaDesde,
      fechaHasta,
    });
    setAgenda(resultAgenda.data || null);
  }

  async function reservarTurno(metodoPagoSolicitado = null, options = {}) {
    const slotObjetivo = options?.slot || slotSeleccionado;
    if (!slotObjetivo) return null;

    const fecha =
      options?.fecha || slotObjetivo.fecha || toISODateLocal(fechaSeleccionada);
    const mostrarMensajes = options?.mostrarMensajes !== false;
    try {
      if (Number(slotObjetivo.horaInicio) > limiteReservableMs) {
        await Swal.fire({
          icon: "warning",
          title: "Fuera de agenda",
          text: `Este servicio permite reservar hasta el ${formatearFechaHora(
            limiteReservableMs,
          )}.`,
        });
        return;
      }

      setLoadingReserva(true);

      const inicio = slotObjetivo.horaInicio;
      const fin = slotObjetivo.horaFin;

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
        precioVariableItemsSeleccionados: itemsVariablesSeleccionados.map(
          (item) => ({
            nombre: String(item?.nombre || "").trim(),
            monto: Math.max(0, Number(item?.monto || 0)),
          }),
        ),
      });

      if (servicio.modoReserva === "reserva" && mostrarMensajes) {
        const fechaTurno = new Date(slotObjetivo.horaInicio).toLocaleDateString(
          "es-AR",
          {
            weekday: "long",
            day: "numeric",
            month: "long",
          },
        );

        const horaDesde = new Date(slotObjetivo.horaInicio).toLocaleTimeString(
          "es-AR",
          {
            hour: "2-digit",
            minute: "2-digit",
          },
        );

        const horaHasta = new Date(slotObjetivo.horaFin).toLocaleTimeString(
          "es-AR",
          {
            hour: "2-digit",
            minute: "2-digit",
          },
        );

        await Swal.fire({
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
                      Espera la confirmación por WhatsApp antes de transferir la seña. Una vez confirmado, el saldo restante se abona el dia del turno.
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

      if (options?.limpiarSeleccion !== false) {
        setSlotSeleccionado(null);
      }

      if (options?.refrescarAgenda !== false) {
        await refrescarAgendaActual();
      }

      if (
        mostrarMensajes &&
        servicio.modoReserva !== "reserva" &&
        metodoPagoSolicitado !== "mercadopago"
      ) {
        const result = await swalTurnoConfirmado({
          html: `
            <p style="text-align:center;font-size:15px;">
              Tu turno fue confirmado correctamente.
            </p>
            <p style="text-align:center;color:#555;">
              Podes verlo en Mis turnos o seguir agendando desde esta pantalla.
            </p>
          `,
        });

        if (result.isConfirmed) {
          window.location.assign("/mis-turnos");
          return res?.data;
        }
      }

      return res?.data;
    } catch (err) {
      console.error("Error reservando turno:", err);
      if (!mostrarMensajes) {
        throw err;
      }
      const alertConfig = getReservaErrorAlert(err);
      hideLoading();

      await Swal.fire({
        icon: alertConfig.icon,
        title: alertConfig.title,
        text: alertConfig.text,
        confirmButtonText: "Entendido",
        customClass: {
          popup: "swal-popup-custom",
          confirmButton: "swal-btn-confirm",
        },
        buttonsStyling: false,
      });
    } finally {
      setLoadingReserva(false);
    }
  }

  async function handleReservaManual() {
    const data = await reservarTurno("manual");
    if (!data?.turnoId) return;

    const nombreUsuario = String(
      user?.apodo || user?.nombre || user?.displayName || "",
    ).trim();
    const saludo = nombreUsuario ? `Hola, soy ${nombreUsuario}.` : "Hola!";

    const mensaje = `
${saludo}
Me gustaria reservar el siguiente turno:

Servicio: ${servicio.nombreServicio}
Fecha: ${fechaFormateada}
Horario: ${horaInicioFormateada} - ${horaFinFormateada}
`;

    const whatsappUrl = getWhatsappUrl(socialConfig?.whatsappContacto, mensaje);
    if (whatsappUrl) {
      window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    }
  }

  async function handleReservaAutomaticaMP() {
    const data = await reservarTurno("mercadopago");
    if (!data?.turnoId) return;

    try {
      const iniciarPagoFn = httpsCallable(getFunctions(), "iniciarPagoTurnoMP");

      const pago = await iniciarPagoFn({
        turnoId: data.turnoId,
        frontOrigin: window.location.origin,
      });

      if (pago?.data?.init_point) {
        localStorage.setItem("pagoInitPointEnProceso", pago.data.init_point);
        window.location.href = pago.data.init_point;
        return;
      }

      throw new Error("No se pudo obtener el enlace de pago.");
    } catch (err) {
      console.error("Error iniciando pago con Mercado Pago:", err);
      const alertConfig = getReservaErrorAlert(err);

      await Swal.fire({
        icon: alertConfig.icon,
        title: alertConfig.title,
        text:
          alertConfig.text ===
          "Ocurrio un problema inesperado al reservar. Por favor, comunicate con un administrador."
            ? "No se pudo iniciar el pago con Mercado Pago. Intenta nuevamente en unos minutos."
            : alertConfig.text,
        confirmButtonText: "Entendido",
        customClass: {
          popup: "swal-popup-custom",
          confirmButton: "swal-btn-confirm",
        },
        buttonsStyling: false,
      });
    }
  }

  async function handleReservaPack() {
    if (!esPackServicio) return;

    const turnosPackOrdenados = ordenarTurnosPack(turnosPackSeleccionados);
    if (turnosPackOrdenados.length !== packCantidadTurnos) {
      await Swal.fire({
        icon: "warning",
        title: "Faltan sesiones",
        text: `Selecciona ${packCantidadTurnos} turnos para continuar con el pack.`,
      });
      return;
    }

    try {
      showLoading({
        title: "Reservando pack",
        text: "Estamos registrando todas las sesiones elegidas...",
      });

      const turnoIdsReservados = [];
      for (const turnoPack of turnosPackOrdenados) {
        const metodo = requierePagoOnline
          ? "mercadopago"
          : servicio.modoReserva === "reserva"
            ? "manual"
            : (servicio?.tipoAnticipo || "online") === "manual"
              ? "manual"
              : null;

        let reservado = null;
        try {
          reservado = await reservarTurno(metodo, {
            slot: turnoPack,
            fecha: turnoPack.fecha,
            mostrarMensajes: false,
            limpiarSeleccion: false,
            refrescarAgenda: false,
          });
        } catch (err) {
          const fechaOcupada = startOfDay(
            new Date(Number(turnoPack?.horaInicio || 0)),
          );
          let sugerido = null;
          if (!Number.isNaN(fechaOcupada.getTime())) {
            setFechaSeleccionada(fechaOcupada);
            sugerido = getPrimerSlotDisponible(fechaOcupada);
            setSlotSeleccionado(sugerido);
          } else {
            setSlotSeleccionado(null);
          }

          setTurnosPackSeleccionados((prev) =>
            ordenarTurnosPack(
              prev.filter(
                (t) =>
                  !(
                    Number(t?.horaInicio || 0) ===
                      Number(turnoPack?.horaInicio || 0) &&
                    Number(t?.horaFin || 0) === Number(turnoPack?.horaFin || 0)
                  ),
              ),
            ),
          );

          const horarioAReemplazar = formatearSlotPackLabel(
            turnoPack?.horaInicio,
          );
          const sugerenciaHorario = sugerido
            ? formatearSlotPackLabel(sugerido.horaInicio)
            : "Sin horarios libres ese dia";
          const detalle = getReservaErrorMessage(err);

          await Swal.fire({
            icon: "warning",
            title: "Horario no disponible",
            html: `
              <div class="swal-pack-conflict">
                <div class="swal-pack-conflict-head">
                  <span class="swal-pack-conflict-pill">Ajuste de agenda</span>
                  <p>Este horario se ocupo mientras confirmabas el pack.</p>
                </div>
                <div class="swal-pack-conflict-grid">
                  <div class="swal-pack-conflict-item">
                    <span>Horario a reemplazar</span>
                    <strong>${horarioAReemplazar}</strong>
                  </div>
                  <div class="swal-pack-conflict-item">
                    <span>Sugerido</span>
                    <strong>${sugerenciaHorario}</strong>
                  </div>
                </div>
                <div class="swal-pack-conflict-note">${detalle}</div>
              </div>
            `,
            confirmButtonText: "Elegir nuevo horario",
            customClass: {
              popup: "swal-popup-custom",
              confirmButton: "swal-btn-confirm",
            },
            buttonsStyling: false,
          });
          return;
        }

        if (!reservado?.turnoId) {
          throw new Error("No se pudo confirmar una de las sesiones del pack.");
        }

        turnoIdsReservados.push(reservado.turnoId);
      }

      if (requierePagoOnline) {
        const iniciarPagoFn = httpsCallable(
          getFunctions(),
          "iniciarPagoTurnoMP",
        );
        const pago = await iniciarPagoFn({
          turnoIds: turnoIdsReservados,
          frontOrigin: window.location.origin,
        });

        if (pago?.data?.init_point) {
          if (pago?.data?.pagoId) {
            localStorage.setItem("pagoIdEnProceso", String(pago.data.pagoId));
          }
          localStorage.setItem("pagoInitPointEnProceso", pago.data.init_point);
          window.location.href = pago.data.init_point;
          return;
        }

        throw new Error("No se pudo obtener el enlace de pago del pack.");
      }

      await refrescarAgendaActual();

      setTurnosPackSeleccionados([]);
      setSlotSeleccionado(null);

      await swalTurnoConfirmado({
        html: `
          <p style="text-align:center;font-size:15px;">
            Tu pack fue reservado correctamente.
          </p>
          <p style="text-align:center;color:#555;">
            Se registraron ${packCantidadTurnos} turnos para este servicio.
          </p>
        `,
      });
    } catch (error) {
      console.error("Error reservando pack:", error);
      const alertConfig = getReservaErrorAlert(error);
      await Swal.fire({
        icon: alertConfig.icon,
        title: alertConfig.title,
        text: alertConfig.text,
        confirmButtonText: "Entendido",
        customClass: {
          popup: "swal-popup-custom",
          confirmButton: "swal-btn-confirm",
        },
        buttonsStyling: false,
      });
    } finally {
      hideLoading();
    }
  }

  async function handleConfirmacion() {
    if (authLoading) return;

    if (!user) {
      await swalRequiereLogin({
        tipo: "turno",
        servicioId: servicio.id,
        categoriaId: servicio.categoriaId || null,
        fechaSeleccionada: toISODateLocal(fechaSeleccionada),
        slotSeleccionado: {
          horaInicio: slotSeleccionado?.horaInicio,
          horaFin: slotSeleccionado?.horaFin,
        },
      });
      return;
    }

    if (esPackServicio) {
      const turnosPackOrdenados = ordenarTurnosPack(turnosPackSeleccionados);
      if (turnosPackOrdenados.length !== packCantidadTurnos) {
        await Swal.fire({
          icon: "warning",
          title: "Completa el pack",
          text: `Debes elegir ${packCantidadTurnos} turnos para continuar.`,
        });
        return;
      }

      const resumenPack = await Swal.fire({
        title: "Confirmar selección",
        width: 560,
        html: `
          <div class="swal-pack-summary">
            <div class="swal-pack-summary-top">
              <div class="swal-pack-badge">Pack de turnos</div>
              <h4>${servicio.nombreServicio}</h4>
            </div>
            <div class="swal-pack-summary-grid">
              <div class="swal-pack-summary-item">
                <span>Sesiones</span>
                <strong>${packCantidadTurnos}</strong>
              </div>
              <div class="swal-pack-summary-item">
                <span>Frecuencia recomendada</span>
                <strong>Cada ${packFrecuenciaDias} día${packFrecuenciaDias > 1 ? "s" : ""}</strong>
              </div>
              <div class="swal-pack-summary-item">
                <span>Total estimado</span>
                <strong>$${(precioTotal * packCantidadTurnos).toLocaleString("es-AR")}</strong>
              </div>
            </div>
            <div class="swal-pack-turnos-list">
              ${turnosPackOrdenados
                .map(
                  (turnoPack, index) => `
                    <div class="swal-pack-turno-row">
                      <span>Sesion ${index + 1}</span>
                      <b>${new Date(turnoPack.horaInicio).toLocaleDateString(
                        "es-AR",
                        {
                          weekday: "short",
                          day: "2-digit",
                          month: "2-digit",
                        },
                      )} ${new Date(turnoPack.horaInicio).toLocaleTimeString(
                        "es-AR",
                        {
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}</b>
                    </div>
                  `,
                )
                .join("")}
            </div>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: "Confirmar pack",
        cancelButtonText: "Volver",
        customClass: {
          popup: "swal-popup-custom",
          confirmButton: "swal-btn-confirm",
          cancelButton: "swal-btn-cancel",
        },
        buttonsStyling: false,
        reverseButtons: true,
      });

      if (!resumenPack.isConfirmed) return;
      await handleReservaPack();
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
      precioBase: precioBaseServicio,
      montoExtras: ajusteServicio,
      comision: comisionTurno,
      precioAnticipo:
        (esReservaManual ? montoReservaManual : montoAnticipo) || null,
      itemsPrecioVariable: itemsVariablesSeleccionados,
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

  const sugerenciasPack = useMemo(() => {
    if (!esPackServicio) return [];

    const fechaBase =
      turnosPackSeleccionados.length > 0
        ? startOfDay(
            new Date(Number(turnosPackSeleccionados[0]?.horaInicio || 0)),
          )
        : slotSeleccionado?.horaInicio
          ? startOfDay(new Date(Number(slotSeleccionado.horaInicio)))
          : null;

    if (!fechaBase || Number.isNaN(fechaBase.getTime())) return [];

    const inicioIndice = Math.max(0, turnosPackSeleccionados.length);
    const sugeridas = [];

    for (let index = inicioIndice; index < packCantidadTurnos; index += 1) {
      const fecha = sumarDiasDate(fechaBase, index * packFrecuenciaDias);
      if (fecha < fechaMinReservable || fecha > fechaMaxReservable) continue;
      sugeridas.push(fecha);
    }

    return sugeridas;
  }, [
    esPackServicio,
    turnosPackSeleccionados,
    slotSeleccionado,
    packCantidadTurnos,
    packFrecuenciaDias,
    fechaMinReservable,
    fechaMaxReservable,
  ]);

  const sugerenciasPackSet = useMemo(
    () => new Set(sugerenciasPack.map((fecha) => toISODateLocal(fecha))),
    [sugerenciasPack],
  );

  const sugerenciasPackTexto = useMemo(() => {
    if (!sugerenciasPack.length) return "";
    return unirFechasLegibles(
      sugerenciasPack.map((fecha) =>
        fecha.toLocaleDateString("es-AR", {
          weekday: "short",
          day: "2-digit",
          month: "2-digit",
        }),
      ),
    );
  }, [sugerenciasPack]);

  if (loading)
    return (
      <div className="agenda-loading-shell agenda-loading-shell-panel">
        <span
          className="spinner-border agenda-loading-spinner"
          aria-hidden="true"
        />
        <p className="agenda-loading-text">Cargando agenda...</p>
      </div>
    );
  if (!agenda) return null;

  const dias = generarDiasDelMes(
    fechaSeleccionada,
    fechaMaxReservable,
    fechaMinReservable,
  );
  const slots =
    fechaSeleccionada < fechaMinReservable ||
    fechaSeleccionada > fechaMaxReservable
      ? []
      : generarSlotsDia(agenda, servicio, fechaSeleccionada).filter(
          (slot) =>
            cumpleReglaAnticipacionManana(
              slot.inicio,
              reservasConfig,
              servicio,
            ) && slotDentroDeVentanaAgenda(slot, limiteReservableMs),
        );

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
  const slotPackConfirmLabel = slotSeleccionado
    ? (() => {
        const fechaObj = new Date(slotSeleccionado.horaInicio);
        const weekday = fechaObj
          .toLocaleDateString("es-AR", { weekday: "short" })
          .replace(".", "");
        const weekdayTitle =
          weekday.charAt(0).toUpperCase() + weekday.slice(1).toLowerCase();
        const fecha = fechaObj.toLocaleDateString("es-AR", {
          day: "2-digit",
          month: "2-digit",
        });
        const hora = fechaObj.toLocaleTimeString("es-AR", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
        const horaCompacta = hora.endsWith(":00")
          ? `${hora.slice(0, 2)}hs`
          : `${hora}hs`;
        return `${weekdayTitle} ${fecha} - ${horaCompacta}`;
      })()
    : "";

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const primerDiaMesActual = new Date(
    fechaMinReservable.getFullYear(),
    fechaMinReservable.getMonth(),
    1,
  );

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
  const turnosPackOrdenados = ordenarTurnosPack(turnosPackSeleccionados);
  const packCompleto = turnosPackOrdenados.length === packCantidadTurnos;
  const mostrarResumenCompletoTurno = !esPackServicio || packCompleto;
  const packTurnosSeleccionados = turnosPackOrdenados.length;
  const packTurnosRestantes = Math.max(
    0,
    packCantidadTurnos - packTurnosSeleccionados,
  );
  const packProgressPct = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (packTurnosSeleccionados / Math.max(1, packCantidadTurnos)) * 100,
      ),
    ),
  );
  const proximaSugerenciaPack =
    sugerenciasPack[packTurnosSeleccionados] || null;
  const proximaSugerenciaPackTexto = proximaSugerenciaPack
    ? proximaSugerenciaPack.toLocaleDateString("es-AR", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
      })
    : "";
  const fechasPackAnadidasTexto = unirFechasLegibles(
    turnosPackOrdenados.map((turnoPack) =>
      new Date(Number(turnoPack?.horaInicio || 0)).toLocaleDateString("es-AR", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
      }),
    ),
  );

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
        {agendaEs24Horas ? (
          <small className="agenda-disponibilidad">
            <b>Agenda de 24 hs</b>
          </small>
        ) : agendaMensualTexto ? (
          <small className="agenda-disponibilidad">
            <b>{agendaMensualTexto}</b>
          </small>
        ) : fechaMinReservable > hoy ? (
          <small className="agenda-disponibilidad">
            Agenda disponible desde el{" "}
            <b>{formatearSoloFecha(endOfDay(fechaMinReservable))}</b>
          </small>
        ) : (
          <small className="agenda-disponibilidad">
            Agenda abierta hasta el{" "}
            <b>{formatearSoloFecha(endOfDay(fechaMaxReservable))}</b>
          </small>
        )}
      </div>

      {agendaEs24Horas && (
        <div className="agenda-24hs-note">
          En agendas de 24 hs, a partir de las 18:00 se habilitan horarios del
          dia siguiente. Si ese dia no tiene disponibilidad, te mostramos el
          proximo con turnos libres.
        </div>
      )}

      <h5 className="agenda-titulo">
        <b>{servicio.nombreServicio.toUpperCase()}</b>
      </h5>

      {esPackServicio && (
        <div className="agenda-pack-hint">
          <div className="agenda-pack-hint-top">
            <span className="agenda-pack-chip">PACK</span>
            <strong>
              {packCantidadTurnos} sesiones cada {packFrecuenciaDias} día
              {packFrecuenciaDias > 1 ? "s" : ""}
            </strong>
            <span className="agenda-pack-progress-label">
              {packTurnosSeleccionados}/{packCantidadTurnos}
            </span>
          </div>
          <div className="agenda-pack-progress" aria-hidden="true">
            <span style={{ width: `${packProgressPct}%` }} />
          </div>
          <div className="agenda-pack-steps" aria-hidden="true">
            {Array.from({ length: packCantidadTurnos }).map((_, index) => {
              const isDone = index < packTurnosSeleccionados;
              const isCurrent =
                index === packTurnosSeleccionados && !packCompleto;
              return (
                <span
                  key={`pack-step-${index}`}
                  className={`agenda-pack-step ${isDone ? "done" : ""} ${
                    isCurrent ? "current" : ""
                  }`}
                >
                  {index + 1}
                </span>
              );
            })}
          </div>
          {fechasPackAnadidasTexto ? (
            <div className="agenda-pack-hint-sub">
              Fechas agregadas: <b>{fechasPackAnadidasTexto}</b>
            </div>
          ) : null}
          {!packCompleto && proximaSugerenciaPackTexto ? (
            <div className="agenda-pack-hint-sub">
              Siguiente sugerida: <b>{proximaSugerenciaPackTexto}</b>
            </div>
          ) : null}
          {sugerenciasPackTexto ? (
            <div className="agenda-pack-hint-sub">
              Fechas recomendadas: <b>{sugerenciasPackTexto}</b>
            </div>
          ) : null}
        </div>
      )}

      {itemsPrecioVariable.length > 0 && (
        <div className="agenda-variable-box">
          <div className="agenda-variable-title">Personaliza tu servicio</div>
          <div className="agenda-variable-hint">
            {precioVariableModo === "single"
              ? "Podes elegir un solo adicional."
              : "Podes elegir uno o varios adicionales."}
          </div>
          <div className="agenda-variable-list">
            {itemsPrecioVariable.map((item) => {
              const nombre = String(item?.nombre || "").trim();
              const activo = itemsSeleccionados.includes(nombre);

              return (
                <label
                  key={`item-turno-${nombre}`}
                  className={`agenda-variable-item ${activo ? "activo" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={activo}
                    onChange={() => toggleItemVariable(nombre)}
                  />
                  <span>{nombre}</span>
                  <strong>
                    +${Number(item?.monto || 0).toLocaleString("es-AR")}
                  </strong>
                </label>
              );
            })}
          </div>
          <div className="agenda-variable-total">
            Total pagando con transferencia:{" "}
            <strong>${precioServicio.toLocaleString("es-AR")}</strong>
          </div>
        </div>
      )}
      {precioEfectivo > 0 &&
        (!esPackServicio || packCompleto) &&
        !(requierePagoOnline && anticipoEsTotal) && (
          <div className="agenda-cash-note">
            {requierePagoOnline ? (
              <div className="agenda-cash-copy">
                {saldoServicioEfectivo <= 0 &&
                saldoServicioTransferencia <= 0 ? (
                  <div>Se abona completamente al momento de la reserva.</div>
                ) : (
                  <>
                    <div>
                      Seña para confirmar el turno:{" "}
                      <strong>${montoAnticipo.toLocaleString("es-AR")}</strong>.
                    </div>
                    {saldoServicioEfectivo > 0 && (
                      <div>
                        El día del turno podes abonar lo restante en efectivo
                        por{" "}
                        <strong>
                          ${saldoServicioEfectivo.toLocaleString("es-AR")}
                        </strong>{" "}
                        {ahorroEfectivo > 0 ? (
                          <>
                            (
                            <strong>
                              ${ahorroEfectivo.toLocaleString("es-AR")}
                            </strong>{" "}
                            de ahorro)
                          </>
                        ) : null}
                        .
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="agenda-cash-copy">
                <div>
                  Precio total abonando en efectivo:{" "}
                  <strong>
                    ${valorTotalAbonandoEfectivo.toLocaleString("es-AR")}
                  </strong>
                  {ahorroTotalEfectivo > 0 ? (
                    <>
                      {" "}
                      (
                      <strong>
                        ${ahorroTotalEfectivo.toLocaleString("es-AR")}
                      </strong>{" "}
                      de ahorro)
                    </>
                  ) : null}
                  .
                </div>
              </div>
            )}
          </div>
        )}

      <div className="agenda-month-nav d-flex justify-content-between align-items-center mb-3 mt-4">
        <div className="text-center mb-2"></div>
        <button
          type="button"
          className="agenda-month-btn agenda-month-btn-prev btn btn-outline-secondary btn-sm"
          onClick={() => cambiarMes(-1)}
          disabled={!puedeIrMesAnterior}
        >
          <span className="agenda-month-btn-arrow" aria-hidden="true">
            {"‹"}
          </span>
          <span>Mes anterior</span>
        </button>

        <div className="agenda-month-label" style={{ fontWeight: 700 }}>
          {fechaSeleccionada.toLocaleDateString("es-AR", {
            month: "long",
            year: "numeric",
          })}
        </div>

        <button
          type="button"
          className="agenda-month-btn agenda-month-btn-next btn btn-outline-secondary btn-sm"
          onClick={() => cambiarMes(1)}
          disabled={!puedeIrMesSiguiente}
        >
          <span>Mes siguiente</span>
          <span className="agenda-month-btn-arrow" aria-hidden="true">
            {"›"}
          </span>
        </button>
      </div>

      <div
        className={`calendario-horizontal ${
          dias.length <= 2 ? "calendario-horizontal-compact" : ""
        }`}
      >
        {dias.map((d) => {
          const activo = d.toDateString() === fechaSeleccionada.toDateString();
          const pasado = d < hoy;
          const fueraDeAgenda =
            d < fechaMinReservable || d > fechaMaxReservable;
          const diaSemana = d.getDay();

          const hayHorarioEseDia = agenda.horarios?.some(
            (h) => Number(h.diaSemana) === diaSemana,
          );

          const slotsDelDia = hayHorarioEseDia
            ? generarSlotsDia(agenda, servicio, d)
            : [];

          const tieneDisponibilidad =
            hayHorarioEseDia &&
            slotsDelDia.some(
              (s) =>
                !s.ocupado &&
                cumpleReglaAnticipacionManana(
                  s.inicio,
                  reservasConfig,
                  servicio,
                ) &&
                slotDentroDeVentanaAgenda(s, limiteReservableMs),
            );

          const deshabilitado = pasado || fueraDeAgenda || !tieneDisponibilidad;
          const esSugeridoPack = sugerenciasPackSet.has(toISODateLocal(d));

          return (
            <button
              key={d.toISOString()}
              disabled={deshabilitado}
              className={`dia-btn ${activo ? "activo" : ""} ${
                esSugeridoPack ? "pack-sugerido" : ""
              } ${deshabilitado ? "disabled" : ""}`}
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
        <div ref={resumenTurnoRef} className="resumen-turno mt-4 p-3 ">
          <h6 className="fw-bold mb-2">
            {esPackServicio && !packCompleto
              ? "¿Desea añadir este turno al pack?"
              : "Resumen del turno"}
          </h6>

          {mostrarResumenCompletoTurno && (
            <>
              <div className="resumen-turno-row">
                <strong>Servicio:</strong> {servicio.nombreServicio}
              </div>
              <div className="resumen-turno-row">
                <strong>Profesional:</strong> {servicio.nombreProfesional}
              </div>
            </>
          )}
          <div className="resumen-turno-row">
            <strong>Fecha:</strong> {fechaFormateada}
          </div>
          <div className="resumen-turno-row">
            <strong>Horario:</strong> {horaInicioFormateada} -{" "}
            {horaFinFormateada}
          </div>
          {mostrarResumenCompletoTurno ? (
            <div className="resumen-turno-row">
              <strong>Duración:</strong> {servicio.duracionMin} min
            </div>
          ) : (
            <div className="resumen-turno-meta-muted">
              Completa el pack para continuar
            </div>
          )}

          {mostrarResumenCompletoTurno && precioTotal > 0 && (
            <div className="resumen-turno-pricing">
              <div className="resumen-turno-row">
                <strong>Valor base del servicio:</strong> $
                {precioBaseServicio.toLocaleString("es-AR")}
              </div>
              {comisionTurno > 0 && (
                <div className="resumen-turno-row resumen-turno-row-muted">
                  <strong>Costo de servicio:</strong> $
                  {comisionTurno.toLocaleString("es-AR")}
                </div>
              )}
              {itemsVariablesSeleccionados.map((item) => (
                <div
                  key={`resumen-item-${item.nombre}`}
                  className="resumen-turno-row resumen-turno-row-muted"
                >
                  <strong>{item.nombre}:</strong> +$
                  {Number(item.monto || 0).toLocaleString("es-AR")}
                </div>
              ))}
              <div className="resumen-turno-row resumen-turno-total">
                <strong>
                  {requierePagoOnline ? "Total para señar" : "Total:"}
                </strong>{" "}
                ${precioTotal.toLocaleString("es-AR")}
              </div>
            </div>
          )}

          {mostrarResumenCompletoTurno && requierePagoOnline && (
            <div className="mb-3 mt-1">
              <span className="total-sena text-success fw-semibold">
                Pagas <b>${montoAnticipo.toLocaleString("es-AR")}</b>{" "}
                {requiereAnticipoTurno
                  ? "para confirmar el turno online."
                  : "de cargo de reserva para confirmar el turno online."}{" "}
                {montoAnticipo !== precioTotal && (
                  <span>El dia del servicio abonas el saldo restante.</span>
                )}
              </span>
            </div>
          )}

          {mostrarResumenCompletoTurno &&
            esReservaManual &&
            montoReservaManual > 0 && (
              <div className="mb-3 mt-1">
                <span className="total-sena text-success fw-semibold">
                  Este turno se solicita por WhatsApp. Reservas este servicio
                  con
                  <b> ${montoReservaManual.toLocaleString("es-AR")}</b>.
                </span>
                {comisionTurno > 0 && (
                  <div className="resumen-turno-meta-muted">
                    El costo de servicio se suma al total y se abona al pagar el
                    turno.
                  </div>
                )}
              </div>
            )}

          {mostrarResumenCompletoTurno &&
            esReservaManual &&
            montoReservaManual <= 0 && (
              <div className="mb-3 mt-1">
                <span className="total-sena text-success fw-semibold">
                  Reserva gratis. Este turno se confirma por WhatsApp.
                </span>
                {comisionTurno > 0 && (
                  <div className="resumen-turno-meta-muted">
                    El costo de servicio se suma al total y se abona al pagar el
                    turno.
                  </div>
                )}
              </div>
            )}

          {esPackServicio ? (
            <>
              <button
                className="swal-btn-confirm pack-add-btn d-block mx-auto"
                onClick={agregarSesionPack}
                disabled={
                  loadingReserva ||
                  turnosPackSeleccionados.length >= packCantidadTurnos
                }
              >
                {turnosPackSeleccionados.length >= packCantidadTurnos ? (
                  "Pack completo"
                ) : (
                  <>
                    Añadir <strong>{slotPackConfirmLabel}</strong>
                  </>
                )}
              </button>
            </>
          ) : (
            <button
              className="swal-btn-confirm d-block mx-auto"
              onClick={handleConfirmacion}
              disabled={loadingReserva}
            >
              {loadingReserva ? "Reservando..." : textBtnTurno}
            </button>
          )}
        </div>
      )}

      {esPackServicio && !packCompleto && turnosPackOrdenados.length > 0 && (
        <div className="resumen-turno resumen-pack-mini mt-4 p-3 ">
          <div className="resumen-pack-mini-head">
            <h6 className="fw-bold mb-0">Sesiones añadidas</h6>
            <span>
              {packTurnosSeleccionados}/{packCantidadTurnos}
            </span>
          </div>
          <div className="resumen-pack-list">
            {turnosPackOrdenados.map((turnoPack, index) => (
              <div
                key={`pack-turno-mini-${turnoPack.horaInicio}-${index}`}
                className="resumen-pack-item"
              >
                <div className="resumen-pack-item-index">{index + 1}</div>
                <div className="resumen-pack-item-data">
                  <strong>
                    {new Date(turnoPack.horaInicio).toLocaleDateString(
                      "es-AR",
                      {
                        weekday: "short",
                        day: "2-digit",
                        month: "2-digit",
                      },
                    )}
                  </strong>
                  <span>
                    {new Date(turnoPack.horaInicio).toLocaleTimeString(
                      "es-AR",
                      {
                        hour: "2-digit",
                        minute: "2-digit",
                      },
                    )}{" "}
                    -{" "}
                    {new Date(turnoPack.horaFin).toLocaleTimeString("es-AR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <button
                  type="button"
                  className="resumen-pack-remove"
                  onClick={() => quitarSesionPack(index)}
                >
                  X
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {esPackServicio && packCompleto && (
        <div className="resumen-turno resumen-pack mt-4 p-3 ">
          <div className="resumen-pack-head">
            <h6 className="fw-bold mb-0">Pack seleccionado</h6>
            <span
              className={`resumen-pack-pill ${packCompleto ? "is-ok" : ""}`}
            >
              {packTurnosSeleccionados}/{packCantidadTurnos}
            </span>
          </div>

          <div className="resumen-pack-progress" aria-hidden="true">
            <span style={{ width: `${packProgressPct}%` }} />
          </div>

          <div className="resumen-pack-meta">
            <div className="resumen-pack-meta-item">
              <span>Frecuencia sugerida</span>
              <strong>
                Cada {packFrecuenciaDias} dia
                {packFrecuenciaDias === 1 ? "" : "s"}
              </strong>
            </div>
            <div className="resumen-pack-meta-item">
              <span>Total estimado</span>
              <strong>
                ${(precioTotal * packCantidadTurnos).toLocaleString("es-AR")}
              </strong>
            </div>
            <div className="resumen-pack-meta-item">
              {packTurnosRestantes > 0 && (
                <>
                  <span>Te faltan</span>
                  <strong>
                    {packTurnosRestantes} sesion
                    {packTurnosRestantes === 1 ? "" : "es"}
                  </strong>
                </>
              )}

              {packTurnosRestantes <= 0 && (
                <>
                  <span>Todo listo</span>
                  <strong>Pack completo</strong>
                </>
              )}
            </div>
          </div>

          {turnosPackOrdenados.length === 0 ? (
            <div className="resumen-pack-empty">
              Todavia no agregaste sesiones. Selecciona un horario y toca
              "Agregar sesion".
            </div>
          ) : (
            <div className="resumen-pack-list">
              {turnosPackOrdenados.map((turnoPack, index) => (
                <div
                  key={`pack-turno-${turnoPack.horaInicio}-${index}`}
                  className="resumen-pack-item"
                >
                  <div className="resumen-pack-item-index">{index + 1}</div>
                  <div className="resumen-pack-item-data">
                    <strong>
                      {new Date(turnoPack.horaInicio).toLocaleDateString(
                        "es-AR",
                        {
                          weekday: "short",
                          day: "2-digit",
                          month: "2-digit",
                        },
                      )}
                    </strong>
                    <span>
                      {new Date(turnoPack.horaInicio).toLocaleTimeString(
                        "es-AR",
                        {
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}{" "}
                      -{" "}
                      {new Date(turnoPack.horaFin).toLocaleTimeString("es-AR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="resumen-pack-remove"
                    onClick={() => quitarSesionPack(index)}
                  >
                    X
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            className="swal-btn-confirm d-block mx-auto mt-3"
            onClick={handleConfirmacion}
            disabled={loadingReserva || !packCompleto}
          >
            {loadingReserva
              ? "Reservando..."
              : packCompleto
                ? "Confirmar"
                : `Selecciona ${packCantidadTurnos} sesiones`}
          </button>
        </div>
      )}
    </div>
  );
}

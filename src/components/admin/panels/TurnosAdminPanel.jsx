import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "../../../Firebase";
import { calcularMontosTurno } from "../../../config/comisiones";
import { generarSlotsDia } from "../../../public/utils/generarSlotsDia";
import Swal from "sweetalert2";
import { swalError, swalSuccess } from "../../../public/utils/swalUtils";
import {
  getEstadoPago,
  getEstadoTurno,
  getMetodoPagoEsperado,
} from "./turnosAdmin/turnosAdminHelpers";
import TurnosAdminTable from "./turnosAdmin/TurnosAdminTable";

function formatMoney(value) {
  return `$${Number(value || 0).toLocaleString("es-AR")}`;
}

function sortServicios(a, b) {
  return String(a?.nombreServicio || "").localeCompare(
    String(b?.nombreServicio || ""),
    "es",
  );
}

function sortClientes(a, b) {
  const nombreA = a?.nombre || a?.email || "";
  const nombreB = b?.nombre || b?.email || "";
  return String(nombreA).localeCompare(String(nombreB), "es");
}

function buildTurnoDate(fecha, hora) {
  return new Date(`${fecha}T${hora}:00`);
}

function formatHourLocal(timestamp) {
  return new Date(timestamp).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function toISODateLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateShort(fechaIso) {
  return new Date(`${fechaIso}T00:00:00`).toLocaleDateString("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

function getDiaConfig(servicio, fechaIso) {
  const fecha = new Date(`${fechaIso}T00:00:00`);
  const diaSemana = fecha.getDay();

  if (
    !Array.isArray(servicio?.horariosServicio) ||
    !servicio.horariosServicio.length
  ) {
    return null;
  }

  return (
    servicio.horariosServicio.find(
      (item) => Number(item?.diaSemana) === Number(diaSemana),
    ) || null
  );
}

function estaDentroVentanaAgenda(servicio, fechaIso) {
  const maxDias = Math.max(1, Number(servicio?.agendaMaxDias || 7));
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const fecha = new Date(`${fechaIso}T00:00:00`);
  fecha.setHours(0, 0, 0, 0);

  const limite = new Date(hoy);
  limite.setDate(limite.getDate() + (maxDias - 1));

  return fecha >= hoy && fecha <= limite;
}

function horarioPermitidoPorServicio(servicio, fechaIso, inicioMs, finMs) {
  const configDia = getDiaConfig(servicio, fechaIso);
  if (!configDia) return true;
  if (!configDia.activo) return false;

  const inicioHora = formatHourLocal(inicioMs);
  const finHora = formatHourLocal(finMs);
  const franjas = Array.isArray(configDia.franjas) ? configDia.franjas : [];

  return franjas.some((franja) => {
    if (!franja?.desde || !franja?.hasta) return false;
    return inicioHora >= franja.desde && finHora <= franja.hasta;
  });
}

export default function TurnosAdminPanel() {
  const [turnos, setTurnos] = useState([]);
  const [clientes, setClientes] = useState({});
  const [gabinetes, setGabinetes] = useState({});
  const [servicios, setServicios] = useState([]);
  const [creandoTurno, setCreandoTurno] = useState(false);
  const [agendaManual, setAgendaManual] = useState(null);
  const [cargandoGabineteHorarios, setCargandoGabineteHorarios] =
    useState(false);
  const [sugerenciasHorarios, setSugerenciasHorarios] = useState([]);
  const [cargandoSugerencias, setCargandoSugerencias] = useState(false);

  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [fechaFiltro, setFechaFiltro] = useState("");
  const [filtroEstadoPago, setFiltroEstadoPago] = useState("todos");
  const [filtroMetodoPago, setFiltroMetodoPago] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [soloSaldoPendiente, setSoloSaldoPendiente] = useState(false);

  const [nuevoTurno, setNuevoTurno] = useState({
    clienteId: "",
    servicioId: "",
    gabineteId: "",
    nombreCliente: "",
    clienteTelefono: "",
    clienteEmail: "",
    fecha: "",
    horaInicio: "",
    metodoPagoEsperado: "manual",
    montoPagado: "",
    notas: "",
  });

  useEffect(() => {
    return onSnapshot(
      collection(db, "turnos"),
      (snap) => {
        setTurnos(
          snap.docs
            .map((d) => ({
              id: d.id,
              ...d.data(),
            }))
            .sort((a, b) => {
              const fechaA = String(a?.fecha || "");
              const fechaB = String(b?.fecha || "");
              if (fechaA !== fechaB) return fechaA.localeCompare(fechaB, "es");
              return Number(a?.horaInicio || 0) - Number(b?.horaInicio || 0);
            }),
        );
      },
      (error) => {
        console.error(
          "Error leyendo collection(turnos) en TurnosAdminPanel",
          error,
        );
        setTurnos([]);
      },
    );
  }, []);

  useEffect(() => {
    return onSnapshot(
      collection(db, "usuarios"),
      (snap) => {
        const map = {};
        snap.docs.forEach((d) => {
          map[d.id] = d.data();
        });
        setClientes(map);
      },
      (error) => {
        console.error(
          "Error leyendo collection(usuarios) en TurnosAdminPanel",
          error,
        );
        setClientes({});
      },
    );
  }, []);

  useEffect(() => {
    return onSnapshot(
      collection(db, "gabinetes"),
      (snap) => {
        const map = {};
        snap.docs.forEach((d) => {
          map[d.id] = d.data();
        });
        setGabinetes(map);
      },
      (error) => {
        console.error(
          "Error leyendo collection(gabinetes) en TurnosAdminPanel",
          error,
        );
        setGabinetes({});
      },
    );
  }, []);

  useEffect(() => {
    return onSnapshot(
      collection(db, "servicios"),
      (snap) => {
        setServicios(
          snap.docs
            .map((d) => ({
              id: d.id,
              ...d.data(),
            }))
            .filter((servicio) => servicio.activo !== false)
            .sort(sortServicios),
        );
      },
      (error) => {
        console.error(
          "Error leyendo collection(servicios) en TurnosAdminPanel",
          error,
        );
        setServicios([]);
      },
    );
  }, []);

  const servicioSeleccionado = useMemo(
    () =>
      servicios.find((servicio) => servicio.id === nuevoTurno.servicioId) ||
      null,
    [servicios, nuevoTurno.servicioId],
  );

  const gabinetesDisponibles = useMemo(() => {
    if (!servicioSeleccionado?.gabinetes?.length) {
      return Object.entries(gabinetes)
        .map(([id, value]) => ({
          id,
          ...value,
        }))
        .filter((gabinete) => gabinete.activo !== false)
        .sort((a, b) =>
          String(a?.nombreGabinete || "").localeCompare(
            String(b?.nombreGabinete || ""),
            "es",
          ),
        );
    }

    return servicioSeleccionado.gabinetes
      .map((gabinete) => ({
        id: gabinete.id,
        nombreGabinete:
          gabinetes[gabinete.id]?.nombreGabinete ||
          gabinete.nombreGabinete ||
          "-",
        activo: gabinetes[gabinete.id]?.activo ?? true,
      }))
      .filter((gabinete) => gabinete.activo !== false);
  }, [gabinetes, servicioSeleccionado]);

  const previewMontos = useMemo(() => {
    if (!servicioSeleccionado) return null;

    return calcularMontosTurno({
      precioServicio: Number(servicioSeleccionado.precio || 0),
      porcentajeAnticipo: servicioSeleccionado.pedirAnticipo
        ? Number(servicioSeleccionado.porcentajeAnticipo || 0)
        : 0,
      cobrarComision: true,
    });
  }, [servicioSeleccionado]);

  const montoSugerido = useMemo(() => {
    if (!previewMontos || !servicioSeleccionado) return 0;
    return servicioSeleccionado.pedirAnticipo
      ? previewMontos.montoAnticipoTotal
      : previewMontos.montoTotal;
  }, [previewMontos, servicioSeleccionado]);

  const clientesOptions = useMemo(() => {
    return Object.entries(clientes)
      .map(([id, value]) => ({
        id,
        ...value,
      }))
      .sort(sortClientes);
  }, [clientes]);

  useEffect(() => {
    if (!servicioSeleccionado || !nuevoTurno.fecha || !nuevoTurno.gabineteId) {
      setAgendaManual(null);
      setCargandoGabineteHorarios(false);
      return undefined;
    }

    let cancelled = false;
    const getAgendaFn = httpsCallable(getFunctions(), "getAgendaGabinete");

    async function cargarAgendaManual() {
      setCargandoGabineteHorarios(true);

      try {
        const result = await getAgendaFn({
          gabineteIds: [nuevoTurno.gabineteId],
          fecha: nuevoTurno.fecha,
        });

        if (!cancelled) {
          setAgendaManual(result.data || { horarios: [], turnos: [], bloqueos: [] });
        }
      } catch (error) {
        console.error("Error cargando agenda manual", error);
        if (!cancelled) {
          setAgendaManual({ horarios: [], turnos: [], bloqueos: [] });
        }
      } finally {
        if (!cancelled) {
          setCargandoGabineteHorarios(false);
        }
      }
    }

    void cargarAgendaManual();

    return () => {
      cancelled = true;
    };
  }, [nuevoTurno.fecha, nuevoTurno.gabineteId, servicioSeleccionado]);

  const slotsDisponibles = useMemo(() => {
    if (!servicioSeleccionado || !nuevoTurno.fecha || !nuevoTurno.gabineteId) {
      return [];
    }

    if (!estaDentroVentanaAgenda(servicioSeleccionado, nuevoTurno.fecha)) {
      return [];
    }

    const agenda = agendaManual || { horarios: [], turnos: [], bloqueos: [] };

    return generarSlotsDia(
      agenda,
      servicioSeleccionado,
      new Date(`${nuevoTurno.fecha}T00:00:00`),
    ).filter((slot) => !slot.ocupado);
  }, [
    agendaManual,
    nuevoTurno.fecha,
    nuevoTurno.gabineteId,
    servicioSeleccionado,
  ]);

  const turnosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();

    return turnos.filter((turno) => {
      const estadoTurno = getEstadoTurno(turno);
      const estadoPago = getEstadoPago(turno);

      const metodoPagoReal = turno?.metodoPagoUsado || null;
      const metodoPagoEsperado = getMetodoPagoEsperado(turno);
      const metodoPagoBase = metodoPagoReal || metodoPagoEsperado || "sin_pago";

      const cliente = clientes[turno.clienteId || turno.usuarioId || turno.uid];
      const nombreCliente =
        cliente?.nombre ||
        cliente?.email ||
        turno.nombreCliente ||
        turno.email ||
        "";
      const telefonoCliente =
        cliente?.telefono ||
        turno.clienteTelefono ||
        turno.telefonoCliente ||
        "";
      const emailCliente =
        cliente?.email || turno.clienteEmail || turno.email || "";

      const nombreServicio = turno.nombreServicio || "";
      const nombreGabinete =
        gabinetes[turno.gabineteId]?.nombreGabinete ||
        turno.nombreGabinete ||
        "";

      const montoTotal = Number(turno?.montoTotal ?? turno?.precioTotal ?? 0);
      const montoPagado = Number(turno?.montoPagado ?? 0);
      const saldoPendiente = Math.max(0, montoTotal - montoPagado);

      if (filtroEstado !== "todos" && estadoTurno !== filtroEstado)
        return false;
      if (fechaFiltro && turno.fecha !== fechaFiltro) return false;
      if (filtroEstadoPago !== "todos" && estadoPago !== filtroEstadoPago)
        return false;
      if (filtroMetodoPago !== "todos" && metodoPagoBase !== filtroMetodoPago)
        return false;
      if (soloSaldoPendiente && saldoPendiente <= 0) return false;

      if (texto) {
        const bloqueTexto = `
          ${nombreCliente}
          ${telefonoCliente}
          ${emailCliente}
          ${nombreServicio}
          ${nombreGabinete}
          ${turno.id}
        `.toLowerCase();

        if (!bloqueTexto.includes(texto)) return false;
      }

      return true;
    });
  }, [
    turnos,
    clientes,
    gabinetes,
    filtroEstado,
    fechaFiltro,
    filtroEstadoPago,
    filtroMetodoPago,
    busqueda,
    soloSaldoPendiente,
  ]);

  const resumen = useMemo(() => {
    return turnosFiltrados.reduce(
      (acc, turno) => {
        const estadoTurno = getEstadoTurno(turno);
        const montoTotal = Number(turno?.montoTotal ?? turno?.precioTotal ?? 0);
        const montoPagado = Number(turno?.montoPagado ?? 0);
        const saldoPendiente = Math.max(0, montoTotal - montoPagado);

        acc.total += 1;
        if (
          estadoTurno === "pendiente" ||
          estadoTurno === "pendiente_aprobacion"
        ) {
          acc.porConfirmar += 1;
        }
        if (estadoTurno === "confirmado") {
          acc.confirmados += 1;
        }
        if (saldoPendiente > 0) {
          acc.conSaldo += 1;
          acc.saldoTotal += saldoPendiente;
        }

        return acc;
      },
      {
        total: 0,
        porConfirmar: 0,
        confirmados: 0,
        conSaldo: 0,
        saldoTotal: 0,
      },
    );
  }, [turnosFiltrados]);

  function limpiarFiltros() {
    setFiltroEstado("todos");
    setFechaFiltro("");
    setFiltroEstadoPago("todos");
    setFiltroMetodoPago("todos");
    setBusqueda("");
    setSoloSaldoPendiente(false);
  }

  function resetNuevoTurno() {
    setNuevoTurno({
      clienteId: "",
      servicioId: "",
      gabineteId: "",
      nombreCliente: "",
      clienteTelefono: "",
      clienteEmail: "",
      fecha: "",
      horaInicio: "",
      metodoPagoEsperado: "manual",
      montoPagado: "",
      notas: "",
    });
  }

  function updateNuevoTurno(field, value) {
    setNuevoTurno((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  useEffect(() => {
    if (!servicioSeleccionado) return;

    const gabineteDisponible = servicioSeleccionado.gabinetes?.[0]?.id || "";
    setNuevoTurno((prev) => ({
      ...prev,
      gabineteId:
        prev.servicioId === servicioSeleccionado.id && prev.gabineteId
          ? prev.gabineteId
          : gabineteDisponible,
      montoPagado: montoSugerido ? String(montoSugerido) : "",
    }));
  }, [montoSugerido, servicioSeleccionado]);

  useEffect(() => {
    if (!nuevoTurno.clienteId) return;

    const cliente = clientes[nuevoTurno.clienteId];
    if (!cliente) return;

    setNuevoTurno((prev) => ({
      ...prev,
      nombreCliente: cliente.nombre || prev.nombreCliente,
      clienteTelefono:
        cliente.telefono || cliente.telefonoCliente || prev.clienteTelefono,
      clienteEmail: cliente.email || prev.clienteEmail,
    }));
  }, [clientes, nuevoTurno.clienteId]);

  useEffect(() => {
    if (!servicioSeleccionado || !nuevoTurno.fecha || !nuevoTurno.gabineteId) {
      setSugerenciasHorarios([]);
      setCargandoSugerencias(false);
      return undefined;
    }

    if (cargandoGabineteHorarios || slotsDisponibles.length > 0) {
      setSugerenciasHorarios([]);
      setCargandoSugerencias(false);
      return undefined;
    }

    let cancelled = false;
    const getAgendaFn = httpsCallable(getFunctions(), "getAgendaGabinete");

    async function cargarSugerencias() {
      setCargandoSugerencias(true);

      try {
        const fechaBase = new Date(`${nuevoTurno.fecha}T00:00:00`);
        const maxDias = Math.max(1, Number(servicioSeleccionado?.agendaMaxDias || 7));
        const sugerencias = [];

        for (let offset = 1; offset < maxDias && sugerencias.length < 3; offset += 1) {
          const fecha = new Date(fechaBase);
          fecha.setDate(fecha.getDate() + offset);
          const fechaIso = toISODateLocal(fecha);

          if (!estaDentroVentanaAgenda(servicioSeleccionado, fechaIso)) {
            break;
          }

          const result = await getAgendaFn({
            gabineteIds: [nuevoTurno.gabineteId],
            fecha: fechaIso,
          });

          const agenda = result.data || { horarios: [], turnos: [], bloqueos: [] };
          const slots = generarSlotsDia(
            agenda,
            servicioSeleccionado,
            new Date(`${fechaIso}T00:00:00`),
          ).filter((slot) => !slot.ocupado);

          if (slots.length && !cancelled) {
            sugerencias.push({
              fecha: fechaIso,
              label: formatDateShort(fechaIso),
              cantidad: slots.length,
              primeraHora: formatHourLocal(slots[0].inicio),
            });
          }
        }

        if (!cancelled) {
          setSugerenciasHorarios(sugerencias);
        }
      } catch (error) {
        console.error("Error cargando sugerencias de horarios", error);
        if (!cancelled) {
          setSugerenciasHorarios([]);
        }
      } finally {
        if (!cancelled) {
          setCargandoSugerencias(false);
        }
      }
    }

    void cargarSugerencias();

    return () => {
      cancelled = true;
    };
  }, [
    cargandoGabineteHorarios,
    nuevoTurno.fecha,
    nuevoTurno.gabineteId,
    servicioSeleccionado,
    slotsDisponibles.length,
  ]);

  useEffect(() => {
    if (!nuevoTurno.horaInicio) return;

    const sigueDisponible = slotsDisponibles.some(
      (slot) => formatHourLocal(slot.inicio) === nuevoTurno.horaInicio,
    );

    if (!sigueDisponible) {
      setNuevoTurno((prev) => ({
        ...prev,
        horaInicio: "",
      }));
    }
  }, [nuevoTurno.horaInicio, slotsDisponibles]);

  async function crearTurnoManual() {
    if (creandoTurno) return;
    if (!servicioSeleccionado) {
      await swalError({
        title: "Falta el servicio",
        text: "Selecciona un servicio para crear el turno.",
      });
      return;
    }
    if (!nuevoTurno.gabineteId) {
      await swalError({
        title: "Falta el gabinete",
        text: "Selecciona un gabinete para continuar.",
      });
      return;
    }
    if (!nuevoTurno.nombreCliente.trim()) {
      await swalError({
        title: "Falta el cliente",
        text: "Ingresa o selecciona el cliente del turno.",
      });
      return;
    }
    if (!nuevoTurno.fecha || !nuevoTurno.horaInicio) {
      await swalError({
        title: "Falta fecha u horario",
        text: "Selecciona una fecha y uno de los horarios disponibles.",
      });
      return;
    }

    const inicio = buildTurnoDate(nuevoTurno.fecha, nuevoTurno.horaInicio);
    const inicioMs = inicio.getTime();

    if (Number.isNaN(inicioMs)) {
      await swalError({
        title: "Fecha u hora invalida",
        text: "Revisa la fecha y el horario elegidos.",
      });
      return;
    }

    const duracionMin = Math.max(
      1,
      Number(servicioSeleccionado.duracionMin || 0),
    );
    const finMs = inicioMs + duracionMin * 60000;
    const montoPagado = Math.max(0, Number(nuevoTurno.montoPagado || 0));
    const montos = calcularMontosTurno({
      precioServicio: Number(servicioSeleccionado.precio || 0),
      porcentajeAnticipo: servicioSeleccionado.pedirAnticipo
        ? Number(servicioSeleccionado.porcentajeAnticipo || 0)
        : 0,
      cobrarComision: true,
    });

    if (montoPagado > montos.montoTotal) {
      await swalError({
        title: "Monto invalido",
        text: "El monto pagado no puede ser mayor al total.",
      });
      return;
    }

    if (!estaDentroVentanaAgenda(servicioSeleccionado, nuevoTurno.fecha)) {
      await swalError({
        title: "Fecha fuera de agenda",
        text: "La fecha elegida queda fuera de la agenda abierta para este servicio.",
      });
      return;
    }

    if (
      !horarioPermitidoPorServicio(
        servicioSeleccionado,
        nuevoTurno.fecha,
        inicioMs,
        finMs,
      )
    ) {
      await swalError({
        title: "Horario no disponible",
        text: "El horario elegido no esta disponible en la agenda del servicio.",
      });
      return;
    }

    const conflicto = turnos.some((turno) => {
      if (turno.fecha !== nuevoTurno.fecha) return false;
      if ((turno.gabineteId || "") !== nuevoTurno.gabineteId) return false;

      const estadoTurno = getEstadoTurno(turno);
      if (
        ["cancelado", "rechazado", "finalizado", "perdido"].includes(
          estadoTurno,
        )
      ) {
        return false;
      }

      const inicioExistente = Number(turno.horaInicio || 0);
      const finExistente = Number(turno.horaFin || 0);

      return inicioMs < finExistente && finMs > inicioExistente;
    });

    if (conflicto) {
      await swalError({
        title: "Horario ocupado",
        text: "Ya existe un turno en ese gabinete y horario.",
      });
      return;
    }

    const gabineteSeleccionado =
      gabinetes[nuevoTurno.gabineteId] ||
      gabinetesDisponibles.find(
        (gabinete) => gabinete.id === nuevoTurno.gabineteId,
      );

    const montoAnticipo = montos.montoAnticipoTotal;
    const saldoPendiente = Math.max(0, montos.montoTotal - montoPagado);
    const estadoPago =
      montoPagado <= 0
        ? montos.montoTotal > 0
          ? "pendiente"
          : "abonado"
        : montoPagado >= montos.montoTotal
          ? "abonado"
          : "parcial";

    setCreandoTurno(true);

    try {
      await Swal.fire({
        title: "Guardando turno",
        text: "Estamos registrando la reserva manual.",
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      await addDoc(collection(db, "turnos"), {
        servicioId: servicioSeleccionado.id,
        categoriaId: servicioSeleccionado.categoriaId || "",
        categoriaNombre: servicioSeleccionado.categoriaNombre || "",
        nombreServicio: servicioSeleccionado.nombreServicio || "",
        profesionalId: servicioSeleccionado.profesionalId || null,
        nombreProfesional: servicioSeleccionado.nombreProfesional || "",
        responsableGestion: servicioSeleccionado.responsableGestion || "admin",
        descripcionServicio: servicioSeleccionado.descripcion || "",
        gabineteId: nuevoTurno.gabineteId,
        nombreGabinete: gabineteSeleccionado?.nombreGabinete || "",
        fecha: nuevoTurno.fecha,
        horaInicio: inicioMs,
        horaFin: finMs,
        duracionMin,
        nombreCliente: nuevoTurno.nombreCliente.trim(),
        clienteTelefono: nuevoTurno.clienteTelefono.trim(),
        telefonoCliente: nuevoTurno.clienteTelefono.trim(),
        clienteEmail: nuevoTurno.clienteEmail.trim(),
        email: nuevoTurno.clienteEmail.trim(),
        clienteId: nuevoTurno.clienteId || null,
        usuarioId: nuevoTurno.clienteId || null,
        uid: nuevoTurno.clienteId || null,
        metodoPagoEsperado: nuevoTurno.metodoPagoEsperado,
        metodoPagoUsado:
          montoPagado > 0 && nuevoTurno.metodoPagoEsperado !== "sin_pago"
            ? nuevoTurno.metodoPagoEsperado
            : null,
        modoReserva: servicioSeleccionado.modoReserva || "reserva",
        pedirAnticipo: Boolean(servicioSeleccionado.pedirAnticipo),
        porcentajeAnticipo: servicioSeleccionado.pedirAnticipo
          ? Number(servicioSeleccionado.porcentajeAnticipo || 0)
          : 0,
        montoServicio: montos.precioServicio,
        precioServicio: montos.precioServicio,
        comisionTurno: montos.comisionTurno,
        montoComision: montos.comisionTurno,
        montoAnticipoServicio: montos.montoAnticipoServicio,
        montoAnticipo,
        montoTotal: montos.montoTotal,
        precioTotal: montos.montoTotal,
        montoPagado,
        saldoPendiente,
        estadoTurno: "confirmado",
        estadoPago,
        creadoPorAdmin: true,
        origenTurno: "admin_manual",
        notasAdmin: nuevoTurno.notas.trim(),
        createdAt: serverTimestamp(),
        creadoEn: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      resetNuevoTurno();
      Swal.close();
      await swalSuccess({
        title: "Turno agregado",
        text: "La reserva manual se guardo correctamente.",
      });
    } catch (error) {
      console.error("Error creando turno manual", error);
      Swal.close();
      await swalError({
        title: "No se pudo crear el turno",
        text: "Ocurrio un error al guardar la reserva manual.",
      });
    } finally {
      setCreandoTurno(false);
    }
  }

  return (
    <div className="admin-panel turnos-admin-page">
      <section className="turnos-admin-hero">
        <div className="turnos-admin-hero-copy">
          <p className="turnos-admin-eyebrow">Panel operativo</p>
          <h2 className="turnos-admin-title">Turnos y reservas</h2>
          <p className="turnos-admin-subtitle">
            Revisa agenda, estado del pago y acciones operativas.
          </p>
        </div>

        <div className="turnos-admin-summary">
          <article className="turnos-summary-card">
            <span>Turnos visibles</span>
            <strong>{resumen.total}</strong>
          </article>
          <article className="turnos-summary-card">
            <span>Por confirmar</span>
            <strong>{resumen.porConfirmar}</strong>
          </article>
          <article className="turnos-summary-card">
            <span>Confirmados</span>
            <strong>{resumen.confirmados}</strong>
          </article>
          <article className="turnos-summary-card">
            <span>Saldo pendiente</span>
            <strong>{formatMoney(resumen.saldoTotal)}</strong>
          </article>
        </div>
      </section>

      <section className="turnos-create-box">
        <div className="turnos-create-header">
          <div>
            <h3 className="turnos-filtros-title">Agregar turno manual</h3>
            <p className="turnos-filtros-desc">
              Crea reservas desde admin con servicio real, calculo de montos y
              chequeo basico de solapamientos.
            </p>
          </div>

          {previewMontos ? (
            <div className="turnos-create-pricing">
              <span>Total {formatMoney(previewMontos.montoTotal)}</span>
              <small>
                Anticipo {formatMoney(previewMontos.montoAnticipoTotal)}
              </small>
            </div>
          ) : null}
        </div>

        <div className="turnos-create-grid">
          <div className="turnos-filtro-item">
            <label>Cliente registrado</label>
            <select
              className="turnos-filtro-control"
              value={nuevoTurno.clienteId}
              onChange={(e) => updateNuevoTurno("clienteId", e.target.value)}
            >
              <option value="">Seleccionar del listado</option>
              {clientesOptions.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.nombre || cliente.email || cliente.id}
                </option>
              ))}
            </select>
          </div>

          <div className="turnos-filtro-item">
            <label>Servicio</label>
            <select
              className="turnos-filtro-control"
              value={nuevoTurno.servicioId}
              onChange={(e) => updateNuevoTurno("servicioId", e.target.value)}
            >
              <option value="">Elegi un servicio</option>
              {servicios.map((servicio) => (
                <option key={servicio.id} value={servicio.id}>
                  {servicio.nombreServicio}{" "}
                  {servicio.nombreProfesional
                    ? `• ${servicio.nombreProfesional}`
                    : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="turnos-filtro-item">
            <label>Gabinete</label>
            <select
              className="turnos-filtro-control"
              value={nuevoTurno.gabineteId}
              onChange={(e) => updateNuevoTurno("gabineteId", e.target.value)}
            >
              <option value="">Elegi un gabinete</option>
              {gabinetesDisponibles.map((gabinete) => (
                <option key={gabinete.id} value={gabinete.id}>
                  {gabinete.nombreGabinete}
                </option>
              ))}
            </select>
          </div>

          <div className="turnos-filtro-item">
            <label>Cliente</label>
            <input
              className="turnos-filtro-control"
              type="text"
              placeholder="Nombre y apellido"
              value={nuevoTurno.nombreCliente}
              onChange={(e) =>
                updateNuevoTurno("nombreCliente", e.target.value)
              }
            />
          </div>

          <div className="turnos-filtro-item">
            <label>Telefono</label>
            <input
              className="turnos-filtro-control"
              type="text"
              placeholder="Ej: 11 5555 5555"
              value={nuevoTurno.clienteTelefono}
              onChange={(e) =>
                updateNuevoTurno("clienteTelefono", e.target.value)
              }
            />
          </div>

          <div className="turnos-filtro-item">
            <label>Email</label>
            <input
              className="turnos-filtro-control"
              type="email"
              placeholder="cliente@email.com"
              value={nuevoTurno.clienteEmail}
              onChange={(e) => updateNuevoTurno("clienteEmail", e.target.value)}
            />
          </div>

          <div className="turnos-filtro-item">
            <label>Fecha</label>
            <input
              className="turnos-filtro-control"
              type="date"
              value={nuevoTurno.fecha}
              onChange={(e) => updateNuevoTurno("fecha", e.target.value)}
            />
          </div>

          <div className="turnos-filtro-item">
            <label>Horario elegido</label>
            <input
              className="turnos-filtro-control"
              type="text"
              readOnly
              placeholder="Selecciona un horario disponible"
              value={nuevoTurno.horaInicio}
            />
          </div>

          <div className="turnos-filtro-item">
            <label>Metodo esperado</label>
            <select
              className="turnos-filtro-control"
              value={nuevoTurno.metodoPagoEsperado}
              onChange={(e) =>
                updateNuevoTurno("metodoPagoEsperado", e.target.value)
              }
            >
              <option value="manual">Manual</option>
              <option value="transferencia">Transferencia</option>
              <option value="mercadopago">MercadoPago</option>
              <option value="sin_pago">Sin pago</option>
            </select>
          </div>

          <div className="turnos-filtro-item">
            <label>Monto pagado</label>
            <input
              className="turnos-filtro-control"
              type="number"
              min="0"
              step="1"
              placeholder={montoSugerido ? String(montoSugerido) : "0"}
              value={nuevoTurno.montoPagado}
              onChange={(e) => updateNuevoTurno("montoPagado", e.target.value)}
            />
            {montoSugerido ? (
              <small className="turnos-create-field-hint">
                Sugerido: {formatMoney(montoSugerido)}{" "}
                {servicioSeleccionado?.pedirAnticipo
                  ? "(sena + comision)"
                  : "(total)"}
              </small>
            ) : null}
          </div>

          <div className="turnos-filtro-item turnos-filtro-item--buscar">
            <label>Notas internas</label>
            <input
              className="turnos-filtro-control"
              type="text"
              placeholder="Observaciones para el equipo"
              value={nuevoTurno.notas}
              onChange={(e) => updateNuevoTurno("notas", e.target.value)}
            />
          </div>
        </div>

        <div className="turnos-slots-box">
          <div className="turnos-slots-head">
            <strong>Horarios disponibles</strong>
            <span>
              {cargandoGabineteHorarios
                ? "Cargando agenda..."
                : `${slotsDisponibles.length} opcion(es) disponibles`}
            </span>
          </div>

          {!nuevoTurno.fecha ||
          !servicioSeleccionado ||
          !nuevoTurno.gabineteId ? (
            <div className="turnos-slots-empty">
              Selecciona servicio, gabinete y fecha para ver la agenda
              simplificada.
            </div>
          ) : !estaDentroVentanaAgenda(
              servicioSeleccionado,
              nuevoTurno.fecha,
            ) ? (
            <div className="turnos-slots-empty">
              La fecha elegida queda fuera de la agenda abierta del servicio.
            </div>
          ) : cargandoGabineteHorarios ? (
            <div className="turnos-slots-empty">
              Cargando horarios del gabinete...
            </div>
          ) : slotsDisponibles.length === 0 ? (
            <div className="turnos-slots-empty turnos-slots-empty-error">
              <strong>No hay horarios disponibles para esa combinacion.</strong>
              {cargandoSugerencias ? (
                <span>Buscando proximas fechas con disponibilidad...</span>
              ) : sugerenciasHorarios.length ? (
                <div className="turnos-slots-suggestions">
                  <span>Proba alguna de estas fechas:</span>
                  <div className="turnos-slots-suggestion-list">
                    {sugerenciasHorarios.map((sugerencia) => (
                      <button
                        key={sugerencia.fecha}
                        type="button"
                        className="turnos-slots-suggestion-btn"
                        onClick={() => updateNuevoTurno("fecha", sugerencia.fecha)}
                      >
                        {sugerencia.label} · {sugerencia.primeraHora}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <span>No encontramos fechas cercanas con turnos para este gabinete.</span>
              )}
            </div>
          ) : (
            <div className="turnos-slots-grid">
              {slotsDisponibles.map((slot) => {
                const hora = formatHourLocal(slot.inicio);
                const isActive = nuevoTurno.horaInicio === hora;

                return (
                  <button
                    key={slot.inicio}
                    type="button"
                    className={`turnos-slot-btn ${isActive ? "is-active" : ""}`}
                    onClick={() => updateNuevoTurno("horaInicio", hora)}
                  >
                    {hora}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="turnos-create-footer">
          <div className="turnos-create-hint">
            El turno se crea como <strong>confirmado</strong> y con estado de
            pago calculado segun el monto ingresado. Desde admin no se aplica la
            anticipacion minima publica de reserva.
          </div>

          <div className="turnos-create-actions">
            <button
              type="button"
              className="turnos-filtros-clear"
              onClick={resetNuevoTurno}
            >
              Limpiar formulario
            </button>
            <button
              type="button"
              className="swal-btn-guardar"
              onClick={crearTurnoManual}
              disabled={creandoTurno}
            >
              {creandoTurno ? "Guardando..." : "Agregar turno"}
            </button>
          </div>
        </div>
      </section>

      <section className="turnos-filtros-box">
        <div className="turnos-filtros-header">
          <div>
            <h3 className="turnos-filtros-title">Filtros</h3>
            <p className="turnos-filtros-desc">
              Combina estado, fecha, metodo y busqueda libre para encontrar
              rapido cada turno.
            </p>
          </div>

          <button
            type="button"
            className="turnos-filtros-clear"
            onClick={limpiarFiltros}
          >
            Limpiar
          </button>
        </div>

        <div className="turnos-filtros-grid">
          <div className="turnos-filtro-item">
            <label>Estado del turno</label>
            <select
              className="turnos-filtro-control"
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
            >
              <option value="todos">Todos</option>
              <option value="pendiente">Pendientes</option>
              <option value="pendiente_aprobacion">Pendiente aprobacion</option>
              <option value="confirmado">Confirmados</option>
              <option value="rechazado">Rechazados</option>
              <option value="cancelado">Cancelados</option>
              <option value="perdido">Perdidos</option>
              <option value="finalizado">Finalizados</option>
            </select>
          </div>

          <div className="turnos-filtro-item">
            <label>Fecha</label>
            <input
              className="turnos-filtro-control"
              type="date"
              value={fechaFiltro}
              onChange={(e) => setFechaFiltro(e.target.value)}
            />
          </div>

          <div className="turnos-filtro-item">
            <label>Estado del pago</label>
            <select
              className="turnos-filtro-control"
              value={filtroEstadoPago}
              onChange={(e) => setFiltroEstadoPago(e.target.value)}
            >
              <option value="todos">Todos los pagos</option>
              <option value="pendiente">Pago pendiente</option>
              <option value="pendiente_aprobacion">
                Pendiente aprobacion pago
              </option>
              <option value="parcial">Pago parcial</option>
              <option value="abonado">Abonado</option>
              <option value="reembolsado">Reembolsado</option>
              <option value="rechazado">Pago rechazado</option>
            </select>
          </div>

          <div className="turnos-filtro-item">
            <label>Metodo de pago</label>
            <select
              className="turnos-filtro-control"
              value={filtroMetodoPago}
              onChange={(e) => setFiltroMetodoPago(e.target.value)}
            >
              <option value="todos">Todos los metodos</option>
              <option value="mercadopago">MercadoPago</option>
              <option value="manual">Manual</option>
              <option value="transferencia">Transferencia</option>
              <option value="sin_pago">Sin pago</option>
            </select>
          </div>

          <div className="turnos-filtro-item turnos-filtro-item--buscar">
            <label>Busqueda</label>
            <input
              className="turnos-filtro-control"
              type="text"
              placeholder="Cliente, telefono, email, servicio, gabinete o ID"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>

          <div className="turnos-filtro-item turnos-filtro-item--check">
            <label className="turnos-filtro-check">
              <input
                type="checkbox"
                checked={soloSaldoPendiente}
                onChange={(e) => setSoloSaldoPendiente(e.target.checked)}
              />
              <span>Solo saldo pendiente</span>
            </label>
          </div>
        </div>
      </section>

      <TurnosAdminTable
        turnos={turnosFiltrados}
        clientes={clientes}
        gabinetes={gabinetes}
      />
    </div>
  );
}

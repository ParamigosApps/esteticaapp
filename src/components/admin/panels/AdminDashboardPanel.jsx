import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import {
  FiAlertCircle,
  FiArrowRight,
  FiCalendar,
  FiCheckCircle,
  FiClock,
  FiDollarSign,
  FiHome,
  FiScissors,
  FiUsers,
} from "react-icons/fi";
import { db } from "../../../Firebase";
import { useFirebase } from "../../../context/FirebaseContext.jsx";
import {
  getEstadoPago,
  getEstadoTurno,
} from "./turnosAdmin/turnosAdminHelpers.js";

function formatMoney(value) {
  return `$${Number(value || 0).toLocaleString("es-AR")}`;
}

function formatDateLabel(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatTime(ms) {
  if (!ms) return "-";
  return new Date(Number(ms)).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function isClosedStatus(status) {
  return ["cancelado", "rechazado", "finalizado", "perdido"].includes(status);
}

const QUICK_ACTIONS = [
  {
    title: "Gestionar turnos",
    description: "Abrir agenda, confirmar reservas y cargar turnos manuales.",
    to: "/admin/turnos",
    icon: FiCalendar,
  },
  {
    title: "Ver clientes",
    description: "Consultar historial, pagos y ficha clinica.",
    to: "/admin/clientes",
    icon: FiUsers,
  },
  {
    title: "Liquidaciones",
    description: "Revisar pagos aprobados y cierres pendientes.",
    to: "/admin/liquidaciones",
    icon: FiDollarSign,
  },
  {
    title: "Servicios",
    description: "Actualizar catalogo, duraciones y disponibilidad.",
    to: "/admin/servicios",
    icon: FiScissors,
  },
];

export default function AdminDashboard() {
  const { user } = useFirebase();
  const [turnos, setTurnos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [gabinetes, setGabinetes] = useState([]);
  const [pagos, setPagos] = useState([]);

  useEffect(() => onSnapshot(collection(db, "turnos"), (snap) => {
    setTurnos(
      snap.docs.map((docItem) => ({
        id: docItem.id,
        ...docItem.data(),
      })),
    );
  }), []);

  useEffect(() => onSnapshot(collection(db, "usuarios"), (snap) => {
    setUsuarios(
      snap.docs.map((docItem) => ({
        id: docItem.id,
        ...docItem.data(),
      })),
    );
  }), []);

  useEffect(() => onSnapshot(collection(db, "servicios"), (snap) => {
    setServicios(
      snap.docs.map((docItem) => ({
        id: docItem.id,
        ...docItem.data(),
      })),
    );
  }), []);

  useEffect(() => onSnapshot(collection(db, "gabinetes"), (snap) => {
    setGabinetes(
      snap.docs.map((docItem) => ({
        id: docItem.id,
        ...docItem.data(),
      })),
    );
  }), []);

  useEffect(() => onSnapshot(collection(db, "pagos"), (snap) => {
    setPagos(
      snap.docs.map((docItem) => ({
        id: docItem.id,
        ...docItem.data(),
      })),
    );
  }), []);

  const today = useMemo(() => {
    const now = new Date();
    return {
      nowMs: now.getTime(),
      iso: now.toISOString().slice(0, 10),
      plus7Ms: now.getTime() + 7 * 24 * 60 * 60 * 1000,
      label: now.toLocaleDateString("es-AR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
    };
  }, []);

  const usuariosMap = useMemo(() => {
    const next = {};
    usuarios.forEach((usuario) => {
      next[usuario.id] = usuario;
    });
    return next;
  }, [usuarios]);

  const turnosActivos = useMemo(
    () => turnos.filter((turno) => !isClosedStatus(getEstadoTurno(turno))),
    [turnos],
  );

  const proximosTurnos = useMemo(() => {
    return [...turnosActivos]
      .filter((turno) => Number(turno.horaInicio || 0) >= today.nowMs)
      .sort((a, b) => Number(a.horaInicio || 0) - Number(b.horaInicio || 0))
      .slice(0, 6);
  }, [today.nowMs, turnosActivos]);

  const agendaHoy = useMemo(() => {
    return turnosActivos
      .filter((turno) => turno.fecha === today.iso)
      .sort((a, b) => Number(a.horaInicio || 0) - Number(b.horaInicio || 0));
  }, [today.iso, turnosActivos]);

  const resumen = useMemo(() => {
    const porConfirmar = turnosActivos.filter((turno) => {
      const estado = getEstadoTurno(turno);
      return estado === "pendiente" || estado === "pendiente_aprobacion";
    }).length;

    const confirmadosHoy = agendaHoy.filter(
      (turno) => getEstadoTurno(turno) === "confirmado",
    ).length;

    const saldoPendiente = turnosActivos.reduce((acc, turno) => {
      const total = Number(turno?.montoTotal ?? turno?.precioTotal ?? 0);
      const pagado = Number(turno?.montoPagado ?? 0);
      return acc + Math.max(0, total - pagado);
    }, 0);

    const pagosPendientesLiquidar = pagos.filter(
      (pago) => pago.estado === "aprobado" && !pago.liquidado,
    );

    const ingresosSemana = pagosPendientesLiquidar.reduce(
      (acc, pago) => acc + Number(pago.montoLiquidable ?? pago.monto ?? 0),
      0,
    );

    const clientesConProximoTurno = new Set(
      turnosActivos
        .filter((turno) => Number(turno.horaInicio || 0) >= today.nowMs)
        .map((turno) => turno.clienteId || turno.usuarioId || turno.uid)
        .filter(Boolean),
    ).size;

    return {
      hoy: agendaHoy.length,
      confirmadosHoy,
      porConfirmar,
      saldoPendiente,
      clientesConProximoTurno,
      pagosPendientesLiquidar: pagosPendientesLiquidar.length,
      netoPendienteLiquidar: ingresosSemana,
      serviciosActivos: servicios.filter((servicio) => servicio.activo !== false).length,
      gabinetesActivos: gabinetes.filter((gabinete) => gabinete.activo !== false).length,
    };
  }, [agendaHoy, gabinetes, pagos, servicios, today.nowMs, turnosActivos]);

  const agendaSemana = useMemo(() => {
    return turnosActivos.filter((turno) => {
      const inicio = Number(turno.horaInicio || 0);
      return inicio >= today.nowMs && inicio <= today.plus7Ms;
    }).length;
  }, [today.nowMs, today.plus7Ms, turnosActivos]);

  const actividadPorGabinete = useMemo(() => {
    const counts = {};

    agendaHoy.forEach((turno) => {
      const key = turno.gabineteId || "sin-gabinete";
      counts[key] = (counts[key] || 0) + 1;
    });

    return gabinetes
      .filter((gabinete) => gabinete.activo !== false)
      .map((gabinete) => ({
        id: gabinete.id,
        nombre: gabinete.nombreGabinete || "Gabinete",
        total: counts[gabinete.id] || 0,
      }))
      .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, "es"))
      .slice(0, 4);
  }, [agendaHoy, gabinetes]);

  const alertas = useMemo(() => {
    const pagosPorValidar = pagos.filter(
      (pago) => getEstadoPago(pago) === "pendiente_aprobacion",
    ).length;

    const turnosConSaldo = turnosActivos.filter((turno) => {
      const total = Number(turno?.montoTotal ?? turno?.precioTotal ?? 0);
      const pagado = Number(turno?.montoPagado ?? 0);
      return total > pagado;
    }).length;

    const sinAgendaHoy = agendaHoy.length === 0;

    return [
      {
        label: "Reservas por confirmar",
        value: resumen.porConfirmar,
        tone: resumen.porConfirmar > 0 ? "warning" : "ok",
        icon: FiClock,
      },
      {
        label: "Pagos por validar",
        value: pagosPorValidar,
        tone: pagosPorValidar > 0 ? "warning" : "ok",
        icon: FiAlertCircle,
      },
      {
        label: "Turnos con saldo",
        value: turnosConSaldo,
        tone: turnosConSaldo > 0 ? "warning" : "ok",
        icon: FiDollarSign,
      },
      {
        label: "Agenda de hoy",
        value: sinAgendaHoy ? "Vacia" : `${agendaHoy.length} turnos`,
        tone: sinAgendaHoy ? "soft" : "ok",
        icon: FiCheckCircle,
      },
    ];
  }, [agendaHoy, pagos, resumen.porConfirmar, turnosActivos]);

  return (
    <div className="admin-panel admin-dashboard-page">
      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <span className="dashboard-kicker">Centro operativo</span>
          <h2>
            {user?.nombre || user?.displayName || "Administracion"} | resumen del dia
          </h2>
          <p>
            Controla agenda, clientes, cobros y configuracion desde una vista clara y
            util para trabajar.
          </p>

          <div className="dashboard-hero-meta">
            <span>{today.label}</span>
            <span>{agendaSemana} turnos en los proximos 7 dias</span>
            <span>{resumen.clientesConProximoTurno} clientes activos</span>
          </div>
        </div>

        <div className="dashboard-hero-side">
          <div className="dashboard-hero-stat">
            <small>Turnos hoy</small>
            <strong>{resumen.hoy}</strong>
            <span>{resumen.confirmadosHoy} confirmados</span>
          </div>
          <div className="dashboard-hero-stat dashboard-hero-stat-soft">
            <small>Neto pendiente</small>
            <strong>{formatMoney(resumen.netoPendienteLiquidar)}</strong>
            <span>{resumen.pagosPendientesLiquidar} pagos sin liquidar</span>
          </div>
        </div>
      </section>

      <section className="dashboard-metrics-grid">
        <article className="dashboard-metric-card">
          <span>Por confirmar</span>
          <strong>{resumen.porConfirmar}</strong>
          <small>Reservas que requieren seguimiento.</small>
        </article>

        <article className="dashboard-metric-card">
          <span>Saldo pendiente</span>
          <strong>{formatMoney(resumen.saldoPendiente)}</strong>
          <small>Monto acumulado aun no cubierto.</small>
        </article>

        <article className="dashboard-metric-card">
          <span>Servicios activos</span>
          <strong>{resumen.serviciosActivos}</strong>
          <small>Catalogo disponible para reservar.</small>
        </article>

        <article className="dashboard-metric-card">
          <span>Gabinetes operativos</span>
          <strong>{resumen.gabinetesActivos}</strong>
          <small>Espacios habilitados hoy.</small>
        </article>
      </section>

      <section className="dashboard-main-grid">
        <article className="dashboard-surface">
          <div className="dashboard-section-head">
            <div>
              <span className="dashboard-section-kicker">Proximos turnos</span>
              <h3>Agenda inmediata</h3>
            </div>
            <Link to="/admin/turnos" className="dashboard-link-btn">
              Ver agenda <FiArrowRight />
            </Link>
          </div>

          <div className="dashboard-list">
            {proximosTurnos.map((turno) => {
              const clienteId = turno.clienteId || turno.usuarioId || turno.uid;
              const cliente = usuariosMap[clienteId];
              const nombreCliente =
                cliente?.nombre ||
                cliente?.email ||
                turno.nombreCliente ||
                turno.clienteEmail ||
                "Cliente";
              const estado = getEstadoTurno(turno);

              return (
                <article key={turno.id} className="dashboard-appointment-item">
                  <div className="dashboard-appointment-time">
                    <strong>{formatTime(turno.horaInicio)}</strong>
                    <span>{turno.fecha ? formatDateLabel(turno.fecha) : "-"}</span>
                  </div>

                  <div className="dashboard-appointment-copy">
                    <strong>{turno.nombreServicio || "Servicio"}</strong>
                    <span>{nombreCliente}</span>
                    <small>{turno.nombreGabinete || "Sin gabinete"}</small>
                  </div>

                  <div className={`dashboard-badge is-${estado}`}>
                    {estado.replaceAll("_", " ")}
                  </div>
                </article>
              );
            })}

            {!proximosTurnos.length ? (
              <div className="dashboard-empty">
                No hay turnos proximos cargados. Si esta vista no aporta valor,
                conviene operar directo desde Turnos.
              </div>
            ) : null}
          </div>
        </article>

        <article className="dashboard-surface">
          <div className="dashboard-section-head">
            <div>
              <span className="dashboard-section-kicker">Alertas</span>
              <h3>Prioridades del momento</h3>
            </div>
          </div>

          <div className="dashboard-alert-grid">
            {alertas.map((alerta) => {
              const Icon = alerta.icon;

              return (
                <div
                  key={alerta.label}
                  className={`dashboard-alert-card is-${alerta.tone}`}
                >
                  <span className="dashboard-alert-icon">
                    <Icon />
                  </span>
                  <strong>{alerta.value}</strong>
                  <span>{alerta.label}</span>
                </div>
              );
            })}
          </div>

          <div className="dashboard-util-grid">
            <div className="dashboard-util-card">
              <span className="dashboard-util-kicker">Ocupacion</span>
              <strong>Gabinetes de hoy</strong>
              <div className="dashboard-util-list">
                {actividadPorGabinete.map((item) => (
                  <div key={item.id} className="dashboard-util-row">
                    <span>{item.nombre}</span>
                    <strong>{item.total} turnos</strong>
                  </div>
                ))}
                {!actividadPorGabinete.length ? (
                  <div className="dashboard-empty dashboard-empty-inline">
                    Sin actividad registrada para hoy.
                  </div>
                ) : null}
              </div>
            </div>

            <div className="dashboard-util-card">
              <span className="dashboard-util-kicker">Capacidad</span>
              <strong>Base operativa</strong>
              <div className="dashboard-capacity-grid">
                <div>
                  <FiUsers />
                  <span>{usuarios.length} clientes</span>
                </div>
                <div>
                  <FiScissors />
                  <span>{resumen.serviciosActivos} servicios</span>
                </div>
                <div>
                  <FiHome />
                  <span>{resumen.gabinetesActivos} gabinetes</span>
                </div>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="dashboard-actions-grid">
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;

          return (
            <Link key={action.to} to={action.to} className="dashboard-action-card">
              <span className="dashboard-action-icon">
                <Icon />
              </span>
              <strong>{action.title}</strong>
              <p>{action.description}</p>
              <span className="dashboard-action-link">
                Abrir <FiArrowRight />
              </span>
            </Link>
          );
        })}
      </section>
    </div>
  );
}

import { Link, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  FiAlertTriangle,
  FiCalendar,
  FiDollarSign,
  FiGrid,
  FiHome,
  FiLogOut,
  FiMenu,
  FiScissors,
  FiSettings,
  FiUsers,
} from "react-icons/fi";
import { collection, onSnapshot } from "firebase/firestore";
import { useAuth } from "../../context/AuthContext.jsx";
import { db } from "../../Firebase.js";
import { getEstadoTurno } from "../admin/panels/turnosAdmin/turnosAdminHelpers.js";

const NAV_GROUPS = [
  {
    label: "Operacion",
    items: [
      {
        to: "/admin/dashboard",
        key: "dashboard",
        title: "Dashboard",
        subtitle: "Resumen y actividad",
        icon: FiGrid,
      },
      {
        to: "/admin/turnos",
        key: "turnos",
        title: "Turnos",
        subtitle: "Agenda y reservas",
        icon: FiCalendar,
      },
      {
        to: "/admin/clientes",
        key: "clientes",
        title: "Clientes",
        subtitle: "Historial y seguimiento",
        icon: FiUsers,
      },
      {
        to: "/admin/liquidaciones",
        key: "liquidaciones",
        title: "Liquidaciones",
        subtitle: "Cierres e historial",
        icon: FiDollarSign,
      },
    ],
  },
  {
    label: "Configuracion",
    items: [
      {
        to: "/admin/servicios",
        key: "servicios",
        title: "Servicios",
        subtitle: "Catalogo y agenda",
        icon: FiScissors,
      },
      {
        to: "/admin/gabinetes",
        key: "gabinetes",
        title: "Gabinetes",
        subtitle: "Espacios y horarios",
        icon: FiHome,
      },
      {
        to: "/admin/configuracion",
        key: "configuracion",
        title: "Configuracion",
        subtitle: "Sistema y visuales",
        icon: FiSettings,
      },
    ],
  },
];

const ROLE_LABELS = {
  4: "Dueño",
  3: "Administrador",
  2: "Asistente",
  1: "Profesional",
};

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [turnosSinConfirmar, setTurnosSinConfirmar] = useState(0);

  const currentGroup = NAV_GROUPS.find((group) =>
    group.items.some((item) => location.pathname.startsWith(item.to)),
  );
  const roleLabel = ROLE_LABELS[Number(user?.nivel || 0)] || "Equipo";
  const userName =
    user?.nombre || user?.displayName || user?.email || "Administracion";

  useEffect(() => {
    return onSnapshot(collection(db, "turnos"), (snap) => {
      const cantidad = snap.docs.reduce((acc, item) => {
        const turno = item.data();
        const estadoTurno = getEstadoTurno(turno);

        if (
          estadoTurno === "pendiente" ||
          estadoTurno === "pendiente_aprobacion"
        ) {
          return acc + 1;
        }

        return acc;
      }, 0);

      setTurnosSinConfirmar(cantidad);
    });
  }, []);

  function linkClass(path) {
    return location.pathname.includes(path)
      ? "admin-link active"
      : "admin-link";
  }

  function cerrarSidebar() {
    setSidebarOpen(false);
  }

  async function handleLogout() {
    cerrarSidebar();
    await logout();
  }

  return (
    <div className="admin-layout">
      <button
        type="button"
        className="admin-menu-toggle"
        onClick={() => setSidebarOpen((prev) => !prev)}
        aria-label="Abrir menu admin"
      >
        <FiMenu />
      </button>

      <div
        className={`admin-overlay ${sidebarOpen ? "active" : ""}`}
        onClick={cerrarSidebar}
      />

      <aside className={`admin-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="admin-sidebar-brand">
          <span className="admin-sidebar-kicker">Panel</span>
          <h3 className="admin-logo">Administracion</h3>
          <p className="admin-sidebar-copy">
            Gestiona turnos, clientes, liquidaciones y configuracion desde un
            solo lugar.
          </p>
        </div>

        <section className="admin-sidebar-context" aria-label="Sesion actual">
          <div className="admin-sidebar-user">
            <span className="admin-sidebar-user-label">Sesion activa</span>
            <strong>{userName}</strong>
            <small>{roleLabel}</small>
          </div>
        </section>

        {turnosSinConfirmar > 0 ? (
          <Link
            to="/admin/turnos"
            className="admin-sidebar-alert"
            onClick={cerrarSidebar}
          >
            <span className="admin-sidebar-alert-icon" aria-hidden="true">
              <FiAlertTriangle />
            </span>
            <span className="admin-sidebar-alert-copy">
              <strong>
                {turnosSinConfirmar}{" "}
                {turnosSinConfirmar === 1
                  ? "turno sin confirmar"
                  : "turnos sin confirmar"}
              </strong>
              <small>Revisalos desde la agenda admin.</small>
            </span>
          </Link>
        ) : null}

        <nav className="admin-nav">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="admin-nav-group">
              <span className="admin-nav-group-label">{group.label}</span>

              <div className="admin-nav-group-items">
                {group.items.map((item) => {
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.key}
                      to={item.to}
                      className={linkClass(item.key)}
                      onClick={cerrarSidebar}
                    >
                      <span className="admin-link-icon" aria-hidden="true">
                        <Icon />
                      </span>
                      <span className="admin-link-copy">
                        <strong>{item.title}</strong>
                        <small>{item.subtitle}</small>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <button type="button" className="admin-logout" onClick={handleLogout}>
            <span className="admin-link-icon" aria-hidden="true">
              <FiLogOut />
            </span>
            <span className="admin-link-copy">
              <strong>Cerrar sesion</strong>
              <small>Salir del panel administrativo</small>
            </span>
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}

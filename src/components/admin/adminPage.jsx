import { Link, Outlet, useLocation } from "react-router-dom";
import { useState } from "react";

export default function AdminPage() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function linkClass(path) {
    return location.pathname.includes(path)
      ? "admin-link active"
      : "admin-link";
  }

  function cerrarSidebar() {
    setSidebarOpen(false);
  }

  return (
    <div className="admin-layout">
      {/* BOTÓN HAMBURGUESA (mobile) */}
      <button
        className="admin-menu-toggle"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        ☰
      </button>

      {/* OVERLAY */}
      <div
        className={`admin-overlay ${sidebarOpen ? "active" : ""}`}
        onClick={cerrarSidebar}
      />

      {/* SIDEBAR */}
      <aside className={`admin-sidebar ${sidebarOpen ? "open" : ""}`}>
        <h3 className="admin-logo">Admin</h3>

        <nav>
          <Link
            to="/admin/dashboard"
            className={linkClass("dashboard")}
            onClick={cerrarSidebar}
          >
            Dashboard
          </Link>

          <Link
            to="/admin/turnos"
            className={linkClass("turnos")}
            onClick={cerrarSidebar}
          >
            Turnos
          </Link>

          <Link
            to="/admin/servicios"
            className={linkClass("servicios")}
            onClick={cerrarSidebar}
          >
            Servicios
          </Link>

          <Link
            to="/admin/gabinetes"
            className={linkClass("gabinetes")}
            onClick={cerrarSidebar}
          >
            Gabinetes
          </Link>
        </nav>
      </aside>

      {/* CONTENIDO */}
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}

import { Link, Outlet, useLocation } from "react-router-dom";

export default function AdminPage() {
  const location = useLocation();

  function linkClass(path) {
    return location.pathname.includes(path)
      ? "admin-link active"
      : "admin-link";
  }

  return (
    <div className="admin-layout">
      {/* SIDEBAR */}
      <aside className="admin-sidebar">
        <h3 className="admin-logo">Admin</h3>

        <nav>
          <Link to="/admin/dashboard" className={linkClass("dashboard")}>
            Dashboard
          </Link>

          <Link to="/admin/turnos" className={linkClass("turnos")}>
            Turnos
          </Link>

          <Link to="/admin/servicios" className={linkClass("servicios")}>
            Servicios
          </Link>

          <Link to="/admin/gabinetes" className={linkClass("gabinetes")}>
            Gabinetes
          </Link>
        </nav>
      </aside>

      {/* CONTENIDO */}
      <main className="admin-content">
        <Outlet />
      </main>
    </div>
  );
}

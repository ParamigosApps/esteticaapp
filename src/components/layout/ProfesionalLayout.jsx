import { NavLink, Outlet } from "react-router-dom";
import { FiCalendar, FiClipboard, FiLogOut } from "react-icons/fi";
import { useAuth } from "../../context/AuthContext.jsx";

export default function ProfesionalLayout() {
  const { user, logout } = useAuth();

  async function handleLogout() {
    await logout();
  }

  return (
    <div className="prof-layout">
      <aside className="prof-sidebar">
        <div className="prof-brand">
          <span className="prof-kicker">Panel profesional</span>
          <h2>{user?.nombre || user?.displayName || "Profesional"}</h2>
          <p>Gestiona tu agenda, revisa tus turnos y completa el historial del cliente.</p>
        </div>

        <nav className="prof-nav">
          <NavLink
            to="/profesional"
            end
            className={({ isActive }) =>
              isActive ? "prof-link active" : "prof-link"
            }
          >
            <FiCalendar />
            <span>Mi agenda</span>
          </NavLink>
        </nav>

        <div className="prof-link prof-link-static">
          <FiClipboard />
          <span>Historial clinico integrado</span>
        </div>

        <button type="button" className="prof-logout" onClick={handleLogout}>
          <FiLogOut />
          <span>Cerrar sesion</span>
        </button>
      </aside>

      <main className="prof-main">
        <Outlet />
      </main>
    </div>
  );
}

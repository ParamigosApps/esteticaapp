import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useEffect, useState } from "react";

import logo from "../../assets/img/logo.png";
import LoginModal from "./LoginModal";

export default function Navbar() {
  const { user, logout, loginEnProceso } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const userName = user?.nombre || user?.displayName || "Mi cuenta";
  const userInitial = userName.trim().charAt(0).toUpperCase();
  const nivel = Number(user?.nivel || 0);
  const esAdmin = nivel >= 3;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (user || loginEnProceso) return;
    if (location.pathname !== "/") return;

    const shouldOpenLogin =
      window.sessionStorage.getItem("openLoginOnHome") === "1";

    if (!shouldOpenLogin) return;

    window.sessionStorage.removeItem("openLoginOnHome");
    setLoginOpen(true);
  }, [location.pathname, user, loginEnProceso]);

  return (
    <header className="app-header">
      <Link className="navbar-brand" to="/">
        <img src={logo} alt="Logo" className="header-logo-img" />
      </Link>

      {!user && !loginEnProceso && (
        <button className="nav-login" onClick={() => setLoginOpen(true)}>
          Iniciar sesion
        </button>
      )}

      {!user && loginEnProceso && (
        <button className="nav-login" onClick={() => setLoginOpen(true)}>
          Logeando...
        </button>
      )}

      {user && (
        <div className="user-dropdown">
          <button
            type="button"
            className={`nav-user ${menuOpen ? "nav-user-open" : ""}`}
            onClick={() => setMenuOpen((prev) => !prev)}
          >
            <span className="nav-user-avatar" aria-hidden="true">
              {userInitial}
            </span>
            <span className="nav-user-copy">
              <span className="nav-user-label">Mi cuenta</span>
              <b className="nav-user-name">{userName}</b>
            </span>
            <span className="nav-user-caret" aria-hidden="true">
              {menuOpen ? "^" : "v"}
            </span>
          </button>

          {menuOpen && (
            <div className="dropdown-menu-custom">
              <div className="dropdown-menu-head">
                <span className="dropdown-menu-kicker">Cuenta activa</span>
                <strong className="dropdown-menu-name">{userName}</strong>
              </div>

              {esAdmin ? (
                <Link
                  className="dropdown-item dropdown-item-primary"
                  to="/admin/dashboard"
                  onClick={() => setMenuOpen(false)}
                >
                  <span className="dropdown-item-title">Ir al panel</span>
                  <span className="dropdown-item-copy">
                    Entrar a la administracion del sistema
                  </span>
                </Link>
              ) : null}

              <div className="dropdown-menu-group">
              <Link
                className="dropdown-item"
                to="/mis-turnos"
                onClick={() => setMenuOpen(false)}
              >
                <span className="dropdown-item-title">Mis turnos</span>
                <span className="dropdown-item-copy">Ver reservas y estados</span>
              </Link>

              <Link
                className="dropdown-item"
                to="/mi-perfil"
                onClick={() => setMenuOpen(false)}
              >
                <span className="dropdown-item-title">Mi perfil</span>
                <span className="dropdown-item-copy">Editar datos personales</span>
              </Link>
              </div>

              <div className="dropdown-divider" />

              <button
                type="button"
                className="dropdown-item dropdown-item-danger"
                onClick={async () => {
                  setMenuOpen(false);
                  await logout();
                }}
              >
                <span className="dropdown-item-title">Cerrar sesion</span>
                <span className="dropdown-item-copy">Salir de esta cuenta</span>
              </button>
            </div>
          )}
        </div>
      )}

      {loginOpen && (
        <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
      )}
    </header>
  );
}

import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useState } from "react";

import logo from "../../assets/img/logo.png";
import LoginModal from "./LoginModal";

export default function Navbar() {
  const { user, logout, loginEnProceso } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  return (
    <header className="app-header">
      <Link className="navbar-brand" to="/">
        <img src={logo} alt="Logo" className="header-logo-img" />
      </Link>
      {!user && !loginEnProceso && (
        <button className="nav-login" onClick={() => setLoginOpen(true)}>
          Iniciar sesión
        </button>
      )}

      {!user && loginEnProceso && (
        <button className="nav-login" onClick={() => setLoginOpen(true)}>
          Logeando..
        </button>
      )}
      {user && (
        <div className="user-dropdown">
          <button className="nav-user" onClick={() => setMenuOpen(!menuOpen)}>
            Hola, <b>{user.nombre || user.displayName}</b>
          </button>

          {menuOpen && (
            <div className="dropdown-menu-custom">
              <Link
                className="dropdown-item"
                to="/mis-turnos"
                onClick={() => setMenuOpen(false)}
              >
                Mis turnos
              </Link>

              <Link
                className="dropdown-item"
                to="/mi-perfil"
                onClick={() => setMenuOpen(false)}
              >
                Mi perfil
              </Link>

              <hr />

              <button
                className="dropdown-item text-danger"
                onClick={async () => {
                  setMenuOpen(false);
                  await logout();
                }}
              >
                Cerrar sesión
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

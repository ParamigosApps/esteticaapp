// --------------------------------------------------------------
// src/components/Navbar.jsx — FINAL UNIFICADO
// --------------------------------------------------------------
import { Link } from "react-router-dom";

import logo from "../assets/img/logo.png";

export default function Navbar() {
  return (
    <header className="app-header">
      {/* LOGO */}
      <Link className="navbar-brand" to="/">
        <img src={logo} alt="Logo" className="header-logo-img" />
      </Link>
    </header>
  );
}

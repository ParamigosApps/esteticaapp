import { Outlet } from "react-router-dom";
import Navbar from "../components/Navbar.jsx";

export default function PublicLayout() {
  return (
    <div className="public-layout">
      <Navbar />
      <main className="public-content">
        <Outlet />
      </main>
      <footer className="public-legal-footer">
        <span>Politica de privacidad</span>
        <span className="public-legal-separator">·</span>
        <span>Terminos de servicio</span>
      </footer>
    </div>
  );
}

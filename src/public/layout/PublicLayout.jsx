import { Outlet } from "react-router-dom";
import Navbar from "../components/Navbar.jsx";
import LegalLinks from "../../components/common/LegalLinks.jsx";

export default function PublicLayout() {
  return (
    <div className="public-layout">
      <Navbar />
      <main className="public-content">
        <Outlet />
      </main>
      <footer className="public-legal-footer">
        <LegalLinks />
      </footer>
    </div>
  );
}

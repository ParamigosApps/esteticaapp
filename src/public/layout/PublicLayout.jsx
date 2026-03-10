import { Outlet } from "react-router-dom";
import Navbar from "../components/Navbar.jsx";

export default function PublicLayout() {
  return (
    <div className="public-layout">
      <Navbar />
      <main className="public-content">
        <Outlet />
      </main>
    </div>
  );
}

import { useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";

import PublicLayout from "./public/layout/PublicLayout.jsx";

import Home from "./pages/Home.jsx";
import NotFound from "./pages/NotFound.jsx";

import LoginEmpleado from "./pages/LoginEmpleado.jsx";

import AdminRoute from "./components/admin/routes/AdminRoute.jsx";
import ProfesionalRoute from "./components/profesional/routes/ProfesionalRoute.jsx";
import AdminLayout from "./components/layout/AdminLayout.jsx";
import ProfesionalLayout from "./components/layout/ProfesionalLayout.jsx";
import AdminDashboard from "./components/admin/panels/AdminDashboardPanel.jsx";
import TurnosAdminPanel from "./components/admin/panels/TurnosAdminPanel.jsx";
import AdminConfiguracion from "./components/admin/panels/ConfiguracionPanel.jsx";
import ServiciosPanel from "./components/admin/panels/ServiciosPanel.jsx";
import GabinetesPanel from "./components/admin/panels/GabinetesPanel.jsx";
import LiquidacionesPanel from "./components/admin/panels/LiquidacionesPanel.jsx";
import ClientesAdminPanel from "./components/admin/panels/ClientesAdminPanel.jsx";
import ProfesionalAgendaPanel from "./components/profesional/panels/ProfesionalAgendaPanel.jsx";

import { ServiciosProvider } from "./context/ServiciosContext";

import PagoResultado from "./pages/PagoResultado.jsx";

import MisTurnos from "./public/pages/MisTurnos.jsx";
import MiPerfil from "./public/pages/MiPerfil.jsx";

import { ToastContainer } from "react-toastify";
import { db } from "./Firebase.js";

const DEFAULT_TITLE = "PIEL Y CEJAS";

function resolvePageTitle(pathname) {
  if (pathname === "/") return "Inicio - PIEL Y CEJAS";
  if (pathname === "/acceso") return "Acceso - PIEL Y CEJAS";
  if (pathname === "/mis-turnos") return "Mis turnos - PIEL Y CEJAS";
  if (pathname === "/mi-perfil") return "Mi perfil - PIEL Y CEJAS";
  if (pathname === "/pago-resultado") return "Confirmando pago - PIEL Y CEJAS";

  if (pathname === "/admin" || pathname.startsWith("/admin/dashboard")) {
    return "Dashboard | Admin | PIEL Y CEJAS";
  }
  if (pathname.startsWith("/admin/turnos")) {
    return "Turnos y reservas | Admin | PIEL Y CEJAS";
  }
  if (pathname.startsWith("/admin/clientes")) {
    return "Clientes | Admin | PIEL Y CEJAS";
  }
  if (pathname.startsWith("/admin/liquidaciones")) {
    return "Liquidaciones | Admin | PIEL Y CEJAS";
  }
  if (pathname.startsWith("/admin/configuracion")) {
    return "Configuracion | Admin | PIEL Y CEJAS";
  }
  if (pathname.startsWith("/admin/servicios")) {
    return "Servicios | Admin | PIEL Y CEJAS";
  }
  if (pathname.startsWith("/admin/gabinetes")) {
    return "Gabinetes | Admin | PIEL Y CEJAS";
  }

  if (pathname === "/profesional" || pathname.startsWith("/profesional/")) {
    return "Mi agenda | Profesional | PIEL Y CEJAS";
  }

  return DEFAULT_TITLE;
}

function TitleManager() {
  const location = useLocation();

  useEffect(() => {
    document.title = resolvePageTitle(location.pathname);
  }, [location.pathname]);

  return null;
}

function FaviconManager() {
  useEffect(() => {
    return onSnapshot(doc(db, "configuracion", "homeVisuales"), (snap) => {
      const data = snap.exists() ? snap.data() : {};
      const faviconUrl = String(data?.faviconUrl || "").trim();

      if (!faviconUrl) return;

      let link = document.querySelector("link[rel='icon']");
      if (!link) {
        link = document.createElement("link");
        link.setAttribute("rel", "icon");
        document.head.appendChild(link);
      }

      link.setAttribute("href", faviconUrl);
    });
  }, []);

  return null;
}

export default function App() {
  return (
    <ServiciosProvider>
      <>
        <TitleManager />
        <FaviconManager />

        <ToastContainer
          position="top-center"
          autoClose={3000}
          hideProgressBar
          closeOnClick
          pauseOnHover
          draggable
        />

        <Routes>
          {/* LOGIN EMPLEADOS */}
          <Route path="/acceso" element={<LoginEmpleado />} />

          {/* ADMIN PROTEGIDO */}
          <Route element={<AdminRoute />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboard />} />
              <Route path="dashboard" element={<AdminDashboard />} />
              <Route path="turnos" element={<TurnosAdminPanel />} />
              <Route path="clientes" element={<ClientesAdminPanel />} />
              <Route path="liquidaciones" element={<LiquidacionesPanel />} />
              <Route path="configuracion" element={<AdminConfiguracion />} />
              <Route path="servicios" element={<ServiciosPanel />} />
              <Route path="gabinetes" element={<GabinetesPanel />} />
            </Route>
          </Route>

          <Route element={<ProfesionalRoute />}>
            <Route path="/profesional" element={<ProfesionalLayout />}>
              <Route index element={<ProfesionalAgendaPanel />} />
            </Route>
          </Route>

          {/* PÚBLICO */}
          <Route element={<PublicLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/mis-turnos" element={<MisTurnos />} />
            <Route path="/mi-perfil" element={<MiPerfil />} />
            <Route path="/pago-resultado" element={<PagoResultado />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>

        <div id="recaptcha-container"></div>
      </>
    </ServiciosProvider>
  );
}

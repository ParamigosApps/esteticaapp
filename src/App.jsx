import { Routes, Route } from "react-router-dom";

import Layout from "./components/layout/Layout.jsx";
import Home from "./pages/Home.jsx";
import NotFound from "./pages/NotFound.jsx";

import LoginEmpleado from "./pages/LoginEmpleado.jsx";

import AdminRoute from "./components/admin/AdminRoute.jsx";
import AdminPage from "./components/admin/AdminPage.jsx";
import AdminDashboard from "./components/admin/AdminDashboard.jsx";
import TurnosAdminPanel from "./components/admin/TurnosAdminPanel.jsx";
import ServiciosPanel from "./components/admin/ServiciosPanel.jsx";
import GabinetesPanel from "./components/admin/GabinetesPanel.jsx";

import { ServiciosProvider } from "./context/ServiciosContext";

import PagoResultado from "./pages/PagoResultado.jsx";
import { ToastContainer } from "react-toastify";

export default function App() {
  return (
    <ServiciosProvider>
      <>
        <ToastContainer
          position="top-center"
          autoClose={3000}
          hideProgressBar
          closeOnClick
          pauseOnHover
          draggable
        />

        <Routes>
          {/* Login empleados */}
          <Route path="/acceso" element={<LoginEmpleado />} />

          {/* ADMIN PROTEGIDO */}
          <Route element={<AdminRoute />}>
            <Route path="/admin" element={<AdminPage />}>
              <Route index element={<AdminDashboard />} />
              <Route path="dashboard" element={<AdminDashboard />} />
              <Route path="turnos" element={<TurnosAdminPanel />} />
              <Route path="servicios" element={<ServiciosPanel />} />
              <Route path="gabinetes" element={<GabinetesPanel />} />
            </Route>
          </Route>

          {/* Público */}
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/pago-resultado" element={<PagoResultado />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>

        <div id="recaptcha-container"></div>
      </>
    </ServiciosProvider>
  );
}

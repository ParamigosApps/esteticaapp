import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext.jsx";

export default function ProfesionalRoute() {
  const { loading, user, nivel } = useAuth();

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center" }}>Cargando...</div>;
  }

  if (!user) {
    return <Navigate to="/acceso" replace />;
  }

  if (Number(nivel || 0) < 1) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

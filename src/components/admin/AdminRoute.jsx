import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";

export default function AdminRoute() {
  const { loading, user, esAdminReal } = useAuth();

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center" }}>Cargando…</div>;
  }

  if (!user) {
    return <Navigate to="/acceso" replace />;
  }

  if (!esAdminReal) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

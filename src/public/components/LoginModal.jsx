import { useEffect } from "react";
import LoginPanel from "../home/LoginPanel.jsx";
import { useAuth } from "../../context/AuthContext";

export default function LoginModal({ open, onClose }) {
  const { user, loading, loginEnProceso } = useAuth();

  // cerrar si se inicia login o si el usuario ya está logueado
  useEffect(() => {
    if (user || loading || loginEnProceso) {
      onClose();
    }
  }, [user, loading, loginEnProceso, onClose]);

  // cerrar con ESC
  useEffect(() => {
    if (!open) return;

    const esc = (e) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);

  // no renderizar nada si no corresponde
  if (!open || loading || user || loginEnProceso) return null;

  return (
    <div className="login-modal-overlay" onClick={onClose}>
      <div className="login-modal-box" onClick={(e) => e.stopPropagation()}>
        <button className="login-modal-close" onClick={onClose}>
          ✕
        </button>

        <h4 className="text-center mb-3">Iniciar sesión</h4>

        <LoginPanel />
      </div>
    </div>
  );
}

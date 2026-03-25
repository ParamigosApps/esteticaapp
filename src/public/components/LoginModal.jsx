import { useEffect } from "react";
import LoginPanel from "../home/LoginPanel.jsx";
import { useAuth } from "../../context/AuthContext";
import LegalLinks from "../../components/common/LegalLinks.jsx";

export default function LoginModal({ open, onClose }) {
  const { user, loading, loginEnProceso } = useAuth();

  useEffect(() => {
    if (user || loading || loginEnProceso) {
      onClose();
    }
  }, [user, loading, loginEnProceso, onClose]);

  useEffect(() => {
    if (!open) return;

    const esc = (e) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);

  if (!open || loading || user || loginEnProceso) return null;

  return (
    <div className="login-modal-overlay" onClick={onClose}>
      <div className="login-modal-box" onClick={(e) => e.stopPropagation()}>
        <button className="login-modal-close" onClick={onClose}>
          X
        </button>

        <h4 className="text-center mb-3">Iniciar sesión</h4>

        <LoginPanel />

        <div className="login-modal-legal">
          <LegalLinks onNavigate={onClose} />
        </div>
      </div>
    </div>
  );
}

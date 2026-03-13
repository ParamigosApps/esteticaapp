// --------------------------------------------------------------
// src/pages/PagoResultado.jsx
// --------------------------------------------------------------
import { useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { doc, getDoc, getDocFromServer } from "firebase/firestore";
import Swal from "sweetalert2";
import { db } from "../Firebase.js";

import { showLoading, hideLoading } from "../services/loadingService.js";

const POLL_INTERVAL = 3000;
const MAX_INTENTOS = 40;

function normalizarEstado(raw) {
  const s = (raw || "").toLowerCase();

  if (["aprobado", "approved", "success", "pagado", "paid"].includes(s)) {
    return "aprobado";
  }

  if (["rechazado", "rejected", "cancelled", "failure"].includes(s)) {
    return "rechazado";
  }

  if (["monto_invalido"].includes(s)) {
    return "aprobado_con_error";
  }

  if (["pendiente_mp", "pending", "in_process"].includes(s)) {
    return "pendiente";
  }

  return "pendiente";
}

export default function PagoResultado() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const pagoId =
    params.get("external_reference") || localStorage.getItem("pagoIdEnProceso");

  const intervalRef = useRef(null);
  const intentosRef = useRef(0);

  const abrirModalVerificacion = () => {
    showLoading({
      title: "Confirmando pago",
      text: "Estamos verificando tu pago. Esto puede demorar unos instantes...",
      showBackButton: true,
      showCloseButton: true,
      backButtonText: "Volver atras",
      onBack: cerrarVerificacion,
      onClose: handleIntentarCerrar,
    });
  };

  const cerrarVerificacion = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    localStorage.removeItem("pagoIdEnProceso");
    hideLoading();

    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
  };

  const handleIntentarCerrar = async () => {
    const result = await Swal.fire({
      icon: "warning",
      title: "Desestimar verificacion",
      text: "Si continuas, se desestimara la solicitud de pago y el turno volvera a estar disponible.",
      showCancelButton: true,
      confirmButtonText: "Si, cerrar",
      cancelButtonText: "Seguir verificando",
      reverseButtons: true,
      customClass: {
        popup: "swal-popup-custom",
        confirmButton: "swal-btn-confirm",
        cancelButton: "swal-btn-cancel",
      },
      buttonsStyling: false,
    });

    if (result.isConfirmed) {
      cerrarVerificacion();
      return;
    }

    abrirModalVerificacion();
  };

  useEffect(() => {
    if (!pagoId) {
      navigate("/");
      return;
    }

    abrirModalVerificacion();

    const checkPago = async () => {
      intentosRef.current += 1;

      try {
        const ref = doc(db, "pagos", pagoId);
        let snap;

        try {
          snap = await getDocFromServer(ref);
        } catch {
          snap = await getDoc(ref);
        }

        if (!snap.exists()) return;

        const pago = snap.data();
        const tipo = pago.tipo || "compra";
        const estado = normalizarEstado(pago.estado);

        if (estado === "aprobado" || estado === "pagado") {
          localStorage.setItem(
            "avisoPostPago",
            tipo === "entrada" ? "entrada_aprobada" : "compra_aprobada",
          );
          localStorage.removeItem("pagoIdEnProceso");
          clearInterval(intervalRef.current);
          hideLoading();
          navigate("/");
          return;
        }

        if (estado === "aprobado_con_error") {
          localStorage.setItem(
            "avisoPostPago",
            tipo === "entrada"
              ? "entrada_aprobada_error"
              : "compra_aprobada_error",
          );
          localStorage.removeItem("pagoIdEnProceso");
          clearInterval(intervalRef.current);
          hideLoading();
          navigate("/");
          return;
        }

        if (estado === "rechazado") {
          localStorage.setItem(
            "avisoPostPago",
            tipo === "entrada" ? "entrada_rechazada" : "compra_rechazada",
          );
          localStorage.removeItem("pagoIdEnProceso");
          clearInterval(intervalRef.current);
          hideLoading();
          navigate("/");
          return;
        }

        if (intentosRef.current >= MAX_INTENTOS) {
          localStorage.setItem(
            "avisoPostPago",
            tipo === "entrada" ? "entrada_pendiente" : "compra_pendiente",
          );
          clearInterval(intervalRef.current);
          hideLoading();
          navigate("/");
        }
      } catch (err) {
        console.error("Error verificando pago:", err);
      }
    };

    void checkPago();
    intervalRef.current = setInterval(checkPago, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      hideLoading();
    };
  }, [navigate, pagoId]);

  return (
    <div
      className="d-flex flex-column justify-content-center align-items-center text-center"
      style={{ minHeight: "100vh", padding: "24px" }}
    >
      <p className="text-muted mb-3">
        Si cerraste la ventana de verificacion, podes volver atras desde aca.
      </p>

      <button
        type="button"
        className="btn btn-outline-secondary"
        onClick={cerrarVerificacion}
      >
        Volver atras
      </button>
    </div>
  );
}

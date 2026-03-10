// --------------------------------------------------------------
// src/pages/PagoResultado.jsx — FINAL DEFINITIVA
// --------------------------------------------------------------
import { useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { doc, getDoc, getDocFromServer } from "firebase/firestore";
import { db } from "../Firebase.js";

import { showLoading, hideLoading } from "../services/loadingService.js";

// --------------------------------------------------------------
const POLL_INTERVAL = 3000; // 3 segundos
const MAX_INTENTOS = 40; // ~2 minutos
// --------------------------------------------------------------

// Normaliza SOLO el estado de negocio
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

  // --------------------------------------------------------------
  // MOUNT / UNMOUNT (debug controlado)
  // --------------------------------------------------------------
  useEffect(() => {
    console.log("🧠 PagoResultado MOUNT", { pagoId });
    return () => console.log("💥 PagoResultado UNMOUNT");
  }, []);

  // --------------------------------------------------------------
  // POLLING ÚNICO
  // --------------------------------------------------------------
  useEffect(() => {
    if (!pagoId) {
      console.warn("⚠️ PagoResultado sin pagoId");
      navigate("/");
      return;
    }

    showLoading({
      title: "Confirmando pago",
      text: "Estamos verificando tu pago. Esto puede demorar unos instantes…",
      showBackButton: true,
      backButtonText: "Volver atrás",
      onBack: () => {
        if (intervalRef.current) clearInterval(intervalRef.current);

        localStorage.removeItem("pagoIdEnProceso");

        if (window.history.length > 1) {
          navigate(-1);
        } else {
          navigate("/");
        }
      },
    });

    const checkPago = async () => {
      intentosRef.current += 1;

      console.log(
        `🔍 [PagoResultado] intento ${intentosRef.current}/${MAX_INTENTOS}`,
        { pagoId },
      );

      try {
        const ref = doc(db, "pagos", pagoId);
        let snap;
        try {
          snap = await getDocFromServer(ref);
        } catch (error) {
          console.warn("⚠️ getDocFromServer falló, usando cache:", error);
          snap = await getDoc(ref);
        }

        // El webhook todavía no creó / actualizó el pago
        if (!snap.exists()) {
          console.warn("⏳ Pago aún no existe en Firestore");
          return;
        }

        const pago = snap.data();
        const tipo = pago.tipo || "compra";

        const estado = normalizarEstado(pago.estado);

        console.log("📄 Estado Firestore:", {
          estadoRaw: pago.estado,
          estadoNormalizado: estado,
          mpStatus: pago.mpStatus || null,
          mpDetail: pago.mpDetail || null,
        });

        // ------------------ APROBADO ------------------
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

        // ------------------ APROBADO CON ERROR ------------------
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

        // ------------------ RECHAZADO ------------------
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

        // ------------------ TIMEOUT ------------------
        if (intentosRef.current >= MAX_INTENTOS) {
          console.warn("⏳ Timeout: pago sigue pendiente");

          localStorage.setItem(
            "avisoPostPago",
            tipo === "entrada" ? "entrada_pendiente" : "compra_pendiente",
          );

          clearInterval(intervalRef.current);
          hideLoading();
          navigate("/");
        }
      } catch (err) {
        console.error("❌ Error verificando pago:", err);
      }
    };

    // Ejecutar inmediato + polling
    checkPago();
    intervalRef.current = setInterval(checkPago, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      hideLoading();
    };
  }, [pagoId]); // ⛔ NO agregar navigate aquí

  const handleVolverAtras = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    localStorage.removeItem("pagoIdEnProceso");
    hideLoading();

    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
  };

  return (
    <div
      className="d-flex flex-column justify-content-center align-items-center text-center"
      style={{ minHeight: "100vh", padding: "24px" }}
    >
      <p className="text-muted mb-3">
        Estamos confirmando tu pago. Esto puede demorar unos instantes…
      </p>

      <button
        type="button"
        className="btn btn-outline-secondary"
        onClick={handleVolverAtras}
      >
        Volver atrás
      </button>
    </div>
  );
}

// src/pages/Home.jsx
import { useEffect } from "react";
import Swal from "sweetalert2";

import Navbar from "../components/Navbar.jsx";
import MenuAcordeon from "../components/home/MenuAcordeon.jsx";

export default function Home() {
  useEffect(() => {
    const aviso = localStorage.getItem("avisoPostPago");
    if (!aviso) return;

    localStorage.removeItem("avisoPostPago");

    switch (aviso) {
      case "turno_aprobado":
        Swal.fire({
          icon: "success",
          title: "¡Turno confirmado!",
          html: `
            <p style="text-align:center;font-size:15px;">
              Tu seña fue acreditada correctamente 💚
            </p>
            <p style="text-align:center;color:#555;">
              Te esperamos en el horario reservado.
            </p>
          `,
          confirmButtonText: "Entendido",
          customClass: {
            confirmButton: "swal-btn-confirm",
          },
        });
        break;

      case "turno_rechazado":
        Swal.fire({
          icon: "error",
          title: "Pago rechazado",
          text: "No se realizó ningún cargo.",
          confirmButtonText: "Entendido",
          customClass: {
            confirmButton: "swal-btn-confirm",
          },
        });
        break;

      case "turno_pendiente":
        Swal.fire({
          icon: "warning",
          title: "Pago en verificación",
          html: `
            <p style="text-align:center;">
              Tu turno quedó reservado temporalmente ⏳
            </p>
            <p style="font-size:14px;color:#555;text-align:center;">
              Te avisaremos cuando se confirme.
            </p>
          `,
          confirmButtonText: "Entendido",
          customClass: {
            confirmButton: "swal-btn-confirm",
          },
        });
        break;

      default:
        console.warn("⚠️ avisoPostPago desconocido:", aviso);
    }
  }, []);

  return (
    <>
      <Navbar />

      <div className="container mt-1">
        <MenuAcordeon />
      </div>
    </>
  );
}

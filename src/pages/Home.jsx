// src/pages/Home.jsx

import { db } from "../Firebase";
import { doc, getDoc } from "firebase/firestore";

import { useEffect, useState } from "react";
import Swal from "sweetalert2";

import BuscadorServicios from "../public/components/buscador/BuscadorServicios";
import TurnosSection from "../public/home/TurnosSection.jsx";
import InfoContactoPanel from "../public/components/contacto/InfoContactoPanel.jsx";

import imgPrincipal from "../assets/img/local.jpg";
import imgSecundaria from "../assets/img/secundaria.png";
import whatsappIcon from "../assets/icons/whatsapp.png";

export default function Home() {
  const [busqueda, setBusqueda] = useState("");
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState(null);

  const [whatsapp, setWhatsapp] = useState(null);

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

  useEffect(() => {
    async function cargarWhatsapp() {
      const snap = await getDoc(doc(db, "configuracion", "social"));
      if (snap.exists()) {
        setWhatsapp(snap.data());
      }
    }

    cargarWhatsapp();
  }, []);

  return (
    <div className="home-wrapper">
      {/* HEADER NEGOCIO */}
      <section className="home-top">
        <div className="home-grid">
          {/* IZQUIERDA */}
          <div className="home-negocio">
            <img src={imgPrincipal} className="home-foto" />

            <div className="home-negocio-info">
              <img src={imgSecundaria} className="home-img-sec" />

              <div>
                <h1>PIEL & CEJAS</h1>

                <p className="home-sub">Cosmetología • Estética • Bienestar</p>

                <p className="home-desc">
                  Tratamientos faciales y corporales, masajes relajantes y
                  cuidado profesional de la piel en un ambiente pensado para tu
                  bienestar.
                </p>
              </div>
            </div>
          </div>

          {/* DERECHA */}
          <div className="home-panel">
            <InfoContactoPanel />
          </div>
        </div>
      </section>

      <section className="home-mid">
        <div className="home-grid-mid">
          {/* IZQUIERDA */}
          <div className="categorias-container">
            <BuscadorServicios
              busqueda={busqueda}
              setBusqueda={setBusqueda}
              setCategoriaSeleccionada={setCategoriaSeleccionada}
            />
          </div>

          {/* DERECHA */}
          <div className="home-turnos-panel">
            <TurnosSection
              busqueda={busqueda}
              categoriaSeleccionada={categoriaSeleccionada}
              setCategoriaSeleccionada={setCategoriaSeleccionada}
            />
          </div>
        </div>
      </section>
      {whatsapp?.whatsappContacto && (
        <div id="chat">
          <a
            href={`https://wa.me/54${whatsapp.whatsappContacto}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <img src={whatsappIcon} alt="WhatsApp" className="whatsappIcon" />
          </a>
        </div>
      )}
    </div>
  );
}

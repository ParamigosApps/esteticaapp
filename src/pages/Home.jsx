// src/pages/Home.jsx

import { db } from "../Firebase";
import { doc, getDoc } from "firebase/firestore";

import { useEffect, useRef, useState } from "react";
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
  const [homeVisuales, setHomeVisuales] = useState({
    imgPrincipalHome: "",
    imgSecundariaHome: "",
  });
  const agendaRef = useRef(null);

  useEffect(() => {
    const aviso = localStorage.getItem("avisoPostPago");
    if (!aviso) return;

    localStorage.removeItem("avisoPostPago");

    switch (aviso) {
      case "turno_aprobado":
        Swal.fire({
          icon: "success",
          title: "Turno confirmado",
          html: `
            <p style="text-align:center;font-size:15px;">
              Tu seña fue acreditada correctamente.
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
          text: "No se realizo ningun cargo.",
          confirmButtonText: "Entendido",
          customClass: {
            confirmButton: "swal-btn-confirm",
          },
        });
        break;

      case "turno_pendiente":
        Swal.fire({
          icon: "warning",
          title: "Pago en verificacion",
          html: `
            <p style="text-align:center;">
              Tu turno quedo reservado temporalmente.
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
        console.warn("avisoPostPago desconocido:", aviso);
    }
  }, []);

  useEffect(() => {
    async function cargarWhatsapp() {
      const [socialSnap, homeSnap] = await Promise.all([
        getDoc(doc(db, "configuracion", "social")),
        getDoc(doc(db, "configuracion", "homeVisuales")),
      ]);

      if (socialSnap.exists()) {
        setWhatsapp(socialSnap.data());
      }

      if (homeSnap.exists()) {
        setHomeVisuales((prev) => ({
          ...prev,
          ...homeSnap.data(),
        }));
      }
    }

    cargarWhatsapp();
  }, []);

  useEffect(() => {
    if (!categoriaSeleccionada) return;
    if (typeof window === "undefined") return;
    if (window.innerWidth > 992) return;

    const timer = window.setTimeout(() => {
      agendaRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 180);

    return () => window.clearTimeout(timer);
  }, [categoriaSeleccionada]);

  return (
    <div className="home-wrapper">
      <section className="home-top">
        <div className="home-grid">
          <div className="home-negocio">
            <div className="home-hero-media">
              <img
                src={homeVisuales.imgPrincipalHome || imgPrincipal}
                className="home-foto"
                alt="Cabina principal del centro estetico"
              />

              <div className="home-hero-overlay">
                <span className="home-badge">Cuidado consciente</span>
                <p className="home-overlay-text">
                  Un espacio pensado para verte bien y sentirte mejor.
                </p>
              </div>
            </div>

            <div className="home-negocio-info">
              <img
                src={homeVisuales.imgSecundariaHome || imgSecundaria}
                className="home-img-sec"
                alt="Espacio de atencion estetica"
              />

              <div className="home-descripcion-info">
                <span className="home-kicker">Estetica facial y bienestar</span>
                <h1>PIEL & CEJAS</h1>

                <p className="home-sub">Cosmetologia • Estetica • Bienestar</p>

                <p className="home-desc">
                  Tratamientos faciales y corporales, masajes relajantes y
                  cuidado profesional de la piel en un ambiente pensado para tu
                  bienestar.
                </p>

                <div className="home-highlights">
                  <div className="home-highlight-card">
                    <strong>Atencion personalizada</strong>
                    <span>Servicios adaptados a tu piel, objetivos y ritmo.</span>
                  </div>

                  <div className="home-highlight-card">
                    <strong>Reserva simple</strong>
                    <span>Elegi el servicio, el horario y confirma en minutos.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="home-panel">
            <InfoContactoPanel />
          </div>
        </div>
      </section>

      <section className="home-mid">
        <div className="home-grid-mid">
          <div className="categorias-container">
            <div className="home-section-heading">
              <span className="home-section-chip">Explora</span>
              <h2>Encontra tu servicio ideal</h2>
              <p>
                Busca por nombre o navega por categorias para ver todas las
                opciones disponibles.
              </p>
            </div>

            <BuscadorServicios
              busqueda={busqueda}
              setBusqueda={setBusqueda}
              categoriaSeleccionada={categoriaSeleccionada}
              setCategoriaSeleccionada={setCategoriaSeleccionada}
            />
          </div>

          <div className="home-turnos-panel" ref={agendaRef}>
            <div className="home-section-heading home-section-heading-inline">
              <span className="home-section-chip">Agenda online</span>
              <h2>Reserva tu proximo turno</h2>
            </div>

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
            aria-label="Abrir WhatsApp"
          >
            <img src={whatsappIcon} alt="WhatsApp" className="whatsappIcon" />
          </a>
        </div>
      )}
    </div>
  );
}

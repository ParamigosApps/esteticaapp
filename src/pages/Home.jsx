import { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import { Timestamp, doc, getDoc } from "firebase/firestore";

import { db } from "../Firebase";
import BuscadorServicios from "../public/components/buscador/BuscadorServicios";
import TurnosSection from "../public/home/TurnosSection.jsx";
import InfoContactoPanel from "../public/components/contacto/InfoContactoPanel.jsx";
import { swalTurnoConfirmado } from "../public/utils/swalUtils.js";

import imgPrincipal from "../assets/img/local.jpg";
import imgSecundaria from "../assets/img/secundaria.png";
import whatsappIcon from "../assets/icons/whatsapp.png";

const GOOGLE_REVIEWS_URL = "https://maps.app.goo.gl/gCBk4DB8cvrS6Pac9";

function getReviewsState(homeVisuales) {
  const displayCount = Math.min(
    4,
    Math.max(1, Number(homeVisuales?.reviewsDisplayCount || 2)),
  );
  const googlePromedio = Number(homeVisuales?.googleReviewsRating || 0);
  const googleTotal = Number(homeVisuales?.googleReviewsTotal || 0);
  const googleItems = Array.isArray(homeVisuales?.googleReviewsItems)
    ? homeVisuales.googleReviewsItems
    : [];
  const googleReviews = googleItems
    .map((review) => ({
      autor: String(review?.autor || "").trim() || "Cliente de Google",
      fecha: String(review?.fecha || "").trim() || "Google",
      texto: String(review?.texto || "").trim(),
    }))
    .filter((review) => review.texto)
    .slice(0, displayCount);

  if (googlePromedio > 0 || googleTotal > 0 || googleReviews.length > 0) {
    return {
      promedio: googlePromedio,
      total: googleTotal,
      reviews: googleReviews,
      source: "google",
    };
  }

  const manualItems = Array.isArray(homeVisuales?.manualReviewsItems)
    ? homeVisuales.manualReviewsItems
    : [];
  const manualReviews = manualItems
    .map((review) => ({
      autor: String(review?.autor || "").trim() || "Cliente",
      fecha: String(review?.fecha || "").trim() || "Resena verificada",
      texto: String(review?.texto || "").trim(),
    }))
    .filter((review) => review.texto)
    .slice(0, displayCount);

  return {
    promedio: Number(homeVisuales?.manualReviewsRating || 0),
    total: Number(homeVisuales?.manualReviewsTotal || 0),
    reviews: manualReviews,
    source: "manual",
  };
}

function formatUpdatedAt(value) {
  if (!value) return "";

  const date =
    value instanceof Timestamp
      ? value.toDate()
      : value instanceof Date
        ? value
        : new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function GoogleReviewsInline({ reviewsUrl, reviewsData, updatedAt }) {
  const estrellas = Array.from({ length: 5 }, (_, index) => (
    <span key={`estrella-${index}`} className="reviews-star" aria-hidden="true">
      {"\u2605"}
    </span>
  ));
  const tienePromedio = reviewsData.promedio > 0;
  const tieneTotal = reviewsData.total > 0;
  const tieneReviews =
    Array.isArray(reviewsData.reviews) && reviewsData.reviews.length > 0;
  const tieneContenido = tienePromedio || tieneReviews;

  if (!tieneContenido) {
    return null;
  }

  return (
    <div className="home-reviews-inline">
      <div className="home-reviews-inline-head">
        <div>
          <span className="home-section-chip reseñas-google">
            Reseñas Google
          </span>
          {tienePromedio ? (
            <div className="home-reviews-inline-rating">
              <strong>{reviewsData.promedio.toFixed(1)}</strong>
              <div className="home-reviews-stars" aria-label="5 estrellas">
                {estrellas}
              </div>
              {tieneTotal ? <span>{reviewsData.total}+ reseñas</span> : null}
            </div>
          ) : null}
          {updatedAt && reviewsData.source === "google" ? (
            <small className="home-reviews-inline-meta">
              Actualizado {updatedAt}
            </small>
          ) : null}
        </div>

        <div className="home-reviews-actions">
          <a
            className="home-reviews-btn home-reviews-btn-primary"
            href={reviewsUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Ver reseñas
          </a>
        </div>
      </div>

      {tieneReviews ? (
        <div className="home-reviews-inline-grid">
          {reviewsData.reviews.map((review, index) => (
            <article
              key={`${review.autor}-${index}`}
              className="home-review-card home-review-card-inline"
            >
              <div className="home-review-card-top">
                <div className="home-review-avatar" aria-hidden="true">
                  {String(review.autor || "G")
                    .trim()
                    .charAt(0)
                    .toUpperCase()}
                </div>
                <div>
                  <strong>{review.autor}</strong>
                  <span>{review.fecha}</span>
                </div>
              </div>

              <p>{review.texto}</p>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function Home() {
  const [busqueda, setBusqueda] = useState("");
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState(null);
  const [whatsapp, setWhatsapp] = useState(null);
  const [homeVisuales, setHomeVisuales] = useState({
    imgPrincipalHome: "",
    imgSecundariaHome: "",
    googleReviewsUrl: "",
    googlePlaceId: "",
    googleReviewsRating: 0,
    googleReviewsTotal: 0,
    googleReviewsItems: [],
    googleReviewsUpdatedAt: null,
    reviewsEnabled: true,
    reviewsDisplayCount: "2",
    manualReviewsRating: "",
    manualReviewsTotal: "",
    manualReviewsItems: [],
  });
  const agendaRef = useRef(null);
  const googleReviewsUrl =
    String(homeVisuales.googleReviewsUrl || "").trim() || GOOGLE_REVIEWS_URL;
  const reviewsData = getReviewsState(homeVisuales);
  const reviewsUpdatedAt = formatUpdatedAt(homeVisuales.googleReviewsUpdatedAt);
  const showReviews = homeVisuales.reviewsEnabled !== false;

  function scrollToAgendaResultados() {
    if (typeof window === "undefined") return;
    if (window.innerWidth > 992) return;

    window.setTimeout(() => {
      agendaRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 120);
  }

  useEffect(() => {
    const aviso = localStorage.getItem("avisoPostPago");
    if (!aviso) return;

    localStorage.removeItem("avisoPostPago");

    switch (aviso) {
      case "turno_aprobado":
        void swalTurnoConfirmado({
          html: `
            <p style="text-align:center;font-size:15px;">
              Tu turno fue confirmado correctamente.
            </p>
            <p style="text-align:center;color:#555;">
              Podes verlo en Mis turnos o seguir agendando.
            </p>
          `,
        }).then((result) => {
          if (result.isConfirmed) {
            window.location.assign("/mis-turnos");
          }
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
    async function cargarHomeData() {
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

    void cargarHomeData();
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
              <div className="home-negocio-top">
                <img
                  src={homeVisuales.imgSecundariaHome || imgSecundaria}
                  className="home-img-sec"
                  alt="Espacio de atencion estetica"
                />

                <div className="home-descripcion-info">
                  <span className="home-kicker">
                    Estetica facial y bienestar
                  </span>
                  <h1>PIEL & CEJAS</h1>

                  <p className="home-sub">
                    Cosmetologia • Estetica • Bienestar
                  </p>

                  <p className="home-desc">
                    Tratamientos faciales y corporales, masajes relajantes y
                    cuidado profesional de la piel en un ambiente pensado para
                    tu bienestar.
                  </p>
                </div>
              </div>

              {showReviews ? (
                <GoogleReviewsInline
                  reviewsUrl={googleReviewsUrl}
                  reviewsData={reviewsData}
                  updatedAt={reviewsUpdatedAt}
                />
              ) : null}
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
              onIrResultados={scrollToAgendaResultados}
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

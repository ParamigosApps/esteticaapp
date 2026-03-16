import { useEffect, useMemo, useState } from "react";
import { db } from "../../../Firebase";
import { doc, collection, onSnapshot } from "firebase/firestore";

import ubicacionIcon from "../../../assets/icons/mapa.png";
import instagramIcon from "../../../assets/img/ig.png";
import profesionalFemImg from "../../../assets/icons/profesional-fem.png";
import profesionalMascImg from "../../../assets/icons/profesional-masc.png";

function getProfesionalFallback(profesional) {
  if (profesional?.imgProfesional) return profesional.imgProfesional;
  if (profesional?.generoProfesional === "masculino") return profesionalMascImg;
  return profesionalFemImg;
}

function normalizarHandle(value) {
  return String(value || "")
    .trim()
    .replace(/^@+/, "");
}

function normalizarUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return /^https?:\/\//i.test(text) ? text : `https://${text}`;
}

function getSocialLinks(social) {
  const links = [];

  if (social?.instagramContacto) {
    links.push({
      key: "instagram",
      title: "Descubre nuestros trabajos en Instagram",
      subtitle: "Antes y despues, resultados, ideas y contenido reciente",
      url: /^https?:\/\//i.test(String(social.instagramContacto || "").trim())
        ? String(social.instagramContacto).trim()
        : `https://instagram.com/${normalizarHandle(social.instagramContacto)}`,
      iconType: "image",
      iconSrc: instagramIcon,
      variant: "instagram",
    });
  }

  if (social?.facebookContacto) {
    links.push({
      key: "facebook",
      title: "Encuentranos tambien en Facebook",
      subtitle: "Novedades, anuncios y contenido del espacio",
      url: /^https?:\/\//i.test(String(social.facebookContacto || "").trim())
        ? String(social.facebookContacto).trim()
        : `https://facebook.com/${normalizarHandle(social.facebookContacto)}`,
      iconType: "text",
      iconText: "f",
      variant: "facebook",
    });
  }

  if (social?.tiktokContacto) {
    links.push({
      key: "tiktok",
      title: "Mira nuestro contenido en TikTok",
      subtitle: "Videos cortos, procesos y momentos del dia a dia",
      url: /^https?:\/\//i.test(String(social.tiktokContacto || "").trim())
        ? String(social.tiktokContacto).trim()
        : `https://tiktok.com/@${normalizarHandle(social.tiktokContacto)}`,
      iconType: "text",
      iconText: "TT",
      variant: "tiktok",
    });
  }

  if (social?.xContacto) {
    links.push({
      key: "x",
      title: "Seguinos tambien en X",
      subtitle: "Novedades, avisos y publicaciones breves",
      url: /^https?:\/\//i.test(String(social.xContacto || "").trim())
        ? String(social.xContacto).trim()
        : `https://x.com/${normalizarHandle(social.xContacto)}`,
      iconType: "text",
      iconText: "X",
      variant: "x",
    });
  }

  if (social?.webContacto) {
    links.push({
      key: "web",
      title: "Visita nuestra pagina web",
      subtitle: "Mas informacion sobre servicios, novedades y contacto",
      url: normalizarUrl(social.webContacto),
      iconType: "text",
      iconText: "WEB",
      variant: "web",
    });
  }

  return links;
}

export default function InfoContactoPanel() {
  const [ubicacion, setUbicacion] = useState(null);
  const [social, setSocial] = useState(null);
  const [profesionales, setProfesionales] = useState([]);
  const [horarios, setHorarios] = useState(null);
  const [mostrarHorarios, setMostrarHorarios] = useState(false);

  useEffect(() => {
    const unsub1 = onSnapshot(doc(db, "configuracion", "ubicacion"), (snap) => {
      if (snap.exists()) setUbicacion(snap.data());
    });

    const unsub2 = onSnapshot(doc(db, "configuracion", "social"), (snap) => {
      if (snap.exists()) setSocial(snap.data());
    });

    const unsubHorarios = onSnapshot(
      doc(db, "configuracion", "horarios"),
      (snap) => {
        if (snap.exists()) setHorarios(snap.data());
      },
    );

    const unsub3 = onSnapshot(collection(db, "profesionales"), (snap) => {
      setProfesionales(
        snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })),
      );
    });

    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsubHorarios();
    };
  }, []);

  const diasOrdenados = useMemo(() => {
    const fuente = horarios || {};
    const orden = [
      "lunes",
      "martes",
      "miercoles",
      "jueves",
      "viernes",
      "sabado",
      "domingo",
    ];

    return orden.map((dia) => {
      const data = fuente[dia] || { abierto: false, desde: "", hasta: "" };

      return {
        dia,
        label: dia.charAt(0).toUpperCase() + dia.slice(1),
        abierto: !!data.abierto,
        desde: data.desde || "",
        hasta: data.hasta || "",
      };
    });
  }, [horarios]);

  const socialLinks = useMemo(() => getSocialLinks(social), [social]);

  if (!ubicacion) return null;

  return (
    <div className="contacto-panel">
      <div className="home-contacto">
        <section className="section-mapa">
          <a
            href={ubicacion.mapsLink}
            target="_blank"
            rel="noreferrer"
            className="contacto-map-link"
          >
            <iframe
              title="mapa"
              src={ubicacion.mapsEmbedUrl}
              className="home-map"
              loading="lazy"
            />
          </a>

          <div className="ubicacion-info-card">
            <div className="ubicacion-info-header">
              <span className="ubicacion-badge">Ubicacion</span>
              <a
                href={ubicacion.mapsLink}
                target="_blank"
                rel="noreferrer"
                className="ubicacion-link-maps"
              >
                Abrir en Maps
              </a>
            </div>

            <h6 className="ubicacion-titulo">Nuestra direccion</h6>

            <div className="ubicacion-direccion-box">
              <img
                className="ubicacion-contact"
                src={ubicacionIcon}
                alt="Pin mapa"
              />
              <div className="ubicacion-direccion-texto">
                <b>{ubicacion.mapsDireccion}</b>
              </div>
            </div>

            <div
              className="horarios-popover-wrap"
              onMouseEnter={() => setMostrarHorarios(true)}
              onMouseLeave={() => setMostrarHorarios(false)}
            >
              <button
                type="button"
                className="btn-ver-horarios"
                onClick={() => setMostrarHorarios((v) => !v)}
              >
                Ver horarios
              </button>

              {mostrarHorarios && (
                <div className="horarios-popover">
                  <h6 className="horarios-popover-title">
                    Horarios de atencion
                  </h6>

                  {diasOrdenados.map((item) => (
                    <div key={item.dia} className="horario-row">
                      <span className="horario-dia">{item.label}</span>
                      <span className="horario-valor">
                        {item.abierto
                          ? `${item.desde} a ${item.hasta}`
                          : "Cerrado"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {socialLinks.length > 0 && (
          <div className="contacto-cta-group">
            <div className="contacto-cta-head">
              <span className="contacto-cta-kicker">Redes sociales</span>
              <p className="contacto-cta-copy">
                ¡Inspirate con nuestro contenido!
              </p>
            </div>

            <div className="contacto-cta-actions">
              {socialLinks.map((link) => (
                <a
                  key={link.key}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className={`contacto-cta-btn contacto-cta-btn-${link.variant}`}
                >
                  <span className="contacto-cta-icon-shell" aria-hidden="true">
                    {link.iconType === "image" ? (
                      <img src={link.iconSrc} alt="" />
                    ) : (
                      <span className="contacto-cta-icon-text">
                        {link.iconText}
                      </span>
                    )}
                  </span>

                  <span className="contacto-cta-text">
                    <strong>{link.title}</strong>
                    <small>{link.subtitle}</small>
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="contacto-profesionales">
        {profesionales.length > 0 && (
          <>
            <h4 className="prof-title">Profesionales</h4>

            <div className="prof-grid">
              {profesionales.map((p) => (
                <div key={p.id} className="prof-card">
                  <img
                    src={getProfesionalFallback(p)}
                    alt={p.nombreProfesional}
                  />
                  <div>{p.nombreProfesional}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

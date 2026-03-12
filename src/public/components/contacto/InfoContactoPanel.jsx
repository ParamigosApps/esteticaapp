import { useEffect, useMemo, useState } from "react";
import { db } from "../../../Firebase";
import { doc, collection, onSnapshot } from "firebase/firestore";

import whatsappIcon from "../../../assets/icons/whatsapp.png";
import ubicacionIcon from "../../../assets/icons/mapa.png";

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
              <span className="ubicacion-badge">Ubicación</span>
              <a
                href={ubicacion.mapsLink}
                target="_blank"
                rel="noreferrer"
                className="ubicacion-link-maps"
              >
                Abrir en Maps
              </a>
            </div>

            <h6 className="ubicacion-titulo">Nuestra dirección</h6>

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
                    Horarios de atención
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
        {social?.whatsappContacto && (
          <>
            <a
              href={`https://wa.me/54${social.whatsappContacto}`}
              target="_blank"
              rel="noreferrer"
              className="wsp-contact-btn mt-4"
            >
              <img src={whatsappIcon} alt="WhatsApp" />
              <span>¡Despejá tus dudas por WhatsApp!</span>
            </a>
          </>
        )}
      </div>
      {/* REDES */}
      {/* <div>
        <h6 className="redes-title">Redes sociales</h6>

        <section className="contacto-redes">
          {social?.instagramContacto && (
            <a
              href={social.instagramContacto}
              target="_blank"
              rel="noreferrer"
              className="red-btn instagram"
            >
              Instagram
            </a>
          )}

          {social?.facebookContacto && (
            <a
              href={social.facebookContacto}
              target="_blank"
              rel="noreferrer"
              className="red-btn facebook"
            >
              Facebook
            </a>
          )}

          {social?.tiktokContacto && (
            <a
              href={social.tiktokContacto}
              target="_blank"
              rel="noreferrer"
              className="red-btn tiktok"
            >
              TikTok
            </a>
          )}

          {social?.xContacto && (
            <a
              href={social.xContacto}
              target="_blank"
              rel="noreferrer"
              className="red-btn x"
            >
              X
            </a>
          )}
        </section>
      </div> */}

      {/* PROFESIONALES */}
      <div className="contacto-profesionales">
        {profesionales.length > 0 && (
          <>
            <h4 className="prof-title">Profesionales</h4>

            <div className="prof-grid">
              {profesionales.map((p) => (
                <div key={p.id} className="prof-card">
                  {p.imgProfesional ? (
                    <img src={p.imgProfesional} alt={p.nombreProfesional} />
                  ) : null}

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

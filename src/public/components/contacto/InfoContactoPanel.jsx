import { useEffect, useState } from "react";
import { db } from "../../../Firebase";
import { doc, collection, onSnapshot } from "firebase/firestore";

import whatsappIcon from "../../../assets/icons/whatsapp.png";
import ubicacionIcon from "../../../assets/icons/mapa.png";

export default function InfoContactoPanel() {
  const [ubicacion, setUbicacion] = useState(null);
  const [social, setSocial] = useState(null);
  const [profesionales, setProfesionales] = useState([]);

  useEffect(() => {
    const unsub1 = onSnapshot(doc(db, "configuracion", "ubicacion"), (snap) => {
      if (snap.exists()) setUbicacion(snap.data());
    });

    const unsub2 = onSnapshot(doc(db, "configuracion", "social"), (snap) => {
      if (snap.exists()) setSocial(snap.data());
    });

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
    };
  }, []);

  if (!ubicacion) return null;

  return (
    <div className="contacto-panel">
      {/* MAPA */}
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

      {/* DIRECCION */}
      <div className="home-contacto">
        <h6 id="titulo-ubicacion">Nuestra dirección:</h6>
        <p id="p-ubicacion">
          <img
            className="ubicacion-contact"
            src={ubicacionIcon}
            alt="Pin mapa"
          />
          <b>{ubicacion.mapsDireccion}</b>
        </p>

        {social?.whatsappContacto && (
          <>
            <a
              href={`https://wa.me/54${social.whatsappContacto}`}
              target="_blank"
              rel="noreferrer"
              className="wsp-contact-btn"
            >
              <img src={whatsappIcon} alt="WhatsApp" />
              <span>¡Despejá tus dudas por WhatsApp!</span>
            </a>
          </>
        )}
      </div>
      {/* REDES */}
      <div x>
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
      </div>

      {/* REDES */}
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

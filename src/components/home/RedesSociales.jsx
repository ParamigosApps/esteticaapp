import { useEffect, useState } from "react";
import { db } from "../../Firebase";
import { doc, getDoc } from "firebase/firestore";

import {
  FaWhatsapp,
  FaInstagram,
  FaTiktok,
  FaXTwitter,
  FaFacebook,
  FaChrome,
} from "react-icons/fa6";

export default function RedesSociales() {
  const [redes, setRedes] = useState(null);

  useEffect(() => {
    const cargar = async () => {
      try {
        const snap = await getDoc(doc(db, "configuracion", "social"));
        if (snap.exists()) setRedes(snap.data());
      } catch (err) {
        console.error("Error cargando redes sociales:", err);
      }
    };

    cargar();
  }, []);

  if (!redes)
    return (
      <div className="d-flex justify-content-center">
        <p className="text-muted mb-0 ">Cargando redes...</p>
      </div>
    );
  const botones = [];
  if (redes.toggleWhatsapp && redes.whatsappContacto)
    botones.push({
      label: "WhatsApp",
      url: `https://wa.me/${redes.whatsappContacto}`,
      class: "btn-outline-success btn-shadow",
      icon: <FaWhatsapp />,
    });

  if (redes.toggleInstagram && redes.instagramContacto)
    botones.push({
      label: "Instagram",
      url: `https://instagram.com/${redes.instagramContacto.replace("@", "")}`,
      class: "btn-outline-dark text-danger btn-instagram btn-shadow",
      icon: <FaInstagram />,
    });

  if (redes.toggleFacebook && redes.facebookContacto)
    botones.push({
      label: "Facebook",
      url: `https://facebook.com/${redes.facebookContacto}`,
      class: "btn-outline-primary btn-shadow",
      icon: <FaFacebook />,
    });

  if (redes.toggleTiktok && redes.tiktokContacto)
    botones.push({
      label: "TikTok",
      url: `https://tiktok.com/@${redes.tiktokContacto.replace("@", "")}`,
      class: "btn-outline-dark btn-shadow",
      icon: <FaTiktok />,
    });

  if (redes.toggleX && redes.xContacto)
    botones.push({
      label: "X",
      url: `https://x.com/${redes.xContacto.replace("@", "")}`,
      class: "btn-outline-dark btn-shadow",
      icon: <FaXTwitter />,
    });

  if (redes.toggleWeb && redes.webContacto)
    botones.push({
      label: "Página web",
      url: `https://${redes.webContacto} `,
      class: "btn-outline-dark text-secondary btn-shadow",
      icon: <FaChrome />,
    });

  if (botones.length === 0)
    return <p className="text-muted">No hay redes activas.</p>;

  return (
    <div className="d-grid gap-2">
      {botones.map((b, i) => (
        <button
          key={i}
          className={`btn ${b.class} d-flex d-block mx-auto align-items-center justify-content-center gap-2 w-75`}
          onClick={() => window.open(b.url, "_blank")}
        >
          <span style={{ fontSize: "1.2rem" }}>
            {" "}
            <span className="d-flex align-items-center justify-content-center">
              {b.icon}
            </span>
          </span>
          <span>{b.label}</span>
        </button>
      ))}
    </div>
  );
}

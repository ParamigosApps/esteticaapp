import React, { useEffect, useState } from "react";
import { db } from "../../Firebase.js";
import { doc, getDoc } from "firebase/firestore";

export default function UbicacionPanel() {
  const [ubicacion, setUbicacion] = useState({
    mapsEmbedUrl: "",
    mapsLink: "",
  });
  const [mostrarMapa, setMostrarMapa] = useState(false);
  const [cargada, setCargada] = useState(false);

  useEffect(() => {
    getDoc(doc(db, "configuracion", "ubicacion")).then((snap) => {
      if (snap.exists()) setUbicacion(snap.data());
      setCargada(true);
    });
  }, []);

  return (
    <div className="accordion-collapse show">
      <div className="accordion-body d-grid mt-3">
        {!cargada && (
          <p className="text-muted text-center">Cargando ubicación...</p>
        )}
        {cargada && !ubicacion.mapsEmbedUrl && (
          <p className="text-muted text-center">Ubicación no configurada.</p>
        )}

        {ubicacion.mapsEmbedUrl && (
          <>
            <button
              type="button"
              className="btn ubicacion-btn btn-outline-dark d-block mx-auto mb-2 w-75"
              onClick={() => setMostrarMapa((p) => !p)}
            >
              {mostrarMapa ? "Ocultar mapa" : "Ver mapa"}
            </button>

            {mostrarMapa && (
              <div className="ubicacion-mapa">
                <iframe src={ubicacion.mapsEmbedUrl} loading="lazy" />
              </div>
            )}

            {ubicacion.mapsLink && (
              <a
                href={ubicacion.mapsLink}
                target="_blank"
                rel="noreferrer"
                className="btn btn-outline-secondary mt-2"
              >
                Abrir en Google Maps
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}

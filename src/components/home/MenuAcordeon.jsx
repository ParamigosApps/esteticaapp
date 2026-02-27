// --------------------------------------------------------------
// src/components/home/MenuAcordeon.jsx — VERSIÓN FINAL 2025
// --------------------------------------------------------------

import React, { useState } from "react";

import RedesSociales from "../home/RedesSociales.jsx";
import LoginPanel from "./LoginPanel.jsx";
import UbicacionPanel from "./UbicacionPanel.jsx";

import TurnosPanel from "../turnos/TurnosPanel.jsx";
import { useServicios } from "../../context/ServiciosContext";

import iconRedesSociales from "../../assets/icons/redes-sociales.png";
import iconMapas from "../../assets/icons/mapa.png";
import iconLogin from "../../assets/icons/login.png";

export default function MenuAcordeon() {
  const [abierto, setAbierto] = useState(null);
  const toggle = (k) => setAbierto((p) => (p === k ? null : k));

  const { servicios, loadingServicios } = useServicios();
  const [servicioSeleccionado, setServicioSeleccionado] = useState(null);

  return (
    <main className="menu-desplegable flex-grow-1">
      <div className="page-wrapper">
        <div className="catalogo my-2">
          <div className="accordion shadow-sm rounded-4 overflow-hidden w-100">
            {/* TURNOS */}
            <div className="accordion-item">
              <button
                className={`accordion-button ${abierto === "turnos" ? "" : "collapsed"}`}
                onClick={() => toggle("turnos")}
              >
                <img src={iconMapas} className="accordion-icon" />
                <span className="TitulosAcordeon">Turnos</span>
              </button>

              {abierto === "turnos" && (
                <div className="accordion-collapse show">
                  <div className="accordion-body mt-3 mb-3">
                    {loadingServicios && <p>Cargando servicios...</p>}

                    {!loadingServicios && !servicioSeleccionado && (
                      <div>
                        {servicios.map((s) => (
                          <div
                            key={s.id}
                            onClick={() => setServicioSeleccionado(s)}
                            style={{
                              padding: "12px",
                              marginBottom: "10px",
                              border: "1px solid #eee",
                              borderRadius: "12px",
                              cursor: "pointer",
                            }}
                          >
                            <h6>{s.nombre}</h6>
                            <small>{s.duracionMin} min</small>
                          </div>
                        ))}
                      </div>
                    )}

                    {servicioSeleccionado && (
                      <>
                        <button
                          className="btn btn-sm btn-outline-secondary mb-3"
                          onClick={() => setServicioSeleccionado(null)}
                        >
                          ← Volver
                        </button>

                        <TurnosPanel
                          gabineteId={servicioSeleccionado.gabinetes[0].id}
                          servicio={servicioSeleccionado}
                        />
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* REDES */}
            <div className="accordion-item">
              <button
                className={`accordion-button ${abierto === "redes" ? "" : "collapsed"}`}
                onClick={() => toggle("redes")}
              >
                <img src={iconRedesSociales} className="accordion-icon" />
                <span>Redes Sociales</span>
              </button>

              {abierto === "redes" && (
                <div className="accordion-collapse show">
                  <div className="accordion-body mt-4 mb-4">
                    <RedesSociales />
                  </div>
                </div>
              )}
            </div>

            {/* UBICACIÓN */}
            <div className="accordion-item">
              <button
                className={`accordion-button ${abierto === "ubicacion" ? "" : "collapsed"}`}
                onClick={() => toggle("ubicacion")}
              >
                <img src={iconMapas} className="accordion-icon" />
                <span>Ubicación</span>
              </button>

              {abierto === "ubicacion" && <UbicacionPanel />}
            </div>

            {/* LOGIN */}
            <div className="accordion-item">
              <button
                className={`accordion-button ${abierto === "usuario" ? "" : "collapsed"}`}
                onClick={() => toggle("usuario")}
              >
                <img src={iconLogin} className="accordion-icon" />
                <span>Login / Usuario</span>
              </button>

              {abierto === "usuario" && <LoginPanel />}
            </div>
          </div>
        </div>

        <footer className="legal-footer">
          <a href="/politica-de-privacidad.html">Política de privacidad</a> ·
          <a href="/condiciones-de-servicio.html"> Términos de servicio</a>
        </footer>
      </div>
    </main>
  );
}

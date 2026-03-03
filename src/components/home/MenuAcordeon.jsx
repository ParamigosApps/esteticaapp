// --------------------------------------------------------------
// src/components/home/MenuAcordeon.jsx — VERSIÓN FINAL 2025
// --------------------------------------------------------------

import React, { useState } from "react";
import TurnosSection from "./TurnosSection.jsx";
import NuestroEquipo from "../home/NuestroEquipo.jsx";
import RedesSociales from "../home/RedesSociales.jsx";
import LoginPanel from "./LoginPanel.jsx";
import UbicacionPanel from "./UbicacionPanel.jsx";

import iconTurnos from "../../assets/icons/turnos.png";
import iconNuestroEquipo from "../../assets/icons/nuestro-equipo.png";
import iconRedesSociales from "../../assets/icons/redes-sociales.png";
import iconMapas from "../../assets/icons/mapa.png";
import iconLogin from "../../assets/icons/login.png";

export default function MenuAcordeon() {
  const [abierto, setAbierto] = useState(null);
  const toggle = (k) => setAbierto((p) => (p === k ? null : k));

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
                <img src={iconTurnos} className="accordion-icon" />
                <span className="TitulosAcordeon">Turnos</span>
              </button>

              {abierto === "turnos" && (
                <div className="accordion-collapse show">
                  <div className="accordion-body mt-3 mb-3">
                    <TurnosSection />
                  </div>
                </div>
              )}
            </div>

            {/* Nuestro equipo */}
            <div className="accordion-item">
              <button
                className={`accordion-button ${abierto === "equipo" ? "" : "collapsed"}`}
                onClick={() => toggle("equipo")}
              >
                <img src={iconNuestroEquipo} className="accordion-icon" />
                <span>Nuestro equipo</span>
              </button>

              {abierto === "equipo" && (
                <div className="accordion-collapse show">
                  <div className="accordion-body mt-4 mb-4">
                    <NuestroEquipo />
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

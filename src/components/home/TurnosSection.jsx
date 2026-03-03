import { useState } from "react";
import { useServicios } from "../../context/ServiciosContext";
import TurnosPanel from "../turnos/TurnosPanel";

export default function TurnosSection() {
  const { servicios, loadingServicios } = useServicios();
  const [servicioSeleccionado, setServicioSeleccionado] = useState(null);

  return (
    <>
      {loadingServicios && (
        <div
          className="d-flex justify-content-center align-items-center"
          style={{ minHeight: "70px" }}
        >
          <p className="text-muted mb-0">Cargando servicios...</p>
        </div>
      )}

      {!loadingServicios && !servicioSeleccionado && (
        <div>
          {servicios
            .filter((s) => s.activo)
            .map((s) => (
              <div
                key={s.id}
                className="servicio-card"
                onClick={() => setServicioSeleccionado(s)}
              >
                <div className="servicio-card-header">
                  <h6 className="servicio-titulo">{s.nombreServicio}</h6>

                  {s.precio > 0 && (
                    <div className="servicio-precio">
                      ${s.precio.toLocaleString("es-AR")}
                    </div>
                  )}
                </div>

                <div className="servicio-sub mb-1">
                  <span className="servicio-profesional">
                    con <b>{s.nombreProfesional}</b>
                  </span>
                </div>

                {s.descripcion && (
                  <span className="servicio-descripcion">{s.descripcion}</span>
                )}

                {s.pedirAnticipo && (
                  <>
                    <div className="servicio-meta-line">
                      <span className="servicio-duracion">
                        Duración: <b>{s.duracionMin} min</b>
                      </span>

                      <span className="servicio-tipo">Tipo:</span>

                      <span
                        className={`${
                          s.modoReserva === "reserva"
                            ? "sin-reserva"
                            : "reserva-inmediata"
                        }`}
                      >
                        {s.modoReserva === "reserva"
                          ? "Requiere confirmación"
                          : "Confirmación inmediata"}
                      </span>
                    </div>

                    <div className="servicio-anticipo mt-2">
                      Reservas con el {s.porcentajeAnticipo}% del total (
                      <strong>
                        $
                        {(
                          (s.precio * s.porcentajeAnticipo) /
                          100
                        ).toLocaleString("es-AR")}
                      </strong>
                      )
                    </div>
                  </>
                )}
              </div>
            ))}
        </div>
      )}

      {servicioSeleccionado && (
        <>
          <button
            className="btn btn-sm btn-outline-secondary mb-2"
            onClick={() => setServicioSeleccionado(null)}
          >
            ← Volver
          </button>

          <TurnosPanel
            gabineteId={servicioSeleccionado.gabinetes?.[0]?.id}
            servicio={servicioSeleccionado}
          />
        </>
      )}
    </>
  );
}

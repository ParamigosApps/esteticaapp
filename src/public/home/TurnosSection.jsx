import { useMemo, useState, useEffect } from "react";
import { useServicios } from "../../context/ServiciosContext";
import TurnosPanel from "../../components/turnos/TurnosPanel";
import { calcularMontosTurno } from "../../config/comisiones.js";

function normalizarTexto(str = "") {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getPrecioEfectivo(servicio) {
  const precio = Number(servicio?.precio || 0);
  const precioEfectivo = Number(servicio?.precioEfectivo || 0);

  if (precioEfectivo > 0 && precioEfectivo < precio) {
    return precioEfectivo;
  }

  return 0;
}

export default function TurnosSection({
  busqueda,
  categoriaSeleccionada,
  setCategoriaSeleccionada,
}) {
  const { servicios, loadingServicios } = useServicios();
  const [servicioSeleccionado, setServicioSeleccionado] = useState(null);

  useEffect(() => {
    setServicioSeleccionado(null);
  }, [servicios, busqueda, categoriaSeleccionada]);

  const serviciosActivos = useMemo(() => {
    const lista = (servicios || []).filter((s) => s.activo);

    if (categoriaSeleccionada) {
      return lista.filter((s) => s.categoriaId === categoriaSeleccionada);
    }

    if (busqueda) {
      const q = normalizarTexto(busqueda);

      return lista.filter(
        (s) =>
          normalizarTexto(s.nombreServicio).includes(q) ||
          normalizarTexto(s.categoriaNombre).includes(q) ||
          normalizarTexto(s.nombreProfesional).includes(q),
      );
    }

    return lista;
  }, [servicios, busqueda, categoriaSeleccionada]);

  const grupos = useMemo(() => {
    const acc = {};

    for (const s of serviciosActivos) {
      const id = s.categoriaId;
      const nombre = s.categoriaNombre || "General";

      if (!acc[id]) {
        acc[id] = {
          nombre,
          servicios: [],
        };
      }

      acc[id].servicios.push(s);
    }

    return Object.entries(acc).sort((a, b) =>
      a[1].nombre.localeCompare(b[1].nombre),
    );
  }, [serviciosActivos]);

  const serviciosCategoria = useMemo(() => {
    if (!categoriaSeleccionada) return [];

    return serviciosActivos.filter((s) => s.categoriaId === categoriaSeleccionada);
  }, [serviciosActivos, categoriaSeleccionada]);

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

      {!loadingServicios && !categoriaSeleccionada && !servicioSeleccionado && (
        <div className="servicios-lista">
          {grupos.map(([categoriaId, data]) => (
            <div
              className="servicio-card"
              key={categoriaId}
              onClick={() => setCategoriaSeleccionada(categoriaId)}
            >
              <div className="servicio-card-header">
                <h6 className="servicio-titulo">{data.nombre}</h6>
                <div className="servicio-card-count">
                  {data.servicios.length} opciones
                </div>
              </div>

              <div className="servicio-sub mb-1">
                <span className="servicio-sub-listado">
                  {data.servicios
                    .slice(0, 3)
                    .map((s) => s.nombreServicio)
                    .join(" · ")}
                  {data.servicios.length > 3 ? " · ..." : ""}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loadingServicios && categoriaSeleccionada && !servicioSeleccionado && (
        <>
          <button
            className="btn btn-sm btn-outline-secondary mb-2 servicios-back-btn"
            onClick={() => setCategoriaSeleccionada(null)}
          >
            ← Volver
          </button>

          <h6 className="fw-bold mb-2 servicios-title">
            {serviciosCategoria?.[0]?.categoriaNombre || "Categoría"}
          </h6>

          <div className="servicios-lista">
            {serviciosCategoria.map((s) => {
              const pricingTurno = calcularMontosTurno({
                precioServicio: Number(s.precio || 0),
                porcentajeAnticipo: s.pedirAnticipo
                  ? Number(s.porcentajeAnticipo || 0)
                  : 0,
                cobrarComision: true,
              });
              const precioOnline = Number(pricingTurno.montoTotal || 0);
              const precioEfectivo = getPrecioEfectivo(s);
              const ahorroEfectivo = Math.max(0, precioOnline - precioEfectivo);

              return (
                <div
                  key={s.id}
                  className="servicio-card"
                  onClick={() => {
                    setServicioSeleccionado(s);
                  }}
                >
                  <div className="servicio-card-header">
                    <h6 className="servicio-titulo">{s.nombreServicio}</h6>

                    {s.precio > 0 && (
                      <div className="servicio-precio">
                        Desde ${s.precio.toLocaleString("es-AR")}
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

                  {precioEfectivo > 0 && (
                    <div className="servicio-efectivo">
                      En efectivo ahorrás{" "}
                      <strong>${ahorroEfectivo.toLocaleString("es-AR")}</strong>
                      {ahorroEfectivo > 0 && (
                        <span> y abonás ${precioEfectivo.toLocaleString("es-AR")}.</span>
                      )}
                    </div>
                  )}

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

                  {s.pedirAnticipo && (
                    <div className="servicio-anticipo mt-2">
                      Reservas con el {s.porcentajeAnticipo}% del total (
                      <strong>
                        ${pricingTurno.montoAnticipoTotal.toLocaleString("es-AR")}
                      </strong>
                      )
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {servicioSeleccionado && (
        <>
          <button
            className="btn btn-sm btn-outline-secondary mb-2 servicios-back-btn"
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

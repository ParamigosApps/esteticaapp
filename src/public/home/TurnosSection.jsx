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

function agruparServiciosPorNombre(lista = []) {
  const acc = {};

  for (const servicio of lista) {
    const key = normalizarTexto(servicio?.nombreServicio || "");
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(servicio);
  }

  return Object.values(acc).sort((a, b) =>
    String(a?.[0]?.nombreServicio || "").localeCompare(
      String(b?.[0]?.nombreServicio || ""),
      "es",
    ),
  );
}

function ServicioVariante({
  servicio,
  compact = false,
  onSelect,
  etiquetaPrecio = "Precio",
}) {
  const pricingTurno = calcularMontosTurno({
    precioServicio: Number(servicio.precio || 0),
    porcentajeAnticipo: servicio.pedirAnticipo
      ? Number(servicio.porcentajeAnticipo || 0)
      : 0,
    cobrarComision: true,
  });

  const precioOnline = Number(pricingTurno.montoTotal || 0);
  const precioEfectivo = getPrecioEfectivo(servicio);

  const ahorroEfectivo = Math.max(0, precioOnline - precioEfectivo);

  const contenido = (
    <>
      <div className="servicio-stack-top">
        <span className="servicio-profesional">
          con <b>{servicio.nombreProfesional || "Profesional"}</b>
        </span>
        {precioOnline > 0 ? (
          <span className="servicio-precio">
            {etiquetaPrecio} ${precioOnline.toLocaleString("es-AR")}
          </span>
        ) : null}
      </div>

      {servicio.descripcion ? (
        <span className="servicio-descripcion">{servicio.descripcion}</span>
      ) : null}

      {precioEfectivo > 0 ? (
        <div className="servicio-efectivo">
          Pagando en efectivo abonas
          {ahorroEfectivo > 0 ? (
            <span>
              {" "}
              ${precioEfectivo.toLocaleString("es-AR")} y ahorrás{" "}
              <strong>${ahorroEfectivo.toLocaleString("es-AR")}</strong>
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="servicio-meta-line">
        <span className="servicio-duracion">
          Duracion: <b>{servicio.duracionMin} min</b>
        </span>

        <span className="servicio-tipo">Tipo:</span>

        <span
          className={`${
            servicio.modoReserva === "reserva"
              ? "sin-reserva"
              : "reserva-inmediata"
          }`}
        >
          {servicio.modoReserva === "reserva"
            ? "Reserva y pago"
            : "Confirmacion inmediata"}
        </span>
      </div>

      {servicio.pedirAnticipo ? (
        <div className="servicio-anticipo mt-2">
          Reservas con el {servicio.porcentajeAnticipo}% del total (
          <strong>
            ${pricingTurno.montoAnticipoTotal.toLocaleString("es-AR")}
          </strong>
          )
        </div>
      ) : null}
    </>
  );

  if (compact) {
    return (
      <button
        type="button"
        className="servicio-stack-item"
        onClick={() => onSelect(servicio)}
      >
        {contenido}
      </button>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className="servicio-stack-item servicio-stack-item-single"
      onClick={() => onSelect(servicio)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          onSelect(servicio);
        }
      }}
    >
      {contenido}
    </div>
  );
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

    return serviciosActivos.filter(
      (s) => s.categoriaId === categoriaSeleccionada,
    );
  }, [serviciosActivos, categoriaSeleccionada]);

  const gruposServiciosCategoria = useMemo(
    () => agruparServiciosPorNombre(serviciosCategoria),
    [serviciosCategoria],
  );

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
                <div className="servicio-card-header-meta">
                  <div className="servicio-card-count">
                    {data.servicios.length} opciones
                  </div>
                  {data.servicios.some(
                    (servicio) => Number(servicio.precio || 0) > 0,
                  ) ? (
                    <div className="servicio-precio">
                      Precios desde $
                      {Math.min(
                        ...data.servicios
                          .map((servicio) =>
                            Number(
                              calcularMontosTurno({
                                precioServicio: Number(servicio.precio || 0),
                                porcentajeAnticipo: servicio.pedirAnticipo
                                  ? Number(servicio.porcentajeAnticipo || 0)
                                  : 0,
                                cobrarComision: true,
                              }).montoTotal || 0,
                            ),
                          )
                          .filter((precio) => precio > 0),
                      ).toLocaleString("es-AR")}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="servicio-sub mb-1">
                <span className="servicio-sub-listado">
                  {data.servicios
                    .slice(0, 3)
                    .map((s) =>
                      s.nombreProfesional
                        ? `${s.nombreServicio} - ${s.nombreProfesional}`
                        : s.nombreServicio,
                    )
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
            {serviciosCategoria?.[0]?.categoriaNombre || "Categoria"}
          </h6>

          <div className="servicios-lista">
            {gruposServiciosCategoria.map((grupo) => {
              const servicioBase = grupo[0];
              const apilado = grupo.length > 1;

              return (
                <div key={servicioBase.id} className="servicio-card">
                  <div className="servicio-card-header">
                    <h6 className="servicio-titulo">
                      {servicioBase.nombreServicio}
                    </h6>
                    {apilado ? (
                      <div className="servicio-card-count">
                        {grupo.length} profesionales
                      </div>
                    ) : null}
                  </div>

                  {apilado ? (
                    <div className="servicio-stack">
                      {grupo.map((servicio) => (
                        <ServicioVariante
                          key={servicio.id}
                          servicio={servicio}
                          compact
                          onSelect={setServicioSeleccionado}
                          etiquetaPrecio="Desde"
                        />
                      ))}
                    </div>
                  ) : (
                    <ServicioVariante
                      servicio={servicioBase}
                      onSelect={setServicioSeleccionado}
                      etiquetaPrecio="Precio"
                    />
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

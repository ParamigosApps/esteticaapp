import { useMemo, useState, useEffect, useRef } from "react";
import { useServicios } from "../../context/ServiciosContext";
import TurnosPanel from "../../components/turnos/TurnosPanel";
import { calcularMontosTurno, parseAmount } from "../../config/comisiones.js";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../Firebase";

function normalizarTexto(str = "") {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getPrecioEfectivo(servicio) {
  const precio = parseAmount(servicio?.precio || 0);
  const precioEfectivo = parseAmount(servicio?.precioEfectivo || 0);

  if (precioEfectivo > 0 && precioEfectivo < precio) {
    return precioEfectivo;
  }

  return 0;
}

function getPrecioOnlineServicio(servicio) {
  return Number(
    calcularMontosTurno({
      precioServicio: parseAmount(servicio?.precio || 0),
      porcentajeAnticipo: servicio?.pedirAnticipo
        ? parseAmount(servicio?.porcentajeAnticipo || 0)
        : 0,
      cobrarComision: true,
    }).montoTotal || 0,
  );
}

function servicioTienePrecioVariableActivo(servicio) {
  return (
    Boolean(servicio?.precioVariable) &&
    Array.isArray(servicio?.itemsPrecioVariable) &&
    servicio.itemsPrecioVariable.some(
      (item) => item?.activo !== false && Number(item?.monto || 0) > 0,
    )
  );
}

function getServicioImageUrl(servicio) {
  const candidates = [
    servicio?.imagenUrl,
    servicio?.imagen,
    servicio?.imageUrl,
    servicio?.image,
    servicio?.fotoUrl,
    servicio?.foto,
    servicio?.thumbnailUrl,
    servicio?.portadaUrl,
  ];

  const imageUrl = candidates.find(
    (value) => typeof value === "string" && value.trim(),
  );

  return imageUrl ? imageUrl.trim() : "";
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
    precioServicio: parseAmount(servicio.precio || 0),
    porcentajeAnticipo: servicio.pedirAnticipo
      ? parseAmount(servicio.porcentajeAnticipo || 0)
      : 0,
    cobrarComision: true,
  });

  const precioOnline = Number(pricingTurno.montoTotal || 0);
  const precioEfectivo = getPrecioEfectivo(servicio);
  const comisionTurno = Number(pricingTurno.comisionTurno || 0);
  const totalEfectivoComparable =
    precioEfectivo > 0
      ? precioEfectivo + (comisionTurno > 0 ? comisionTurno : 0)
      : 0;
  const ahorroEfectivo = Math.max(0, precioOnline - totalEfectivoComparable);
  const porcentajeAnticipo = servicio.pedirAnticipo
    ? parseAmount(servicio.porcentajeAnticipo || 0)
    : 0;
  const muestraAhorroEfectivo =
    precioEfectivo > 0 &&
    !(servicio.pedirAnticipo && porcentajeAnticipo >= 100);
  const servicioImageUrl = getServicioImageUrl(servicio);

  const contenido = (
    <div className="servicio-stack-layout">
      {servicioImageUrl ? (
        <div className="servicio-stack-media">
          <img
            src={servicioImageUrl}
            alt={servicio.nombreServicio || "Servicio"}
            className="servicio-stack-img"
            loading="lazy"
          />
        </div>
      ) : null}

      <div className="servicio-stack-content">
        <div className="servicio-stack-top">
          <span className="servicio-profesional">
            con <b>{servicio.nombreProfesional || "Profesional"}</b>
          </span>
          {precioOnline > 0 ? (
            <span className="servicio-precio">
              {(servicioTienePrecioVariableActivo(servicio) &&
              etiquetaPrecio === "Precio"
                ? "Precio desde"
                : etiquetaPrecio) + " "}
              ${precioOnline.toLocaleString("es-AR")}
            </span>
          ) : null}
        </div>

        {servicio.descripcion ? (
          <span className="servicio-descripcion">{servicio.descripcion}</span>
        ) : null}

        {muestraAhorroEfectivo && porcentajeAnticipo == 0 ? (
          <div className="servicio-efectivo">
            Pagando en efectivo abonas
            {ahorroEfectivo > 0 ? (
              <span>
                {" "}
                ${totalEfectivoComparable.toLocaleString("es-AR")} (
                <strong>${ahorroEfectivo.toLocaleString("es-AR")}</strong> de
                ahorro)
              </span>
            ) : null}
          </div>
        ) : null}

        {muestraAhorroEfectivo && porcentajeAnticipo != 0 ? (
          <div className="servicio-efectivo">
            Pagándo lo restante en efectivo en total vas a abonar:
            {ahorroEfectivo > 0 ? (
              <span>
                {" "}
                ${totalEfectivoComparable.toLocaleString("es-AR")} (
                <strong>${ahorroEfectivo.toLocaleString("es-AR")}</strong> de
                ahorro)
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="servicio-meta-line">
          <span className="servicio-duracion">
            Duración: <b>{servicio.duracionMin} min</b>
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
        ) : comisionTurno > 0 ? (
          <div className="servicio-anticipo mt-2">
            Sin anticipo, pero con cargo de reserva de{" "}
            <strong>${comisionTurno.toLocaleString("es-AR")}</strong>. Total:{" "}
            <strong>${pricingTurno.montoTotal.toLocaleString("es-AR")}</strong>
          </div>
        ) : (
          <div className="servicio-anticipo servicio-anticipo-gratis mt-2">
            Reserva gratis
          </div>
        )}
      </div>
    </div>
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
  const [categorias, setCategorias] = useState([]);
  const [categoriaAbiertaId, setCategoriaAbiertaId] = useState(null);
  const [servicioSeleccionado, setServicioSeleccionado] = useState(null);
  const turnosTopRef = useRef(null);

  function scrollToTurnosTop() {
    turnosTopRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  useEffect(() => {
    setServicioSeleccionado(null);
  }, [servicios, busqueda, categoriaSeleccionada]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!servicios.length) return;

    try {
      const raw = window.sessionStorage.getItem("pendingLoginAction");
      if (!raw) return;

      const intent = JSON.parse(raw);
      if (intent?.tipo !== "turno" || !intent?.servicioId) return;

      const servicio = servicios.find((item) => item.id === intent.servicioId);
      if (!servicio) return;

      if (servicio.categoriaId) {
        setCategoriaSeleccionada(servicio.categoriaId);
      }

      setServicioSeleccionado(servicio);
    } catch (error) {
      console.error("No se pudo restaurar el servicio pendiente", error);
    }
  }, [servicios, setCategoriaSeleccionada]);

  const serviciosActivos = useMemo(() => {
    let lista = (servicios || []).filter((s) => s.activo);

    if (categoriaSeleccionada) {
      lista = lista.filter((s) => s.categoriaId === categoriaSeleccionada);
    }

    if (busqueda) {
      const q = normalizarTexto(busqueda);

      lista = lista.filter(
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

  const categoriaActual = useMemo(
    () =>
      categorias.find((categoria) => categoria.id === categoriaSeleccionada) ||
      null,
    [categorias, categoriaSeleccionada],
  );

  useEffect(() => {
    return onSnapshot(collection(db, "categorias_servicio"), (snap) => {
      setCategorias(
        snap.docs.map((docItem) => ({
          id: docItem.id,
          ...docItem.data(),
        })),
      );
    });
  }, []);

  useEffect(() => {
    if (!categoriaSeleccionada && !servicioSeleccionado) return;
    scrollToTurnosTop();
  }, [categoriaSeleccionada, servicioSeleccionado]);

  useEffect(() => {
    if (!grupos.length) {
      setCategoriaAbiertaId(null);
      return;
    }

    const existeAbierta = grupos.some(([categoriaId]) => categoriaId === categoriaAbiertaId);
    if (!existeAbierta) {
      setCategoriaAbiertaId(grupos[0][0]);
    }
  }, [grupos, busqueda]);

  const categoriasById = useMemo(() => {
    const map = {};
    (categorias || []).forEach((item) => {
      if (item?.id) map[item.id] = item;
    });
    return map;
  }, [categorias]);

  const gruposServiciosCategoria = useMemo(
    () => agruparServiciosPorNombre(serviciosCategoria),
    [serviciosCategoria],
  );

  return (
    <>
      <div ref={turnosTopRef} />
      {loadingServicios && (
        <div className="agenda-loading-shell agenda-loading-shell-services">
          <span
            className="spinner-border agenda-loading-spinner"
            aria-hidden="true"
          />
          <p className="agenda-loading-text">Cargando servicios...</p>
        </div>
      )}

      {!loadingServicios &&
        !categoriaSeleccionada &&
        !servicioSeleccionado &&
        (busqueda?.trim() && grupos.length === 0 ? (
          <div className="servicios-empty-state">
            No se encontraron resultados para: "{busqueda.trim()}"
          </div>
        ) : (
          <div className="servicios-lista">
            {grupos.map(([categoriaId, data]) => (
              <div
                className={`servicio-card servicio-card-categoria ${
                  categoriaAbiertaId === categoriaId ? "is-open" : ""
                }`}
                key={categoriaId}
              >
                <button
                  type="button"
                  className="servicio-card-header servicio-card-header-toggle"
                  onClick={() => setCategoriaAbiertaId(categoriaId)}
                >
                  <h6 className="servicio-titulo">{data.nombre}</h6>
                  <div className="servicio-card-header-meta">
                    <div className="servicio-card-count">
                      {data.servicios.length} opciones
                    </div>
                    {(() => {
                      const precios = data.servicios
                        .map((servicio) => getPrecioOnlineServicio(servicio))
                        .filter((precio) => precio > 0);

                      if (!precios.length) return null;

                      const hayPrecioVariable = data.servicios.some(
                        (servicio) =>
                          servicioTienePrecioVariableActivo(servicio),
                      );

                      const hayMasDeUnPrecio =
                        new Set(precios.map((precio) => Number(precio))).size >
                        1;

                      return (
                        <div className="servicio-precio">
                          {hayMasDeUnPrecio || hayPrecioVariable
                            ? "Precio desde $"
                            : "Precio $"}
                          {Math.min(...precios).toLocaleString("es-AR")}
                        </div>
                      );
                    })()}
                    <span
                      className={`servicio-card-chevron ${
                        categoriaAbiertaId === categoriaId ? "open" : ""
                      }`}
                      aria-hidden="true"
                    >
                      ⌄
                    </span>
                  </div>
                </button>

                {categoriaAbiertaId === categoriaId ? (
                  <div className="servicio-card-body">
                    {categoriasById[categoriaId]?.descripcion ? (
                      <p className="servicios-categoria-descripcion mb-2">
                        {categoriasById[categoriaId].descripcion}
                      </p>
                    ) : null}

                    <div className="servicio-sub mb-1">
                      <div className="servicio-sub-listado">
                        {data.servicios.slice(0, 8).map((s) => (
                          <span
                            key={`${categoriaId}-${s.id}`}
                            className="servicio-sub-pill"
                          >
                            <strong>{s.nombreServicio}</strong>
                            {s.nombreProfesional ? (
                              <span className="servicio-sub-profesional">
                                <span className="servicio-sub-separator">-</span>
                                <span className="servicio-sub-profesional-name">
                                  {s.nombreProfesional}
                                </span>
                              </span>
                            ) : null}
                          </span>
                        ))}
                        {data.servicios.length > 8 ? (
                          <span className="servicio-sub-more">
                            +{data.servicios.length - 8} mas
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="servicios-lista servicio-card-categoria-lista">
                      {agruparServiciosPorNombre(data.servicios).map((grupo) => {
                        const servicioBase = grupo[0];
                        const apilado = grupo.length > 1;

                        return (
                          <div
                            key={`${categoriaId}-${servicioBase.id}`}
                            className="servicio-card servicio-card-inner"
                          >
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
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ))}

      {!loadingServicios && categoriaSeleccionada && !servicioSeleccionado && (
        <>
          <button
            className="btn btn-sm btn-outline-secondary mb-2 servicios-back-btn"
            onClick={() => setCategoriaSeleccionada(null)}
          >
            ← Volver
          </button>

          <h6 className="fw-bold mb-2 servicios-title">
            {categoriaActual?.nombre ||
              serviciosCategoria?.[0]?.categoriaNombre ||
              "Categoria"}
            {busqueda?.trim() ? ` - buscando "${busqueda.trim()}"` : ""}
          </h6>

          {categoriaActual?.descripcion ? (
            <p className="servicios-categoria-descripcion">
              {categoriaActual.descripcion}
            </p>
          ) : null}

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

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../../Firebase";
import { useServicios } from "../../../context/ServiciosContext";

export default function CategoriasServicios({
  categoriaSeleccionada,
  setBusqueda,
  setCategoriaSeleccionada,
}) {
  const { servicios, loadingServicios } = useServicios();
  const [categorias, setCategorias] = useState([]);

  useEffect(() => {
    const ref = collection(db, "categorias_servicio");

    return onSnapshot(ref, (snap) => {
      setCategorias(
        snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })),
      );
    });
  }, []);

  const conteoPorCategoriaId = useMemo(() => {
    const map = {};
    (servicios || []).forEach((s) => {
      if (!s?.activo || !s.categoriaId) return;
      map[s.categoriaId] = (map[s.categoriaId] || 0) + 1;
    });
    return map;
  }, [servicios]);

  const categoriasVisibles = useMemo(() => {
    return (categorias || [])
      .filter((c) => c?.activo)
      .map((c) => ({
        ...c,
        cantidad: conteoPorCategoriaId[c.id] || 0,
      }))
      .filter((c) => c.cantidad > 0)
      .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
  }, [categorias, conteoPorCategoriaId]);

  if (loadingServicios) return null;

  return (
    <div className="categorias-servicios">
      {categoriasVisibles.map((c) => {
        const activa = categoriaSeleccionada === c.id;

        return (
          <div
            key={c.id}
            className={`categoria-card ${activa ? "categoria-card-active" : ""}`}
            onClick={() => {
              setBusqueda("");
              setCategoriaSeleccionada(c.id);
            }}
          >
            <div className="categoria-card-top">
              <div className="categoria-card-top-left">
                <span className="categoria-icon" aria-hidden="true">
                  {String(c.nombre || "?").trim().charAt(0).toUpperCase() || "C"}
                </span>
                <div className="categoria-card-kicker-wrap">
                  <span className="categoria-pill">
                    {activa ? "Activa" : "Categoria"}
                  </span>
                  <span className="categoria-count">
                    {c.cantidad} servicio{c.cantidad === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
              <span className="categoria-arrow" aria-hidden="true">
                {activa ? "●" : "→"}
              </span>
            </div>
            <div className="categoria-card-body">
              <h4>{c.nombre}</h4>
              <p className="categoria-card-copy">
                {c.descripcion?.trim()
                  ? c.descripcion
                  : activa
                    ? "Mostrando servicios de esta categoria"
                    : "Explorar tratamientos disponibles"}
              </p>
            </div>
            <div className="categoria-card-footer">
              <span className="categoria-footer-copy">
                {activa ? "Categoria abierta" : "Ver opciones"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

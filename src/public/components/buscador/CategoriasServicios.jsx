import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../../Firebase";
import { useServicios } from "../../../context/ServiciosContext";

export default function CategoriasServicios({
  setBusqueda,
  setCategoriaSeleccionada,
}) {
  const { servicios, loadingServicios } = useServicios();
  const [categorias, setCategorias] = useState([]);

  // 1) Leer categorias_servicio
  useEffect(() => {
    const ref = collection(db, "categorias_servicio");

    return onSnapshot(ref, (snap) => {
      setCategorias(
        snap.docs.map((d) => ({
          id: d.id,
          ...d.data(), // { nombre, activo, ... }
        })),
      );
    });
  }, []);

  // 2) Contar servicios activos por categoriaId
  const conteoPorCategoriaId = useMemo(() => {
    const map = {};
    (servicios || []).forEach((s) => {
      if (!s?.activo) return;
      if (!s.categoriaId) return;

      map[s.categoriaId] = (map[s.categoriaId] || 0) + 1;
    });
    return map;
  }, [servicios]);

  // 3) Categorías visibles: activas y con al menos 1 servicio activo
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
      {categoriasVisibles.map((c) => (
        <div
          key={c.id}
          className="categoria-card"
          onClick={() => {
            setBusqueda("");
            setCategoriaSeleccionada(c.id);
          }}
        >
          <h4>{c.nombre}</h4>
          <p>{c.cantidad} servicios</p>
        </div>
      ))}
    </div>
  );
}

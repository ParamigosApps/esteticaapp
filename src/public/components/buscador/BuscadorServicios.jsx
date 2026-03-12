import CategoriasServicios from "./CategoriasServicios";

export default function BuscadorServicios({
  busqueda,
  setBusqueda,
  categoriaSeleccionada,
  setCategoriaSeleccionada,
}) {
  return (
    <div className="home-buscador-lateral">
      <input
        className="buscador-servicios"
        placeholder="¿Que servicio buscas?"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
      />

      <CategoriasServicios
        categoriaSeleccionada={categoriaSeleccionada}
        setBusqueda={setBusqueda}
        setCategoriaSeleccionada={setCategoriaSeleccionada}
      />
    </div>
  );
}

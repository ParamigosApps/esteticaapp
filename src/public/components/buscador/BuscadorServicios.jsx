import CategoriasServicios from "./CategoriasServicios";

export default function BuscadorServicios({
  busqueda,
  setBusqueda,
  setCategoriaSeleccionada,
}) {
  return (
    <div className="home-buscador-lateral">
      <input
        className="buscador-servicios"
        placeholder="¿Qué servicio buscas?"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
      />

      <CategoriasServicios
        setBusqueda={setBusqueda}
        setCategoriaSeleccionada={setCategoriaSeleccionada}
      />
    </div>
  );
}

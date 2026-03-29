import CategoriasServicios from "./CategoriasServicios";

export default function BuscadorServicios({
  busqueda,
  setBusqueda,
  categoriaSeleccionada,
  setCategoriaSeleccionada,
  onIrResultados,
}) {
  function handleSubmit(event) {
    event.preventDefault();
    onIrResultados?.();
  }

  return (
    <div className="home-buscador-lateral">
      <form className="home-buscador-form" onSubmit={handleSubmit}>
        <input
          className="buscador-servicios"
          placeholder="¿Qué servicio buscas?"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <button type="submit" className="home-buscador-ir-btn">
          Buscar
        </button>
      </form>

      <CategoriasServicios
        categoriaSeleccionada={categoriaSeleccionada}
        setBusqueda={setBusqueda}
        setCategoriaSeleccionada={setCategoriaSeleccionada}
      />
    </div>
  );
}

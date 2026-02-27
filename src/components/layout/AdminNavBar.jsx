import { Link } from 'react-router-dom'
import { useFirebase } from '../../context/FirebaseContext.jsx'

export default function AdminNavbar() {
  const { logout } = useFirebase()

  return (
    <nav className="navbar navbar-dark bg-dark px-3">
      <span className="navbar-brand">Panel Admin</span>

      <div className="d-flex gap-3">
        <Link to="/admin/eventos" className="text-light nav-link">
          Eventos
        </Link>
        <Link to="/admin/pendientes-entradas" className="text-light nav-link">
          Entradas Pendientes
        </Link>
        <Link to="/admin/pendientes-compras" className="text-light nav-link">
          Compras Pendientes
        </Link>
        <button className="btn btn-outline-danger" onClick={logout}>
          Salir
        </button>
      </div>
    </nav>
  )
}

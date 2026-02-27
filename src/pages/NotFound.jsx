// src/pages/NotFound.jsx
import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div
      className="d-flex flex-column justify-content-center align-items-center text-center"
      style={{ minHeight: '80vh' }}
    >
      <h1 className="fw-bold" style={{ fontSize: '4rem' }}>
        404
      </h1>

      <p className="text-muted mb-4">La página que estás buscando no existe.</p>

      <Link to="/" className="btn swal-btn-confirm">
        Volver al inicio
      </Link>
    </div>
  )
}

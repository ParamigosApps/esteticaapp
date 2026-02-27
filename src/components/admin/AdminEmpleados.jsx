// --------------------------------------------------------------
// AdminEmpleados.jsx — CRUD Empleados + Permisos (CORREGIDO)
// --------------------------------------------------------------
import { useEffect, useState } from 'react'
import {
  collection,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore'

import { httpsCallable } from 'firebase/functions'
import { functions } from '../../Firebase'

const crearEmpleadoAdmin = httpsCallable(functions, 'crearEmpleadoAdmin')

import { db, auth } from '../../Firebase'
import { useAuth } from '../../context/AuthContext'
import {
  swalSuccess,
  swalError,
  swalInfo,
  swalConfirmDanger,
} from '../../utils/swalUtils'

import { showLoading, hideLoading } from '../../services/loadingService.js'
// --------------------------------------------------------------
// 🔐 MAPA DE ROLES
// --------------------------------------------------------------
const ROLES = {
  1: {
    label: 'Nivel 1 – Puerta',
    desc: 'Validar entradas',
    badge: 'secondary',
  },
  2: { label: 'Nivel 2 – Caja', desc: 'Cobros', badge: 'info' },
  3: { label: 'Nivel 3 – Encargado', desc: 'Gestión', badge: 'warning' },
  4: { label: 'Nivel 4 – Dueño', desc: 'Acceso total', badge: 'danger' },
}

export default function AdminEmpleados() {
  const { user, loading } = useAuth()
  const nivelActual = Number(user?.nivel || 0)

  const [empleados, setEmpleados] = useState([])
  const [modo, setModo] = useState('crear')
  const [editId, setEditId] = useState(null)

  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [nivel, setNivel] = useState('')

  const [errores, setErrores] = useState({})

  // --------------------------------------------------------------
  // 🔒 PROTECCIÓN
  // --------------------------------------------------------------
  if (nivelActual !== 4) {
    return (
      <div className="alert alert-danger">
        ⛔ Solo el dueño puede administrar empleados.
      </div>
    )
  }

  // --------------------------------------------------------------
  // LISTENER
  // --------------------------------------------------------------
  useEffect(() => {
    if (loading) return
    if (!user?.uid) return
    if (nivelActual !== 4) return // 🔒 MISMA REGLA QUE FIRESTORE

    const q = query(collection(db, 'usuarios'), where('esEmpleado', '==', true))

    const unsub = onSnapshot(q, snap => {
      setEmpleados(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })

    return () => unsub()
  }, [loading, user, nivelActual])

  // --------------------------------------------------------------
  // VALIDACIONES
  // --------------------------------------------------------------
  function validarCampos(crear = true) {
    const e = {
      nombre: !nombre.trim(),
      email: !email.trim(),
      nivel: !nivel,
    }
    setErrores(e)
    return !Object.values(e).some(Boolean)
  }

  // --------------------------------------------------------------
  // CREAR EMPLEADO (CORREGIDO)
  // --------------------------------------------------------------
  async function crearEmpleado(e) {
    e.preventDefault()
    if (!validarCampos(true)) return

    try {
      showLoading({
        title: 'Creando empleado',
        text: 'Aguarda unos instantes...',
      })
      // 🔄 FORZAR TOKEN NUEVO CON CLAIMS
      const u = auth.currentUser
      if (!u) throw new Error('No autenticado')

      await u.getIdToken(true)

      // 🔥 RECIÉN AHORA llamar backend
      await crearEmpleadoAdmin({
        email,
        nombre,
        nivel: Number(nivel),
      })
      hideLoading()
      swalSuccess({
        title: 'Empleado creado',
        text: 'El empleado fue creado correctamente',
      })

      limpiar()
    } catch (err) {
      hideLoading()
      console.error(err)

      const msg = err?.message || err?.details || 'No se pudo crear el empleado'

      swalError({
        title: 'Error al crear empleado',
        text: msg,
      })
    }
  }

  // --------------------------------------------------------------
  // EDITAR
  // --------------------------------------------------------------
  function cargarEditar(emp) {
    setModo('editar')
    setEditId(emp.id)
    setNombre(emp.nombre)
    setEmail(emp.email)
    setNivel(emp.nivel)
  }

  async function guardarEdicion(e) {
    e.preventDefault()
    if (!validarCampos(false)) return

    showLoading({
      title: 'Guardando cambios',
      text: 'Aguarda unos instantes...',
    })
    await updateDoc(doc(db, 'usuarios', editId), {
      nombre,
      nivel: Number(nivel),
    })
    hideLoading()
    swalSuccess({
      title: 'Empleado actualizado',
      text: 'Los datos fueron guardados correctamente',
    })

    limpiar()
  }

  // --------------------------------------------------------------
  // BORRAR
  // --------------------------------------------------------------
  async function borrarEmpleado(emp) {
    const admins = empleados.filter(e => Number(e.nivel) === 4)
    if (Number(emp.nivel) === 4 && admins.length <= 1) {
      swalInfo({
        title: 'Acción no permitida',
        text: 'Debe existir al menos un dueño en el sistema.',
        confirmText: 'Entendido',
      })

      return
    }

    const ok = await swalConfirmDanger({
      title: 'Eliminar empleado',
      html: `¿Eliminar a <b>${emp.nombre}</b>?`,

      confirmText: 'Eliminar',
    })

    if (!ok.isConfirmed) return

    try {
      showLoading({
        title: 'Eliminando empleado',
        text: 'Aguarda unos instantes...',
      })
      const quitarEmpleadoAdmin = httpsCallable(
        functions,
        'quitarEmpleadoAdmin'
      )

      // 🔥 BACKEND = fuente de verdad
      await quitarEmpleadoAdmin({ uid: emp.id })

      // 🔥 Limpieza Firestore
      await deleteDoc(doc(db, 'usuarios', emp.id))

      hideLoading()
      swalSuccess({
        title: 'Empleado eliminado',
        text: 'El empleado fue eliminado correctamente',
      })
    } catch (err) {
      console.error(err)
      hideLoading()
      swalError({
        title: 'Error al eliminar empleado',
        text: err?.message || 'No se pudo eliminar el empleado',
      })
    }
  }

  function limpiar() {
    setModo('crear')
    setEditId(null)
    setNombre('')
    setEmail('')
    setNivel('')
    setErrores({})
  }

  // --------------------------------------------------------------
  // UI
  // --------------------------------------------------------------
  return (
    <div>
      <h3 className="fw-bold mb-3">Administración de empleados</h3>

      <form
        onSubmit={modo === 'crear' ? crearEmpleado : guardarEdicion}
        className="card p-3 mb-4"
      >
        <div className="row g-3">
          <div className="col-md-6">
            <label>Nombre</label>
            <input
              className={`form-control ${errores.nombre ? 'is-invalid' : ''}`}
              value={nombre}
              onChange={e => setNombre(e.target.value)}
            />
          </div>

          <div className="col-md-6">
            <label>Email</label>
            <input
              className={`form-control ${errores.email ? 'is-invalid' : ''}`}
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={modo === 'editar'}
            />
          </div>

          <div className="col-md-6">
            <label>Permiso</label>
            <select
              className={`form-select ${errores.nivel ? 'is-invalid' : ''}`}
              value={nivel}
              onChange={e => setNivel(e.target.value)}
            >
              <option value="">Seleccionar</option>
              {Object.entries(ROLES).map(([k, r]) => (
                <option key={k} value={k}>
                  {r.label}
                </option>
              ))}
            </select>
            {nivel && (
              <small className="text-muted">{ROLES[nivel]?.desc}</small>
            )}
          </div>
        </div>

        <div className="mt-3 text-center">
          <button className="btn swal-btn-confirm">
            {modo === 'crear' ? 'Crear empleado' : 'Guardar cambios'}
          </button>
          {modo === 'editar' && (
            <button
              type="button"
              className="btn btn-secondary ms-2"
              onClick={limpiar}
            >
              Cancelar
            </button>
          )}
        </div>
      </form>

      {/* LISTADO */}
      <div className="table-responsive">
        <table className="table table-bordered table-hover align-middle mb-0">
          <thead>
            <tr>
              <th>Nombre</th>
              <th className="d-none d-md-table-cell">Email</th>
              <th>Rol</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {empleados.map(emp => (
              <tr key={emp.id}>
                <td>{emp.nombre}</td>
                <td className="d-none d-md-table-cell">{emp.email}</td>
                <td>
                  <span className={`badge bg-${ROLES[emp.nivel]?.badge}`}>
                    {ROLES[emp.nivel]?.label}
                  </span>
                </td>
                <td className="text-center" style={{ minWidth: 140 }}>
                  <div className="d-inline-flex gap-2 flex-wrap justify-content-center">
                    <button
                      className="btn btn-sm swal-btn-alt"
                      id="btn-borrar-empleados"
                      onClick={() => borrarEmpleado(emp)}
                    >
                      Borrar
                    </button>

                    <button
                      className="btn btn-sm swal-btn-confirm"
                      id="btn-editar-empleados"
                      onClick={() => cargarEditar(emp)}
                    >
                      Editar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

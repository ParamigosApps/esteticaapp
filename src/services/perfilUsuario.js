import { doc, setDoc, getDoc } from 'firebase/firestore'
import { db, auth } from '../Firebase.js'
import { swalEditarPerfil } from '../utils/swalUtils'
import { toastSuccess } from '../utils/toastifyUtils'

export async function editarPerfilUsuario({
  uid,
  nombreActual = '',
}) {
  const ref = doc(db, 'usuarios', uid)
  const snap = await getDoc(ref)

  if (!snap.exists()) {
    throw new Error('Usuario no encontrado')
  }

const data = snap.data()

const authUser = auth.currentUser
const providerIds =
  authUser?.providerData?.map(p => p.providerId) || []

const esSoloTelefono =
  providerIds.length === 1 && providerIds.includes('phone')

const puedeEditarEmail = esSoloTelefono

const emailAnterior = data.email || null

const { value, isConfirmed } = await swalEditarPerfil({
  nombreActual,
  apodoActual: data.apodo || '',
  emailActual: puedeEditarEmail ? emailAnterior : null, // 👈 fuente real
  bloquearEmail: !puedeEditarEmail,
})

  if (!isConfirmed || !value) return null

  const updates = {
    nombre: value.nombre,
    apodo: value.apodo || null,
  }

  let emailNuevo = emailAnterior

  if (puedeEditarEmail) {
    const nuevo = value.email?.trim() || null

    updates.email = nuevo
    emailNuevo = nuevo
  }

  await setDoc(ref, updates, { merge: true })

  // 📧 notificar SOLO cuando viene de phone y cambió realmente
  if (
    puedeEditarEmail &&
    emailNuevo &&
    emailNuevo !== emailAnterior &&
    /^\S+@\S+\.\S+$/.test(emailNuevo)
  ) {

  }

  toastSuccess('Perfil actualizado')

  return {
    nombre: updates.nombre,
    apodo: updates.apodo,
    email: emailNuevo,
  }
}
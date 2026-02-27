import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp as fsServerTimestamp,
} from 'firebase/firestore'
import { db } from '../Firebase.js'

export async function guardarPerfilUsuario({
  uid,
  nombre,
  emailNuevo = null,
  phoneNumber = null,
  provider = 'phone',
}) {
  const ref = doc(db, 'usuarios', uid)
  const snap = await getDoc(ref)

  const emailAnterior = snap.exists() ? snap.data().email || null : null

  // 🔑 Email final: prioridad al nuevo, si no conservar el anterior
  const emailFinal =
    emailNuevo && emailNuevo.trim() !== ''
      ? emailNuevo.trim().toLowerCase()
      : emailAnterior

  // 💾 Guardar / actualizar perfil
  await setDoc(
    ref,
    {
      uid,
      nombre,
      nombreConfirmado: true,
      email: emailFinal || null,
      emailConfirmado: Boolean(emailFinal),
      phoneNumber: phoneNumber || null,
      provider,
      actualizadoEn: fsServerTimestamp(), // ⬅️ no sobrescribimos creadoEn
    },
    { merge: true }
  )

  return {
    nombre,
    email: emailFinal,
  }
}

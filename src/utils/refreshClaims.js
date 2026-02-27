// --------------------------------------------------------------
// utils/refreshClaims.js — REFRESH FORZADO DE CLAIMS
// --------------------------------------------------------------
import { auth } from '../Firebase.js'

export async function refreshClaims() {
  const user = auth.currentUser
  if (!user?.uid) return null

  // 🔄 Forzar refresh del token
  await user.getIdToken(true)

  // 📦 Obtener claims actualizados
  const tokenResult = await user.getIdTokenResult()

  console.log('🔐 Claims actualizados:', tokenResult.claims)

  return tokenResult.claims
}

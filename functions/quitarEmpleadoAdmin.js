const { getAdmin } = require('../_lib/firebaseAdmin.js')
const { HttpsError } = require('firebase-functions/v2/https')

async function quitarEmpleadoAdminHandler(request) {
  const { auth, data } = request

  if (!auth?.token?.admin) {
    throw new HttpsError('permission-denied', 'Solo admin')
  }

  const { uid } = data || {}

  if (!uid) {
    throw new HttpsError('invalid-argument', 'UID requerido')
  }

  const admin = getAdmin()

  // 🔥 1️⃣ QUITAR CLAIMS
  await admin.auth().setCustomUserClaims(uid, {
    admin: false,
    nivel: null,
  })

  // 🔥 2️⃣ OPCIONAL: eliminar usuario de Auth
  await admin.auth().deleteUser(uid)

  return { ok: true }
}

module.exports = { quitarEmpleadoAdminHandler }

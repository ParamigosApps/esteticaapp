// functions/bootstrapAdmin.js
const { getAdmin } = require('../_lib/firebaseAdmin.js')
const { HttpsError } = require('firebase-functions/v2/https')

async function setAdminClaimHandler(request) {
  const { auth, data } = request

  const callerIsAdmin = auth?.token?.admin === true

  if (!callerIsAdmin) {
    const targetUid = data?.uid
    if (!targetUid) {
      throw new HttpsError('invalid-argument', 'UID requerido')
    }

    const admin = getAdmin()
    const snap = await admin.firestore().doc(`usuarios/${targetUid}`).get()

    if (!snap.exists || snap.data()?.nivel !== 4) {
      throw new HttpsError('permission-denied', 'Solo admin')
    }
  }

  const { uid, adminLevel } = data || {}
  if (!uid) {
    throw new HttpsError('invalid-argument', 'UID requerido')
  }

  const admin = getAdmin()

  await admin.auth().setCustomUserClaims(uid, {
    admin: true,
    nivel: adminLevel ?? null,
  })

  return { ok: true }
}

module.exports = { setAdminClaimHandler }

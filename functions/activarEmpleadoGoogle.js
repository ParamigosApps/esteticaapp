const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { FieldValue } = require('firebase-admin/firestore')
const { getAdmin } = require('./_lib/firebaseAdmin')

function normalizarEmail(value) {
  return String(value || '').trim().toLowerCase()
}

exports.activarEmpleadoGoogle = onCall(async request => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'No autenticado')
  }

  const admin = getAdmin()
  const db = admin.firestore()
  const uid = request.auth.uid
  const email = normalizarEmail(request.auth.token?.email || '')

  if (!email) {
    throw new HttpsError('failed-precondition', 'La cuenta debe tener email')
  }

  const perfilRef = db.doc(`usuarios/${uid}`)
  const perfilSnap = await perfilRef.get()
  const perfilActual = perfilSnap.exists ? perfilSnap.data() || {} : {}

  let nivel = Number(perfilActual?.nivel || 0)
  let nombre = perfilActual?.nombre || request.auth.token?.name || ''
  let esEmpleado = Boolean(perfilActual?.esEmpleado)

  if (!esEmpleado || nivel < 1) {
    const invitacionRef = db.doc(`empleados_invitados/${email}`)
    const invitacionSnap = await invitacionRef.get()

    if (invitacionSnap.exists) {
      const invitacion = invitacionSnap.data() || {}
      nivel = Number(invitacion.nivel || 0)
      nombre = invitacion.nombre || nombre
      esEmpleado = true

      await invitacionRef.delete()
    }
  }

  if (!esEmpleado || nivel < 1) {
    throw new HttpsError('permission-denied', 'No tienes acceso al panel')
  }

  await admin.auth().setCustomUserClaims(uid, {
    admin: nivel >= 3,
    nivel,
  })

  await perfilRef.set(
    {
      uid,
      email,
      nombre,
      nivel,
      esEmpleado: true,
      actualizadoEn: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )

  return {
    ok: true,
    uid,
    nivel,
    admin: nivel >= 3,
  }
})

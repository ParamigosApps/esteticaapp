const { getAdmin } = require('../_lib/firebaseAdmin.js')
const { HttpsError } = require('firebase-functions/v2/https')
const { FieldValue } = require('firebase-admin/firestore')
const { assertOwnerAdmin } = require('./admin/adminTurnosShared')

async function quitarEmpleadoAdminHandler(request) {
  const { data } = request
  assertOwnerAdmin(request)

  const { uid } = data || {}

  if (!uid) {
    throw new HttpsError('invalid-argument', 'UID requerido')
  }

  if (uid === request.auth?.uid) {
    throw new HttpsError('failed-precondition', 'No puedes eliminar tu propio acceso')
  }

  const admin = getAdmin()
  const db = admin.firestore()
  const usuarioRef = db.doc(`usuarios/${uid}`)
  const usuarioSnap = await usuarioRef.get()

  if (!usuarioSnap.exists) {
    throw new HttpsError('not-found', 'Empleado no encontrado')
  }

  const usuario = usuarioSnap.data() || {}
  const auth = admin.auth()
  let authUserExiste = true

  try {
    await auth.getUser(uid)
  } catch (error) {
    const code = String(error?.code || '')
    if (code.includes('user-not-found')) {
      authUserExiste = false
    } else {
      throw error
    }
  }

  const serviciosSnap = await db
    .collection('servicios')
    .where('profesionalId', '==', uid)
    .get()

  const batch = db.batch()

  serviciosSnap.forEach((servicioDoc) => {
    const servicio = servicioDoc.data() || {}

    batch.set(
      servicioDoc.ref,
      {
        profesionalId: FieldValue.delete(),
        nombreProfesional: FieldValue.delete(),
        responsableGestion:
          servicio.responsableGestion === 'profesional'
            ? 'admin'
            : servicio.responsableGestion || 'admin',
      },
      { merge: true },
    )
  })

  batch.delete(usuarioRef)
  await batch.commit()

  if (authUserExiste) {
    await auth.setCustomUserClaims(uid, {
      admin: false,
      nivel: 0,
    })

    await auth.deleteUser(uid)
  }

  return {
    ok: true,
    uid,
    email: usuario.email || null,
    authUserExiste,
  }
}

module.exports = { quitarEmpleadoAdminHandler }

const { HttpsError } = require('firebase-functions/v2/https')
const { FieldValue } = require('firebase-admin/firestore')
const { getAdmin } = require('./_lib/firebaseAdmin')
const { assertOwnerAdmin } = require('./admin/adminTurnosShared')

function normalizarEmail(value) {
  return String(value || '').trim().toLowerCase()
}

async function actualizarEmpleadoAdminHandler(request) {
  assertOwnerAdmin(request)

  const { uid, email, nombre, nivel } = request.data || {}
  const nombreNormalizado = String(nombre || '').trim()
  const emailNormalizado = normalizarEmail(email)
  const nivelEmpleado = Number(nivel)

  if (!nombreNormalizado || !nivelEmpleado || ![1, 2, 3, 4].includes(nivelEmpleado)) {
    throw new HttpsError('invalid-argument', 'Datos invalidos')
  }

  const admin = getAdmin()
  const esAdminEmpleado = nivelEmpleado >= 3

  if (uid) {
    const serviciosSnap = await admin
      .firestore()
      .collection('servicios')
      .where('profesionalId', '==', uid)
      .get()

    const batch = admin.firestore().batch()

    await admin.auth().setCustomUserClaims(uid, {
      admin: esAdminEmpleado,
      nivel: nivelEmpleado,
    })

    await admin.auth().updateUser(uid, {
      displayName: nombreNormalizado,
    })

    batch.set(
      admin.firestore().doc(`usuarios/${uid}`),
      {
        uid,
        email: emailNormalizado || undefined,
        nombre: nombreNormalizado,
        nivel: nivelEmpleado,
        esEmpleado: true,
        actualizadoEn: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )

    serviciosSnap.forEach((servicioDoc) => {
      batch.set(
        servicioDoc.ref,
        {
          nombreProfesional: nombreNormalizado,
        },
        { merge: true },
      )
    })

    await batch.commit()

    return {
      ok: true,
      uid,
      nivel: nivelEmpleado,
      admin: esAdminEmpleado,
    }
  }

  if (!emailNormalizado) {
    throw new HttpsError('invalid-argument', 'UID o email requerido')
  }

  await admin.firestore().doc(`empleados_invitados/${emailNormalizado}`).set(
    {
      email: emailNormalizado,
      nombre: nombreNormalizado,
      nivel: nivelEmpleado,
      esEmpleado: true,
      admin: esAdminEmpleado,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )

  return {
    ok: true,
    email: emailNormalizado,
    nivel: nivelEmpleado,
    admin: esAdminEmpleado,
    invitado: true,
  }
}

module.exports = { actualizarEmpleadoAdminHandler }

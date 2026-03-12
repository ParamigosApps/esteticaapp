const { HttpsError } = require('firebase-functions/v2/https')
const { FieldValue } = require('firebase-admin/firestore')
const { getAdmin } = require('./_lib/firebaseAdmin')
const { assertOwnerAdmin } = require('./admin/adminTurnosShared')

function normalizarEmail(value) {
  return String(value || '').trim().toLowerCase()
}

async function crearEmpleadoAdminHandler(request) {
  assertOwnerAdmin(request)

  const { email, nombre, nivel } = request.data || {}
  const emailNormalizado = normalizarEmail(email)

  if (!emailNormalizado || !nombre || !nivel) {
    throw new HttpsError('invalid-argument', 'Datos incompletos')
  }

  const nivelEmpleado = Number(nivel)
  if (![1, 2, 3, 4].includes(nivelEmpleado)) {
    throw new HttpsError('invalid-argument', 'Nivel invalido')
  }

  const admin = getAdmin()
  const esAdminEmpleado = nivelEmpleado >= 3

  try {
    const user = await admin.auth().getUserByEmail(emailNormalizado)

    await admin.auth().setCustomUserClaims(user.uid, {
      admin: esAdminEmpleado,
      nivel: nivelEmpleado,
    })

    await admin.firestore().doc(`usuarios/${user.uid}`).set(
      {
        uid: user.uid,
        email: emailNormalizado,
        nombre: String(nombre).trim(),
        nivel: nivelEmpleado,
        esEmpleado: true,
        actualizadoEn: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )

    return {
      ok: true,
      uid: user.uid,
      invitado: false,
      admin: esAdminEmpleado,
      nivel: nivelEmpleado,
    }
  } catch (error) {
    const code = error?.code || ''
    if (!String(code).includes('user-not-found')) {
      throw error
    }
  }

  await admin.firestore().doc(`empleados_invitados/${emailNormalizado}`).set(
    {
      email: emailNormalizado,
      nombre: String(nombre).trim(),
      nivel: nivelEmpleado,
      esEmpleado: true,
      admin: esAdminEmpleado,
      estado: 'pendiente_google',
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )

  return {
    ok: true,
    invitado: true,
    email: emailNormalizado,
    nivel: nivelEmpleado,
  }
}

module.exports = { crearEmpleadoAdminHandler }

const { HttpsError } = require('firebase-functions/v2/https')
const { getAdmin } = require('./_lib/firebaseAdmin')
const { FieldValue } = require('firebase-admin/firestore')

async function crearEmpleadoAdminHandler(request) {
  const { auth, data } = request

  // --------------------------------------------------
  // 🔒 VALIDACIÓN OWNER REAL (SOLICITANTE)
  // --------------------------------------------------
  const nivelSolicitante = Number(auth?.token?.nivel || 0)
  const esAdminSolicitante = auth?.token?.admin === true

  if (!auth || !esAdminSolicitante || nivelSolicitante !== 4) {
    throw new HttpsError(
      'permission-denied',
      'Solo el dueño puede crear o modificar empleados'
    )
  }

  // --------------------------------------------------
  // 📦 DATA
  // --------------------------------------------------
  const { email, password, nombre, nivel } = data || {}

  if (!email || !nombre || !nivel) {
    throw new HttpsError('invalid-argument', 'Datos incompletos')
  }

  const nivelEmpleado = Number(nivel)
  if (![1, 2, 3, 4].includes(nivelEmpleado)) {
    throw new HttpsError('invalid-argument', 'Nivel inválido')
  }

  const admin = getAdmin()

  // --------------------------------------------------
  // 🔎 CREAR U OBTENER AUTH
  // --------------------------------------------------
  let user

  try {
    user = await admin.auth().getUserByEmail(email)
  } catch {
    if (!password) {
      throw new HttpsError(
        'failed-precondition',
        'El usuario no existe y requiere contraseña'
      )
    }

    user = await admin.auth().createUser({
      email,
      password,
      displayName: nombre,
    })
  }

  // --------------------------------------------------
  // 🔐 CLAIMS
  // --------------------------------------------------
  const esAdminEmpleado = nivelEmpleado >= 3

  await admin.auth().setCustomUserClaims(user.uid, {
    admin: esAdminEmpleado,
    nivel: nivelEmpleado,
  })

  // --------------------------------------------------
  // 🔥 FIRESTORE
  // --------------------------------------------------
  await admin.firestore().doc(`usuarios/${user.uid}`).set(
    {
      uid: user.uid,
      email,
      nombre,
      nivel: nivelEmpleado,
      esEmpleado: true,
      actualizadoEn: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )

  return {
    ok: true,
    uid: user.uid,
    admin: esAdminEmpleado,
    nivel: nivelEmpleado,
  }
}

module.exports = { crearEmpleadoAdminHandler }

const { HttpsError } = require('firebase-functions/v2/https')
const { getAdmin } = require('./_lib/firebaseAdmin')
const { assertOwnerAdmin } = require('./admin/adminTurnosShared')

async function eliminarInvitacionEmpleadoAdminHandler(request) {
  assertOwnerAdmin(request)

  const invitacionId = String(
    request.data?.id || request.data?.email || '',
  ).trim().toLowerCase()

  if (!invitacionId) {
    throw new HttpsError('invalid-argument', 'Invitacion requerida')
  }

  await getAdmin().firestore().doc(`empleados_invitados/${invitacionId}`).delete()

  return {
    ok: true,
    id: invitacionId,
  }
}

module.exports = { eliminarInvitacionEmpleadoAdminHandler }

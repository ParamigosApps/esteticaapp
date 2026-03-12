const { getAdmin } = require('./_lib/firebaseAdmin')
const { assertOwnerAdmin } = require('./admin/adminTurnosShared')

async function listarInvitacionesEmpleadoAdminHandler(request) {
  assertOwnerAdmin(request)

  const snap = await getAdmin()
    .firestore()
    .collection('empleados_invitados')
    .get()

  const invitaciones = snap.docs
    .map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))
    .sort((a, b) =>
      String(a.email || '').localeCompare(String(b.email || ''), 'es'),
    )

  return {
    ok: true,
    invitaciones,
  }
}

module.exports = { listarInvitacionesEmpleadoAdminHandler }

// --------------------------------------------------
// functions/turnos/confirmarPagoTurno.js
// --------------------------------------------------
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { Timestamp } = require('firebase-admin/firestore')
const { getAdmin } = require('../_lib/firebaseAdmin')

exports.confirmarPagoTurno = onCall(
  { region: 'us-central1' },
  async request => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'No autenticado')
    }

    const { turnoId, montoPagado } = request.data || {}

    if (!turnoId || montoPagado == null) {
      throw new HttpsError('invalid-argument', 'Datos incompletos')
    }

    const admin = getAdmin()
    const db = admin.firestore()

    return await db.runTransaction(async tx => {
      const turnoRef = db.collection('turnos').doc(turnoId)
      const turnoSnap = await tx.get(turnoRef)

      if (!turnoSnap.exists) {
        throw new HttpsError('not-found', 'Turno inexistente')
      }

      const turno = turnoSnap.data()

      // --------------------------------------------------
      // Validaciones duras
      // --------------------------------------------------
      if (turno.estado !== 'pendiente') {
        throw new HttpsError(
          'failed-precondition',
          'El turno no está pendiente'
        )
      }

      if (turno.holdHasta.toMillis() < Date.now()) {
        throw new HttpsError(
          'deadline-exceeded',
          'El turno expiró'
        )
      }

      const total = Number(turno.total || 0)
      const sena = Number(turno.seña || 0)
      const pagado = Number(montoPagado)

      if (!Number.isFinite(pagado) || pagado <= 0) {
        throw new HttpsError('invalid-argument', 'Monto inválido')
      }

      // --------------------------------------------------
      // Determinar estado final
      // --------------------------------------------------
      let nuevoEstado

      if (pagado >= total) {
        nuevoEstado = 'confirmado'
      } else if (pagado >= sena && sena > 0) {
        nuevoEstado = 'señado'
      } else {
        throw new HttpsError(
          'failed-precondition',
          'Pago insuficiente'
        )
      }

      // --------------------------------------------------
      // Confirmar turno
      // --------------------------------------------------
      tx.update(turnoRef, {
        estado: nuevoEstado,
        pagadoTotal: pagado,
        confirmadoEn: Timestamp.now()
      })

      return {
        ok: true,
        estado: nuevoEstado
      }
    })
  }
)
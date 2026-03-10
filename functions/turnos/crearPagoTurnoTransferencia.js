// --------------------------------------------------
// functions/turnos/crearPagoTurnoTransferencia.js
// --------------------------------------------------

const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { FieldValue } = require('firebase-admin/firestore')
const { getAdmin } = require('../_lib/firebaseAdmin')

exports.crearPagoTurnoTransferencia = onCall(
  { region: 'us-central1' },
  async request => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'No autenticado')
    }

    const { turnoId } = request.data || {}

    if (!turnoId) {
      throw new HttpsError('invalid-argument', 'turnoId requerido')
    }

    const admin = getAdmin()
    const db = admin.firestore()
    const uid = request.auth.uid

    const turnoRef = db.collection('turnos').doc(turnoId)
    const turnoSnap = await turnoRef.get()

    if (!turnoSnap.exists) {
      throw new HttpsError('not-found', 'Turno no encontrado')
    }

    const turno = turnoSnap.data() || {}

if ((turno.usuarioId || turno.clienteId) !== uid) {
  throw new HttpsError('permission-denied', 'No autorizado')
}

    const estadoTurnoActual =
      turno.estadoTurno ||
      turno.estado ||
      'pendiente'

    const estadoPagoActual =
      turno.estadoPago ||
      'pendiente'

    if (['cancelado', 'perdido', 'finalizado', 'rechazado'].includes(estadoTurnoActual)) {
      throw new HttpsError(
        'failed-precondition',
        `El turno no admite pago en estado ${estadoTurnoActual}`
      )
    }

    const montoTotal = Number(
      turno.montoTotal ??
      turno.total ??
      0
    )

    const montoSena = Number(
      turno.montoSena ??
      turno.seña ??
      turno.sena ??
      0
    )

    if (!turno.pedirAnticipo || !Number.isFinite(montoSena) || montoSena <= 0) {
      throw new HttpsError(
        'failed-precondition',
        'Este turno no requiere seña'
      )
    }

    if (turno.venceEn && Number(turno.venceEn) <= Date.now()) {
      throw new HttpsError('failed-precondition', 'Turno expirado')
    }

    if (
      estadoPagoActual === 'abonado' ||
      estadoPagoActual === 'pendiente_aprobacion'
    ) {
      throw new HttpsError(
        'failed-precondition',
        `El turno ya tiene un pago en estado ${estadoPagoActual}`
      )
    }

    const pagoRef = db.collection('pagos').doc()

    await pagoRef.set({
      turnoId,
      clienteId: uid,

      metodo: 'transferencia',
      estado: 'pendiente_aprobacion',

      monto: montoSena,
      montoTotal,
      tipoPago: 'sena',

      comprobanteUrl: null,

      creadoEn: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    await turnoRef.update({
      pagoId: pagoRef.id,
      metodoPago: 'transferencia',
      estadoPago: 'pendiente_aprobacion',
      estadoTurno: ['pendiente_aprobacion', 'confirmado'].includes(estadoTurnoActual)
        ? estadoTurnoActual
        : 'pendiente_aprobacion',
      montoTotal,
      montoPagado: Number(turno.montoPagado ?? 0),
      saldoPendiente: Math.max(
        0,
        montoTotal - Number(turno.montoPagado ?? 0)
      ),
      venceEn: null,
      updatedAt: FieldValue.serverTimestamp(),
    })

    return {
      ok: true,
      pagoId: pagoRef.id,
      estadoPago: 'pendiente_aprobacion',
      estadoTurno: ['pendiente_aprobacion', 'confirmado'].includes(estadoTurnoActual)
        ? estadoTurnoActual
        : 'pendiente_aprobacion',
    }
  }
)
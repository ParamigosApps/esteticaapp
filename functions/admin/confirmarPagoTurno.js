// --------------------------------------------------
// functions/turnos/confirmarPagoTurno.js
// --------------------------------------------------
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { FieldValue } = require('firebase-admin/firestore')
const { getAdmin } = require('../_lib/firebaseAdmin')

function calcularEstadoPago(montoTotal = 0, montoPagado = 0) {
  const total = Number(montoTotal || 0)
  const pagado = Math.max(0, Number(montoPagado || 0))

  if (total <= 0) {
    return pagado > 0 ? 'abonado' : 'pendiente'
  }

  if (pagado <= 0) return 'pendiente'
  if (pagado < total) return 'parcial'
  return 'abonado'
}

exports.confirmarPagoTurno = onCall(
  { region: 'us-central1' },
  async request => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'No autenticado')
    }

    // Ajustá esto si usás otro esquema de claims/permisos
    if (!request.auth?.token?.admin) {
      throw new HttpsError('permission-denied', 'Solo admin')
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

      const turno = turnoSnap.data() || {}

      const estadoTurnoActual =
        turno.estadoTurno ||
        turno.estado ||
        'pendiente'

      const estadoPagoActual =
        turno.estadoPago ||
        'pendiente'

      // --------------------------------------------------
      // Validaciones duras
      // --------------------------------------------------
      if (['cancelado', 'perdido', 'finalizado', 'rechazado'].includes(estadoTurnoActual)) {
        throw new HttpsError(
          'failed-precondition',
          `No se puede confirmar un turno en estado ${estadoTurnoActual}`
        )
      }

      const venceMs =
        typeof turno.venceEn === 'number'
          ? turno.venceEn
          : turno.holdHasta?.toMillis?.() || null

      if (venceMs && venceMs < Date.now()) {
        throw new HttpsError(
          'deadline-exceeded',
          'El turno expiró'
        )
      }

      const total = Number(
        turno.montoTotal ??
        turno.total ??
        0
      )

      const pagadoActual = Number(
        turno.montoPagado ??
        turno.pagadoTotal ??
        0
      )

      const pagoIngresado = Number(montoPagado)

      if (!Number.isFinite(pagoIngresado) || pagoIngresado <= 0) {
        throw new HttpsError('invalid-argument', 'Monto inválido')
      }

      const nuevoMontoPagado =
        total > 0
          ? Math.min(total, pagadoActual + pagoIngresado)
          : pagadoActual + pagoIngresado

      const saldoPendiente = Math.max(0, total - nuevoMontoPagado)
      const nuevoEstadoPago = calcularEstadoPago(total, nuevoMontoPagado)

      // --------------------------------------------------
      // Estado turno final
      // --------------------------------------------------
      let nuevoEstadoTurno = estadoTurnoActual

      if (
        ['pendiente', 'pendiente_aprobacion', 'confirmado'].includes(estadoTurnoActual)
      ) {
        nuevoEstadoTurno = 'confirmado'
      }

      const updateData = {
        estadoTurno: nuevoEstadoTurno,
        estadoPago: nuevoEstadoPago,
        montoTotal: total,
        montoPagado: nuevoMontoPagado,
        saldoPendiente,
        updatedAt: FieldValue.serverTimestamp(),
      }

      if (nuevoEstadoTurno === 'confirmado' && !turno.confirmadoAt) {
        updateData.confirmadoAt = FieldValue.serverTimestamp()
      }

      // opcional: trazabilidad manual/admin
      updateData.pagoConfirmadoManual = true
      updateData.pagoConfirmadoPorUid = request.auth.uid
      updateData.pagoConfirmadoAt = FieldValue.serverTimestamp()

      tx.update(turnoRef, updateData)

      return {
        ok: true,
        estadoTurno: nuevoEstadoTurno,
        estadoPago: nuevoEstadoPago,
        montoPagado: nuevoMontoPagado,
        saldoPendiente,
        estadoPagoAnterior: estadoPagoActual,
      }
    })
  }
)
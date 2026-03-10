// functions/callables/confirmarPagoManual.js
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { FieldValue } = require('firebase-admin/firestore')
const { getAdmin } = require('../_lib/firebaseAdmin.js')

exports.confirmarPagoManual = onCall(async request => {
  const { auth, data } = request
  const { pagoId } = data || {}

  // --------------------------------------------------
  // 🔐 Seguridad: solo admin
  // --------------------------------------------------
  if (!auth?.token?.admin) {
    throw new HttpsError('permission-denied', 'Solo admin')
  }

  // --------------------------------------------------
  // Validaciones
  // --------------------------------------------------
  if (!pagoId || typeof pagoId !== 'string') {
    throw new HttpsError('invalid-argument', 'pagoId requerido')
  }

  const admin = getAdmin()
  const db = admin.firestore()

  console.log('🔎 confirmarPagoManual (callable)', {
    pagoId,
    adminUid: auth.uid,
  })

  // --------------------------------------------------
  // 🔎 Buscar pago por doc.id
  // --------------------------------------------------
  const pagoRef = db.collection('pagos').doc(pagoId)
  const snap = await pagoRef.get()

  if (!snap.exists) {
    throw new HttpsError('not-found', 'Pago inexistente')
  }

  const pago = snap.data() || {}

  // --------------------------------------------------
  // 🔒 Idempotencia dura
  // --------------------------------------------------
  if (pago.estado === 'aprobado' || pago.estado === 'pagado') {
    return { ok: true, alreadyApproved: true }
  }

  // --------------------------------------------------
  // 🚫 No confirmar pagos ya cerrados
  // --------------------------------------------------
  if (['rechazado', 'expirado', 'reembolsado'].includes(pago.estado)) {
    throw new HttpsError(
      'failed-precondition',
      `No se puede aprobar un pago en estado ${pago.estado}`
    )
  }

  // --------------------------------------------------
  // 💾 Marcar como aprobado manualmente
  // --------------------------------------------------
  await pagoRef.update({
    estado: 'aprobado',

    aprobadoPorUid: auth.uid,
    aprobadoPor: 'admin',
    aprobadoManual: true,
    metodoConfirmacion: 'manual',

    liquidado: false,
    liquidacionId: pago.liquidacionId ?? null,

    eventoId: pago.eventoId ?? null,

    aprobadoEn: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  return { ok: true }
})
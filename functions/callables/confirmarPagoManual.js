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

  const pago = snap.data()

  // --------------------------------------------------
  // 🔒 Idempotencia dura
  // --------------------------------------------------
  if (pago.estado === 'pagado') {
    return { ok: true, alreadyPaid: true }
  }

  // --------------------------------------------------
  // 💾 Marcar como pagado (manual)
  // --------------------------------------------------
  await pagoRef.update({
    estado: 'pagado',

    aprobadoPor: 'admin',
    aprobadoManual: true,

    liquidado: false, // ✅ clave contable
    eventoId: pago.eventoId, // ✅ imprescindible para liquidaciones

    aprobadoEn: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  return { ok: true }
})

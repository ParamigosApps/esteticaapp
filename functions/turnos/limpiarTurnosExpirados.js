// --------------------------------------------------
// functions/turnos/limpiarTurnosExpirados.js
// --------------------------------------------------
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { getAdmin } = require('../_lib/firebaseAdmin')
const { Timestamp } = require('firebase-admin/firestore')

exports.limpiarTurnosExpirados = onSchedule(
  {
    schedule: 'every 5 minutes',
    region: 'us-central1'
  },
  async () => {
    const db = getAdmin().firestore()

    const ahora = Timestamp.now()

    const snap = await db
      .collection('turnos')
      .where('estado', '==', 'pendiente')
      .where('holdHasta', '<=', ahora)
      .get()

    if (snap.empty) return null

    const batch = db.batch()

    snap.docs.forEach(doc => {
      batch.update(doc.ref, {
        estado: 'expirado'
      })
    })

    await batch.commit()

    return null
  }
)
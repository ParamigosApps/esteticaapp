// --------------------------------------------------
// functions/turnos/getAgendaGabinete.js
// VERSION CORREGIDA Y BLINDADA
// --------------------------------------------------
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { getAdmin } = require('../_lib/firebaseAdmin')

exports.getAgendaGabinete = onCall(
  { region: 'us-central1' },
  async (request) => {

    // 🔐 Auth
    if (!request.auth?.uid)
      throw new HttpsError('unauthenticated', 'No autenticado')

    const { gabineteIds } = request.data || {}

    // 🛡 Validaciones fuertes
    if (!Array.isArray(gabineteIds))
      throw new HttpsError('invalid-argument', 'gabineteIds debe ser array')

    const idsValidos = gabineteIds
      .filter(id => typeof id === 'string' && id.trim() !== '')

    if (idsValidos.length === 0)
      throw new HttpsError('invalid-argument', 'gabineteIds inválidos')

    if (idsValidos.length > 10)
      throw new HttpsError('invalid-argument', 'Máximo 10 gabinetes por consulta')

    const db = getAdmin().firestore()

    const horarios = []
    const bloqueos = []
    const turnos = []

    // --------------------------------------------------
    // 1️⃣ HORARIOS Y BLOQUEOS
    // --------------------------------------------------
    await Promise.all(
      idsValidos.map(async (gabineteId) => {

        // HORARIOS
        const horariosSnap = await db
          .collection('gabinetes')
          .doc(gabineteId)
          .collection('horarios')
          .where('activo', '==', true)
          .get()

        horariosSnap.forEach(d => {
          horarios.push({
            id: d.id,
            gabineteId,
            ...d.data()
          })
        })

        // BLOQUEOS
        const bloqueosSnap = await db
          .collection('gabinetes')
          .doc(gabineteId)
          .collection('bloqueos')
          .get()

        bloqueosSnap.forEach(d => {
          const b = d.data()
          bloqueos.push({
            id: d.id,
            gabineteId,
            desde: b.desde?.toMillis?.() || null,
            hasta: b.hasta?.toMillis?.() || null,
            motivo: b.motivo || ''
          })
        })
      })
    )

    // --------------------------------------------------
    // 2️⃣ TURNOS
    // --------------------------------------------------
    const turnosSnap = await db
      .collection('turnos')
      .where('gabineteId', 'in', idsValidos)
      .get()

    turnosSnap.forEach(d => {
      const t = d.data()

      if (![
        'pendiente_pago',
        'pendiente_aprobacion',
        'señado',
        'confirmado'
      ].includes(t.estado)) {
        return
      }

      turnos.push({
        id: d.id,
        gabineteId: t.gabineteId,

        inicioMs: Number(t.inicioMs ?? t.inicio?.toMillis?.() ?? null),
        finMs: Number(t.finMs ?? t.fin?.toMillis?.() ?? null),

        estado: t.estado,
        servicioId: t.servicioId || null,
      })
    })

    return { horarios, bloqueos, turnos }

  }
)
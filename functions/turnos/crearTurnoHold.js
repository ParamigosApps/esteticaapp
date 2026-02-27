// --------------------------------------------------
// functions/turnos/crearTurnoHold.js
// --------------------------------------------------
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { Timestamp } = require('firebase-admin/firestore')
const { getAdmin } = require('../_lib/firebaseAdmin')

const { FieldValue } = require("firebase-admin/firestore");

// helper seguro
function num(n, def = null) {
  const x = Number(n ?? def)
  if (!Number.isFinite(x)) {
    throw new HttpsError('invalid-argument', 'Número inválido')
  }
  return x
}

exports.crearTurnoHold = onCall(
  { region: 'us-central1' },
  async request => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'No autenticado')
    }

    const { servicioId, inicioMs } = request.data || {}

    if (!servicioId || !inicioMs) {
      throw new HttpsError('invalid-argument', 'Datos incompletos')
    }

    const admin = getAdmin()
    const db = admin.firestore()
    const uid = request.auth.uid

    return await db.runTransaction(async tx => {
      // --------------------------------------------------
      // 1️⃣ Servicio
      // --------------------------------------------------
      const servicioRef = db.collection('servicios').doc(servicioId)
      const servicioSnap = await tx.get(servicioRef)

      if (!servicioSnap.exists) {
        throw new HttpsError('not-found', 'Servicio no encontrado')
      }

      const servicio = servicioSnap.data()

      if (!servicio.activo) {
        throw new HttpsError('failed-precondition', 'Servicio inactivo')
      }

      const duracionMin = num(servicio.duracionMin)
      const bufferAntesMin = num(servicio.bufferAntesMin, 0)
      const bufferDespuesMin = num(servicio.bufferDespuesMin, 0)

      const gabineteId = servicio.gabineteId
      if (!gabineteId) {
        throw new HttpsError(
          'failed-precondition',
          'Servicio sin gabinete asignado'
        )
      }

      // --------------------------------------------------
      // 2️⃣ Calcular rango real (buffers incluidos)
      // --------------------------------------------------
      const inicioReal = new Date(num(inicioMs))

      const inicio = new Date(
        inicioReal.getTime() - bufferAntesMin * 60000
      )

      const fin = new Date(
        inicioReal.getTime() +
          duracionMin * 60000 +
          bufferDespuesMin * 60000
      )

      // --------------------------------------------------
      // 3️⃣ Validar solapes (turnos activos)
      // --------------------------------------------------
      const turnosSnap = await tx.get(
        db.collection('turnos')
          .where('gabineteId', '==', gabineteId)
          .where('inicio', '<', Timestamp.fromDate(fin))
          .where('fin', '>', Timestamp.fromDate(inicio))
      )

      for (const doc of turnosSnap.docs) {
        const t = doc.data()

        if (
          ['pendiente', 'señado', 'confirmado'].includes(t.estado)
        ) {
          throw new HttpsError(
            'already-exists',
            'Horario no disponible'
          )
        }
      }

      // --------------------------------------------------
      // 4️⃣ Bloqueos especiales
      // --------------------------------------------------
      const bloqueosSnap = await tx.get(
        db.collection('bloqueos_especiales')
          .where('gabineteId', '==', gabineteId)
          .where('desde', '<', Timestamp.fromDate(fin))
          .where('hasta', '>', Timestamp.fromDate(inicio))
          .limit(1)
      )

      if (!bloqueosSnap.empty) {
        throw new HttpsError(
          'failed-precondition',
          'Gabinete bloqueado'
        )
      }

      // --------------------------------------------------
      // 5️⃣ Crear HOLD
      // --------------------------------------------------
      const ahora = new Date()
      const holdHasta = new Date(ahora.getTime() + 30 * 60000) // 30 min

      const turnoRef = db.collection('turnos').doc()

      


// ...

const nowMs = Date.now();

// si requiere seña, vence en 10 min (ajustá si querés)
const venceEn = servicio.requierePago ? nowMs + 10 * 60 * 1000 : null;

tx.set(turnoRef, {
  servicioId,
  servicioNombre: servicio.nombre || servicio.nombreServicio || "",

  clienteId: uid,
  gabineteId,

  inicio: Timestamp.fromDate(inicio),
  fin: Timestamp.fromDate(fin),

  inicioMs: inicio.getTime(),
  finMs: fin.getTime(),

  estado: servicio.requierePago ? "pendiente_pago" : "confirmado",

  requiereSena: !!servicio.requierePago,
  montoSena: num(servicio.montoSeña, 0),
  precioTotal: num(servicio.precio, 0),

  pagoId: null,
  metodoPago: null,

  venceEn,

  creadoEn: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
});

      return {
        turnoId: turnoRef.id,
        holdHasta: holdHasta.getTime()
      }
    })
  }
)
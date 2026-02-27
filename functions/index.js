// ======================================================
// GLOBAL OPTIONS
// ======================================================
const functionsV2 = require('firebase-functions/v2')
const fetch = global.fetch ?? require('node-fetch')

functionsV2.setGlobalOptions({
  region: 'us-central1',
  maxInstances: 100,
})

// ======================================================
// IMPORTS
// ======================================================
const { onCall, onRequest } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { onDocumentWritten } = require('firebase-functions/v2/firestore')
const { defineSecret } = require('firebase-functions/params')

const { FieldValue, Timestamp } = require('firebase-admin/firestore')
const { getAdmin } = require('./_lib/firebaseAdmin')

const { setAdminClaimHandler } = require('./setAdminClaim')

// ======================================================
// SECRETS
// ======================================================
const MP_ACCESS_TOKEN = defineSecret('MP_ACCESS_TOKEN')
const MP_COLLECTOR_ID = defineSecret('MP_COLLECTOR_ID')


// ======================================================
// TURNOS
// ======================================================
const { crearTurnoHold } = require('./turnos/crearTurnoHold')
const { getAgendaGabinete } = require('./turnos/getAgendaGabinete')



// ======================================================
// ADMIN
// ======================================================
const { confirmarPagoTurno } = require('./admin/confirmarPagoTurno')



// ======================================================
// TURNOS (CALLABLE)
// ======================================================
exports.crearTurnoHold = crearTurnoHold
exports.crearPagoTurnoTransferencia =
  require('./turnos/crearPagoTurnoTransferencia').crearPagoTurnoTransferencia
exports.iniciarPagoTurnoMP =
  require("./turnos/iniciarPagoTurnoMP").iniciarPagoTurnoMP;

exports.getAgendaGabinete = getAgendaGabinete

// ======================================================
// ADMIN(CALLABLE)
// ======================================================

exports.confirmarPagoTurno = confirmarPagoTurno
exports.desactivarServicio =
  require("./admin/desactivarServicio").desactivarServicio;

exports.eliminarServicio =
  require("./admin/eliminarServicio").eliminarServicio;

exports.desactivarGabinete =
  require("./admin/desactivarGabinete").desactivarGabinete;

exports.eliminarGabinete =
  require("./admin/eliminarGabinete").eliminarGabinete;
// ======================================================
// AUTH / EMPLEADOS
// ======================================================
exports.setAdminClaim = onCall(setAdminClaimHandler)

exports.crearEmpleadoAdmin = onCall(async req => {
  const { crearEmpleadoAdminHandler } = require('./crearEmpleadoAdmin')
  return crearEmpleadoAdminHandler(req)
})

exports.quitarEmpleadoAdmin = onCall(async req => {
  const { quitarEmpleadoAdminHandler } = require('./quitarEmpleadoAdmin')
  return quitarEmpleadoAdminHandler(req)
})

// ======================================================
// HELPERS
// ======================================================
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function mpGet(url, token, retries = 5) {
  let lastErr = null

  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (r.ok) return await r.json()
      lastErr = await r.text()
    } catch (e) {
      lastErr = e.message
    }
    await sleep(800 * (i + 1))
  }

  throw new Error(`MP fetch failed: ${lastErr}`)
}

// ======================================================
// WEBHOOK MERCADOPAGO (CORE)
// ======================================================
exports.processWebhookEvent = onDocumentWritten(
  {
    document: 'webhook_events/{id}',
    secrets: [MP_ACCESS_TOKEN, MP_COLLECTOR_ID],
  },
  async (event) => {

    const snap = event.data.after
    if (!snap?.exists) return

    const data = snap.data()
    if (data.processed === true) return

    const topic = data.topic || data.type
    if (topic !== 'payment' && topic !== 'payments') {
      await snap.ref.update({ processed: true })
      return
    }

    const mpToken = MP_ACCESS_TOKEN.value()
    const collectorId = Number(MP_COLLECTOR_ID.value() || 0)

    const admin = getAdmin()
    const db = admin.firestore()
    const now = FieldValue.serverTimestamp()

    const paymentId =
      data.paymentId ||
      data.refId ||
      (typeof data.raw?.resource === 'string'
        ? data.raw.resource.split('/').pop()
        : null)

    if (!paymentId) {
      await snap.ref.update({
        processed: true,
        error: 'paymentId_missing',
        processedAt: now,
      })
      return
    }

    try {

      const payment = await mpGet(
        `https://api.mercadopago.com/v1/payments/${paymentId}`,
        mpToken
      )

      if (collectorId && Number(payment.collector_id) !== collectorId) {
        throw new Error('collector_mismatch')
      }

      const pagoId = payment.external_reference
      if (!pagoId) {
        throw new Error('external_reference_missing')
      }

      const pagoRef = db.collection('pagos_turnos').doc(pagoId)
      const pagoSnap = await pagoRef.get()

      if (!pagoSnap.exists) {
        await snap.ref.update({
          processed: true,
          note: 'pago_turno_no_encontrado',
          processedAt: now,
        })
        return
      }

      const pago = pagoSnap.data()

      // ================================
      // PAYMENT APPROVED
      // ================================
      if (payment.status === 'approved') {

        // Idempotencia fuerte
        if (
          pago.mpPaymentId === payment.id &&
          pago.estado === 'aprobado'
        ) {
          await snap.ref.update({
            processed: true,
            note: 'already_paid',
            processedAt: now,
          })
          return
        }

        await pagoRef.update({
          estado: 'aprobado',
          mpStatus: payment.status,
          mpPaymentId: payment.id,
          approvedAt: now,
          updatedAt: now,
        })

        const turnoRef = db.collection('turnos').doc(pago.turnoId)
        const turnoSnap = await turnoRef.get()

        if (turnoSnap.exists) {
          await turnoRef.update({
            estado: 'confirmado',
            confirmadoAt: now,
            updatedAt: now,
          })
        }

      }
      // ================================
      // PAYMENT REJECTED / CANCELLED
      // ================================
      else if (
        payment.status === 'rejected' ||
        payment.status === 'cancelled'
      ) {

        await pagoRef.update({
          estado: 'rechazado',
          mpStatus: payment.status,
          mpPaymentId: payment.id,
          updatedAt: now,
        })

      }
      // ================================
      // OTHER STATUS
      // ================================
      else {

        await pagoRef.update({
          estado: 'pendiente',
          mpStatus: payment.status,
          mpPaymentId: payment.id,
          updatedAt: now,
        })

      }

      // Marcar webhook procesado
      await snap.ref.update({
        processed: true,
        mpPaymentId: payment.id,
        processedAt: now,
      })

    } catch (err) {

      console.error('❌ webhook error', err)

      await snap.ref.update({
        processed: true,
        error: err.message,
        processedAt: now,
      })

    }

  }
)

// ======================================================
// RECONCILIACIÓN MP (SOLO TURNOS)
// ======================================================
exports.reconciliarPagosPendientes = onSchedule(
  {
    schedule: 'every 2 minutes',
    timeZone: 'America/Argentina/Buenos_Aires',
    secrets: [MP_ACCESS_TOKEN],
  },
  async () => {

    const admin = getAdmin()
    const db = admin.firestore()
    const token = MP_ACCESS_TOKEN.value()
    if (!token) return

    const pagosTurnosSnap = await db
      .collection('pagos_turnos')
      .where('estado', 'in', ['pendiente', 'rechazado'])
      .where('mpPaymentId', '!=', null)
      .limit(20)
      .get()

    for (const doc of pagosTurnosSnap.docs) {

      const pago = doc.data()
      const pagoRef = doc.ref

      try {

        const payment = await mpGet(
          `https://api.mercadopago.com/v1/payments/${pago.mpPaymentId}`,
          token
        )

        const now = FieldValue.serverTimestamp()

        if (payment.status === 'approved') {

         if (pago.estado !== 'aprobado'){

            await pagoRef.update({
              estado: 'aprobado',
              mpStatus: payment.status,
              approvedAt: now,
              updatedAt: now,
            })

            const turnoRef = db.collection('turnos').doc(pago.turnoId)
            await turnoRef.update({
              estado: 'confirmado',
              confirmadoAt: now,
            })
          }

        } else if (
          payment.status === 'rejected' ||
          payment.status === 'cancelled'
        ) {

          await pagoRef.update({
            estado: 'rechazado',
            mpStatus: payment.status,
            updatedAt: now,
          })
        }

      } catch (e) {
        console.error('❌ reconciliar turnos error', e.message)
      }
    }
  }
)

exports.expirarPagosTurnos = onSchedule(
  {
    schedule: 'every 1 minutes',
    timeZone: 'America/Argentina/Buenos_Aires',
  },
  async () => {

    const admin = getAdmin()
    const db = admin.firestore()
    const ahora = Date.now()

    const snap = await db
      .collection('pagos_turnos')
      .where('estado', '==', 'pendiente')
      .where('expiraEn', '<=', ahora)
      .get()

    for (const doc of snap.docs) {

      await doc.ref.update({
        estado: 'expirado',
        expiradoAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })

      const turnoId = doc.data().turnoId

      if (turnoId) {
        await db.collection('turnos').doc(turnoId).update({
          estado: 'vencido',
          venceEn: null,
          updatedAt: FieldValue.serverTimestamp(),
        })
      }
    }
  }
)
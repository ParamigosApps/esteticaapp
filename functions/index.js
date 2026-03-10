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
// WEBHOOK MP
// ======================================================
exports.webhookMP =
  require('./mp/webhookMP').webhookMP;

  
// ======================================================
// TURNOS
// ======================================================
const { getAgendaGabinete } = require('./turnos/getAgendaGabinete')

// ======================================================
// ADMIN
// ======================================================
const { confirmarPagoTurno } = require('./admin/confirmarPagoTurno')

// ======================================================
// TURNOS (CALLABLE)
// ======================================================
exports.crearTurnoInteligente =
  require("./turnos/crearTurnoInteligente").crearTurnoInteligente;
exports.reprogramarTurnoInteligente =
  require("./turnos/reprogramarTurnoInteligente").reprogramarTurnoInteligente;

exports.crearPagoTurnoTransferencia =
  require('./turnos/crearPagoTurnoTransferencia').crearPagoTurnoTransferencia
exports.iniciarPagoTurnoMP =
  require("./turnos/iniciarPagoTurnoMP").iniciarPagoTurnoMP;

exports.getAgendaGabinete = getAgendaGabinete

exports.notificarAdminNuevoTurno = require("./turnos/notificarAdminNuevoTurno").notificarAdminNuevoTurno;
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



exports.marcarTurnosFinalizados =
  require("./turnos/marcarTurnosFinalizados").marcarTurnosFinalizados;
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

async function aplicarPagoAprobadoEnTurno({
  db,
  turnoId,
  pago,
  payment,
  now,
}) {
  if (!turnoId) return

  const turnoRef = db.collection('turnos').doc(turnoId)
  const turnoSnap = await turnoRef.get()
  if (!turnoSnap.exists) return

  const turno = turnoSnap.data() || {}

  const montoTotal = Number(
    turno.montoTotal ??
    pago.montoTotal ??
    turno.total ??
    0
  )

  const montoActual = Number(turno.montoPagado ?? 0)
  const montoPago = Number(
    pago.monto ??
    payment.transaction_amount ??
    0
  )

  const nuevoMontoPagado =
    montoTotal > 0
      ? Math.min(montoTotal, montoActual + montoPago)
      : montoActual + montoPago

  const saldoPendiente = Math.max(0, montoTotal - nuevoMontoPagado)

  const estadoTurnoActual =
    turno.estadoTurno ||
    turno.estado ||
    'pendiente'

  const estadoTurnoFinal = ['cancelado', 'perdido', 'finalizado'].includes(estadoTurnoActual)
    ? estadoTurnoActual
    : 'confirmado'

  const updateData = {
    estadoTurno: estadoTurnoFinal,
    estadoPago: calcularEstadoPago(montoTotal, nuevoMontoPagado),

    metodoPago: 'mercadopago', // compatibilidad vieja
    metodoPagoEsperado: turno.metodoPagoEsperado || 'mercadopago',
    metodoPagoUsado: 'mercadopago',

    montoTotal,
    montoPagado: nuevoMontoPagado,
    saldoPendiente,

    pagoId: pago?.id || turno.pagoId || null,
    updatedAt: now,
  }

  if (estadoTurnoFinal === 'confirmado') {
    updateData.confirmadoAt = turno.confirmadoAt || now
  }

  await turnoRef.update(updateData)
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

      const pagoRef = db.collection('pagos').doc(pagoId)
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
        metodo: 'mercadopago',
        canal: pago.canal || 'checkout_pro',
        origen: pago.origen || 'turno_online',
        mpStatus: payment.status,
        mpPaymentId: payment.id,
        approvedAt: now,
        updatedAt: now,
      })

        await aplicarPagoAprobadoEnTurno({
          db,
          turnoId: pago.turnoId,
          pago,
          payment,
          now,
        })

      }
      // ================================
      // PAYMENT REJECTED / CANCELLED
      // ================================
      else if (
        payment.status === 'rejected' ||
        payment.status === 'cancelled'
      ) {

    await pagoRef.update({
      estado: 'pendiente',
      metodo: 'mercadopago',
      canal: pago.canal || 'checkout_pro',
      origen: pago.origen || 'turno_online',
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
      .collection('pagos')
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

          if (pago.estado !== 'aprobado') {
            await pagoRef.update({
              estado: 'aprobado',
              mpStatus: payment.status,
              approvedAt: now,
              updatedAt: now,
            })

            await aplicarPagoAprobadoEnTurno({
              db,
              turnoId: pago.turnoId,
              pago,
              payment,
              now,
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
      .collection('pagos')
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
        const turnoRef = db.collection('turnos').doc(turnoId)
        const turnoSnap = await turnoRef.get()

        if (turnoSnap.exists) {
          const turno = turnoSnap.data() || {}
          const estadoTurnoActual =
            turno.estadoTurno ||
            turno.estado ||
            'pendiente'

          await turnoRef.update({
            estadoPago: 'expirado',
            metodoPagoEsperado: turno.metodoPagoEsperado || doc.data().metodo || 'mercadopago',
            metodoPagoUsado: turno.metodoPagoUsado || null,
            estadoTurno: ['cancelado', 'perdido', 'finalizado', 'pendiente_aprobacion'].includes(estadoTurnoActual)
              ? estadoTurnoActual
              : 'cancelado',
            venceEn: null,
            updatedAt: FieldValue.serverTimestamp(),
          })
        }
      }
    }
  }
)
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
const {
  getMpConnectionByUid,
  getMpConnectionByCollectorId,
  getActiveMpConnection,
} = require('./mp/oauthStore')

const { setAdminClaimHandler } = require('./setAdminClaim')

// ======================================================
// SECRETS
// ======================================================
const MP_ACCESS_TOKEN = defineSecret('MP_ACCESS_TOKEN')
const MP_COLLECTOR_ID = defineSecret('MP_COLLECTOR_ID')
const WHATSAPP_TOKEN = defineSecret('WHATSAPP_TOKEN')
const {
  enviarWhatsAppConfirmacionTurno,
} = require('./turnos/enviarWhatsAppConfirmacionTurno')

// ======================================================
// WEBHOOK MP
// ======================================================
exports.webhookMP =
  require('./mp/webhookMP').webhookMP;
exports.mpOAuthStart =
  require('./mp/oauthConnect').mpOAuthStart;
exports.mpOAuthStatus =
  require('./mp/oauthConnect').mpOAuthStatus;
exports.mpOAuthDisconnect =
  require('./mp/oauthConnect').mpOAuthDisconnect;
exports.mpOAuthCallback =
  require('./mp/oauthConnect').mpOAuthCallback;

  
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
exports.enviarRecordatorios24h =
  require("./turnos/enviarWhatsAppRecordatorio").enviarRecordatorios24h;
exports.limpiarTurnosExpirados =
  require("./turnos/limpiarTurnosExpirados").limpiarTurnosExpirados;

exports.getAgendaGabinete = getAgendaGabinete

exports.notificarAdminNuevoTurno = require("./turnos/notificarAdminNuevoTurno").notificarAdminNuevoTurno;
  // ======================================================
// ADMIN(CALLABLE)
// ======================================================

exports.confirmarPagoTurno = confirmarPagoTurno
exports.registrarPagoTurnoAdmin =
  require("./admin/registrarPagoTurnoAdmin").registrarPagoTurnoAdmin;
exports.crearLiquidacionAdmin =
  require("./admin/crearLiquidacionAdmin").crearLiquidacionAdmin;
exports.confirmarPagoManual =
  require("./callables/confirmarPagoManual").confirmarPagoManual;
exports.validarEmailVerificado =
  require("./callables/validarEmailVerificado").validarEmailVerificado;
exports.validarWhatsAppConfig =
  require("./callables/validarWhatsAppConfig").validarWhatsAppConfig;
exports.sincronizarGoogleReviewsAdmin =
  require("./callables/sincronizarGoogleReviewsAdmin").sincronizarGoogleReviewsAdmin;
exports.cancelarTurnoAdmin =
  require("./admin/cancelarTurnoAdmin").cancelarTurnoAdmin;
exports.marcarTurnoRealizadoAdmin =
  require("./admin/marcarTurnoRealizadoAdmin").marcarTurnoRealizadoAdmin;
exports.marcarTurnoAusenteAdmin =
  require("./admin/marcarTurnoAusenteAdmin").marcarTurnoAusenteAdmin;
exports.marcarTurnoReembolsadoAdmin =
  require("./admin/marcarTurnoReembolsadoAdmin").marcarTurnoReembolsadoAdmin;
exports.reprogramarTurnoAdmin =
  require("./admin/reprogramarTurnoAdmin").reprogramarTurnoAdmin;
exports.aprobarTurnoProfesional =
  require("./profesional/aprobarTurnoProfesional").aprobarTurnoProfesional;
exports.cancelarTurnoProfesional =
  require("./profesional/cancelarTurnoProfesional").cancelarTurnoProfesional;
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

exports.actualizarEmpleadoAdmin = onCall(async req => {
  const { actualizarEmpleadoAdminHandler } = require('./actualizarEmpleadoAdmin')
  return actualizarEmpleadoAdminHandler(req)
})

exports.quitarEmpleadoAdmin = onCall(async req => {
  const { quitarEmpleadoAdminHandler } = require('./quitarEmpleadoAdmin')
  return quitarEmpleadoAdminHandler(req)
})

exports.eliminarInvitacionEmpleadoAdmin = onCall(async req => {
  const { eliminarInvitacionEmpleadoAdminHandler } = require('./eliminarInvitacionEmpleadoAdmin')
  return eliminarInvitacionEmpleadoAdminHandler(req)
})

exports.listarInvitacionesEmpleadoAdmin = onCall(async req => {
  const { listarInvitacionesEmpleadoAdminHandler } = require('./listarInvitacionesEmpleadoAdmin')
  return listarInvitacionesEmpleadoAdminHandler(req)
})

exports.activarEmpleadoGoogle =
  require('./activarEmpleadoGoogle').activarEmpleadoGoogle



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

function uniqueTokenCandidates(candidates = []) {
  const out = []
  const seen = new Set()

  for (const item of candidates) {
    const token = String(item?.token || '').trim()
    if (!token || seen.has(token)) continue
    seen.add(token)
    out.push({
      token,
      source: item?.source || 'unknown',
      accountUid: item?.accountUid || null,
      collectorId: Number(item?.collectorId || 0) || null,
    })
  }

  return out
}

async function resolveTokenCandidateForPago({ db, pago, globalToken }) {
  const accountUid = String(pago?.mpAccountUid || '').trim()

  if (accountUid) {
    const conn = await getMpConnectionByUid(db, accountUid)
    if (conn?.accessToken) {
      return {
        token: conn.accessToken,
        source: 'oauth',
        accountUid: conn.uid,
        collectorId: Number(conn.mpUserId || 0) || null,
      }
    }
  }

  if (pago?.mpTokenSource === 'oauth') {
    const activeConn = await getActiveMpConnection(db)
    if (activeConn?.accessToken) {
      return {
        token: activeConn.accessToken,
        source: 'oauth_active',
        accountUid: activeConn.uid,
        collectorId: Number(activeConn.mpUserId || 0) || null,
      }
    }
  }

  const fallbackToken = String(globalToken || '').trim()
  if (!fallbackToken) return null

  return {
    token: fallbackToken,
    source: 'global',
    accountUid: null,
    collectorId: null,
  }
}

async function buildWebhookTokenCandidates({ db, data, globalToken }) {
  const candidates = []
  let hintedPago = null

  const hintedPagoId = String(data?.pagoId || '').trim()
  if (hintedPagoId) {
    const hintedPagoSnap = await db.collection('pagos').doc(hintedPagoId).get()
    if (hintedPagoSnap.exists) {
      hintedPago = {
        id: hintedPagoSnap.id,
        ...hintedPagoSnap.data(),
      }
      const tokenFromPago = await resolveTokenCandidateForPago({
        db,
        pago: hintedPago,
        globalToken,
      })
      if (tokenFromPago) candidates.push(tokenFromPago)
    }
  }

  const rawCollectorId =
    data?.raw?.user_id ||
    data?.raw?.userId ||
    data?.raw?.collector_id ||
    null

  if (rawCollectorId) {
    const connByCollector = await getMpConnectionByCollectorId(db, rawCollectorId)
    if (connByCollector?.accessToken) {
      candidates.push({
        token: connByCollector.accessToken,
        source: 'oauth_collector',
        accountUid: connByCollector.uid,
        collectorId: Number(connByCollector.mpUserId || 0) || null,
      })
    }
  }

  if (globalToken) {
    candidates.push({
      token: globalToken,
      source: 'global',
      accountUid: null,
      collectorId: null,
    })
  }

  return {
    candidates: uniqueTokenCandidates(candidates),
    hintedPago,
  }
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
    senaPagada: Math.min(
      Number(turno.senaRequerida ?? turno.montoAnticipo ?? 0),
      nuevoMontoPagado
    ),
    pagosCount: Number(turno.pagosCount || 0) + 1,
    ultimoPagoEn: now,

    pagoId: pago?.id || turno.pagoId || null,
    updatedAt: now,
  }

  if (estadoTurnoFinal === 'confirmado') {
    updateData.confirmadoAt = turno.confirmadoAt || now
    updateData.confirmadoEn = turno.confirmadoEn || now
  }

  await turnoRef.update(updateData)

  if (estadoTurnoFinal === 'confirmado') {
    try {
      await enviarWhatsAppConfirmacionTurno({
        db,
        turnoId,
        turnoData: {
          ...turno,
          ...updateData,
        },
      })
    } catch (error) {
      console.error('No se pudo enviar WhatsApp de confirmacion', error)
    }
  }
}

function getTurnoIdsFromPago(pago = {}) {
  const ids = Array.isArray(pago?.turnoIds)
    ? pago.turnoIds
    : pago?.turnoId
      ? [pago.turnoId]
      : []

  return [...new Set(ids.map(id => String(id || '').trim()).filter(Boolean))]
}

async function aplicarPagoAprobadoEnTurnos({
  db,
  pago,
  payment,
  now,
}) {
  const turnoIds = getTurnoIdsFromPago(pago)
  if (!turnoIds.length) return

  const montoPagoTotal = Number(
    payment?.transaction_amount ??
      pago?.monto ??
      0
  )

  if (turnoIds.length === 1) {
    await aplicarPagoAprobadoEnTurno({
      db,
      turnoId: turnoIds[0],
      pago: { ...pago, monto: montoPagoTotal },
      payment,
      now,
    })
    return
  }

  let montoRestante = Math.max(0, montoPagoTotal)
  const turnos = []

  for (const turnoId of turnoIds) {
    const turnoRef = db.collection('turnos').doc(turnoId)
    const turnoSnap = await turnoRef.get()
    if (!turnoSnap.exists) continue
    turnos.push({ id: turnoId, data: turnoSnap.data() || {} })
  }

  for (let i = 0; i < turnos.length; i += 1) {
    const turno = turnos[i]
    const montoObjetivo = Math.max(
      0,
      Number(turno?.data?.montoAnticipo ?? 0)
    )
    const montoPagoTurno =
      i === turnos.length - 1
        ? Math.max(0, montoRestante)
        : Math.max(0, Math.min(montoObjetivo, montoRestante))

    montoRestante = Math.max(0, montoRestante - montoPagoTurno)

    await aplicarPagoAprobadoEnTurno({
      db,
      turnoId: turno.id,
      pago: {
        ...pago,
        monto: montoPagoTurno,
      },
      payment,
      now,
    })
  }
}

// ======================================================
// WEBHOOK MERCADOPAGO (CORE)
// ======================================================
exports.processWebhookEvent = onDocumentWritten(
  {
    document: 'webhook_events/{id}',
    secrets: [MP_ACCESS_TOKEN, MP_COLLECTOR_ID, WHATSAPP_TOKEN],
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

      const tokenData = await buildWebhookTokenCandidates({
        db,
        data,
        globalToken: mpToken,
      })

      if (!tokenData.candidates.length) {
        throw new Error('mp_token_missing')
      }

      let payment = null
      let tokenUsed = null
      let lastTokenErr = null

      for (const candidate of tokenData.candidates) {
        try {
          payment = await mpGet(
            `https://api.mercadopago.com/v1/payments/${paymentId}`,
            candidate.token
          )
          tokenUsed = candidate
          break
        } catch (errToken) {
          lastTokenErr = errToken
        }
      }

      if (!payment) {
        throw new Error(
          `payment_lookup_failed: ${lastTokenErr?.message || 'sin_token_valido'}`
        )
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
      const expectedCollectorId = Number(
        pago?.mpCollectorIdExpected ||
        tokenData.hintedPago?.mpCollectorIdExpected ||
        0
      )

      if (expectedCollectorId && Number(payment.collector_id) !== expectedCollectorId) {
        throw new Error('collector_mismatch')
      }

      if (
        !expectedCollectorId &&
        collectorId &&
        tokenUsed?.source === 'global' &&
        Number(payment.collector_id) !== collectorId
      ) {
        throw new Error('collector_mismatch')
      }

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
        mpCollectorId: Number(payment.collector_id || 0) || null,
        mpTokenSource: pago.mpTokenSource || tokenUsed?.source || 'global',
        approvedAt: now,
        updatedAt: now,
      })

        await aplicarPagoAprobadoEnTurnos({
          db,
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
      mpCollectorId: Number(payment.collector_id || 0) || null,
      mpTokenSource: pago.mpTokenSource || tokenUsed?.source || 'global',
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
          mpCollectorId: Number(payment.collector_id || 0) || null,
          mpTokenSource: pago.mpTokenSource || tokenUsed?.source || 'global',
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
    secrets: [MP_ACCESS_TOKEN, WHATSAPP_TOKEN],
  },
  async () => {

    const admin = getAdmin()
    const db = admin.firestore()
    const globalToken = MP_ACCESS_TOKEN.value()
    if (!globalToken) return

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
        const tokenData = await resolveTokenCandidateForPago({
          db,
          pago,
          globalToken,
        })

        if (!tokenData?.token) {
          continue
        }

        const payment = await mpGet(
          `https://api.mercadopago.com/v1/payments/${pago.mpPaymentId}`,
          tokenData.token
        )

        const now = FieldValue.serverTimestamp()

        if (payment.status === 'approved') {

          if (pago.estado !== 'aprobado') {
            await pagoRef.update({
              estado: 'aprobado',
              mpStatus: payment.status,
              mpCollectorId: Number(payment.collector_id || 0) || null,
              mpTokenSource: pago.mpTokenSource || tokenData.source || 'global',
              approvedAt: now,
              updatedAt: now,
            })

            await aplicarPagoAprobadoEnTurnos({
              db,
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
            mpCollectorId: Number(payment.collector_id || 0) || null,
            mpTokenSource: pago.mpTokenSource || tokenData.source || 'global',
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

      const turnoIds = getTurnoIdsFromPago(doc.data() || {})

      for (const turnoId of turnoIds) {
        const turnoRef = db.collection('turnos').doc(turnoId)
        const turnoSnap = await turnoRef.get()

        if (!turnoSnap.exists) continue

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
)

exports.sincronizarGoogleReviewsProgramado =
  require("./google/sincronizarGoogleReviewsProgramado").sincronizarGoogleReviewsProgramado;

// --------------------------------------------------
// functions/turnos/getAgendaGabinete.js
// VERSION ADAPTADA A estadoTurno / estadoPago
// --------------------------------------------------
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { getAdmin } = require('../_lib/firebaseAdmin')

function normalizarEstadoTurno(turno = {}) {
  if (turno.estadoTurno) return turno.estadoTurno

  switch (turno.estado) {
    case 'pendiente_pago_mp':
      return 'pendiente'
    case 'pendiente_aprobacion':
      return 'pendiente_aprobacion'
    case 'señado':
      return 'confirmado'
    case 'confirmado':
      return 'confirmado'
    case 'cancelado':
      return 'cancelado'
    case 'perdido':
      return 'perdido'
    case 'finalizado':
      return 'finalizado'
    case 'rechazado':
      return 'rechazado'
    case 'expirado':
      return 'vencido'
    default:
      return 'pendiente'
  }
}

function normalizarEstadoPago(turno = {}) {
  if (turno.estadoPago) return turno.estadoPago

  switch (turno.estado) {
    case 'pendiente_pago_mp':
      return 'pendiente'
    case 'pendiente_aprobacion':
      return 'pendiente_aprobacion'
    case 'señado':
      return 'parcial'
    case 'confirmado':
      return 'abonado'
    case 'rechazado':
      return 'rechazado'
    case 'expirado':
      return 'expirado'
    default:
      return 'pendiente'
  }
}

function toISODateEnZona(date, timeZone = 'America/Argentina/Buenos_Aires') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const year = parts.find(p => p.type === 'year')?.value
  const month = parts.find(p => p.type === 'month')?.value
  const day = parts.find(p => p.type === 'day')?.value

  return `${year}-${month}-${day}`
}

function inicioDiaArgentinaMs(fechaISO) {
  return new Date(`${fechaISO}T00:00:00-03:00`).getTime()
}

function debeBloquearAgenda(turno, ahora) {
  const estadoTurno = normalizarEstadoTurno(turno)

  if (!['pendiente', 'pendiente_aprobacion', 'confirmado'].includes(estadoTurno)) {
    return false
  }

  if (
    estadoTurno !== 'confirmado' &&
    turno.venceEn &&
    Number(turno.venceEn) <= ahora
  ) {
    return false
  }

  return true
}

exports.getAgendaGabinete = onCall(
  { region: 'us-central1' },
  async request => {
    try {
      // if (!request.auth?.uid)
      //   throw new HttpsError('unauthenticated', 'No autenticado')

      const { gabineteIds, fecha, fechaDesde, fechaHasta } = request.data || {}

      if (!Array.isArray(gabineteIds)) {
        throw new HttpsError('invalid-argument', 'gabineteIds debe ser array')
      }

      const idsValidos = gabineteIds.filter(
        id => typeof id === 'string' && id.trim() !== ''
      )

      if (idsValidos.length === 0) {
        throw new HttpsError('invalid-argument', 'gabineteIds inválidos')
      }

      if (idsValidos.length > 10) {
        throw new HttpsError(
          'invalid-argument',
          'Máximo 10 gabinetes por consulta'
        )
      }

      const usaFechaUnica = typeof fecha === 'string' && fecha.trim() !== ''
      const usaRango =
        typeof fechaDesde === 'string' &&
        fechaDesde.trim() !== '' &&
        typeof fechaHasta === 'string' &&
        fechaHasta.trim() !== ''

      if (!usaFechaUnica && !usaRango) {
        throw new HttpsError(
          'invalid-argument',
          'Debes enviar fecha o fechaDesde + fechaHasta'
        )
      }

      const db = getAdmin().firestore()

      const horarios = []
      const bloqueos = []
      const turnos = []

      // --------------------------------------------------
      // 1️⃣ HORARIOS Y BLOQUEOS
      // --------------------------------------------------
      await Promise.all(
        idsValidos.map(async gabineteId => {
          const gabineteDoc = await db.collection('gabinetes').doc(gabineteId).get()
          if (!gabineteDoc.exists) return

          const gabineteData = gabineteDoc.data() || {}
          if (gabineteData.activo === false) return

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
              ...d.data(),
            })
          })

          const bloqueosSnap = await db
            .collection('gabinetes')
            .doc(gabineteId)
            .collection('bloqueos')
            .get()

          bloqueosSnap.forEach(d => {
            const b = d.data() || {}
            bloqueos.push({
              id: d.id,
              gabineteId,
              desde: b.desde?.toMillis?.() || null,
              hasta: b.hasta?.toMillis?.() || null,
              motivo: b.motivo || '',
            })
          })
        })
      )

      // --------------------------------------------------
      // 2️⃣ TURNOS
      // --------------------------------------------------
      let turnosQuery = db.collection('turnos')

      if (usaFechaUnica) {
        turnosQuery = turnosQuery.where('fecha', '==', fecha)
      } else {
        turnosQuery = turnosQuery
          .where('fecha', '>=', fechaDesde)
          .where('fecha', '<=', fechaHasta)
      }

      const turnosSnap = await turnosQuery.get()
      const idsSet = new Set(idsValidos)
      const ahora = Date.now()

      turnosSnap.forEach(d => {
        const t = d.data() || {}

        if (!idsSet.has(t.gabineteId)) {
          return
        }

        if (!debeBloquearAgenda(t, ahora)) {
          return
        }

        const estadoTurno = normalizarEstadoTurno(t)
        const estadoPago = normalizarEstadoPago(t)

        turnos.push({
          id: d.id,
          gabineteId: t.gabineteId,
          fecha: t.fecha || null,
          horaInicio: Number(t.horaInicio ?? null),
          horaFin: Number(t.horaFin ?? null),
          estadoTurno,
          estadoPago,
          estado: estadoTurno, // compatibilidad temporal con front viejo
          servicioId: t.servicioId || null,
          venceEn: t.venceEn || null,
        })
      })

      const hoyISO = toISODateEnZona(new Date())

      const incluyeHoy =
        (usaFechaUnica && fecha === hoyISO) ||
        (!usaFechaUnica && fechaDesde <= hoyISO && fechaHasta >= hoyISO)

      if (incluyeHoy) {
        const inicioHoyMs = inicioDiaArgentinaMs(hoyISO)

        idsValidos.forEach(gabineteId => {
          bloqueos.push({
            id: `pasado-${gabineteId}-${hoyISO}`,
            gabineteId,
            desde: inicioHoyMs,
            hasta: ahora,
            motivo: 'Horario pasado',
          })
        })
      }


      return { horarios, bloqueos, turnos }
      
    } catch (error) {
      console.error('❌ getAgendaGabinete error:', error)
      throw new HttpsError(
        'internal',
        error?.message || 'Error interno al cargar agenda'
      )
    }
  }
)
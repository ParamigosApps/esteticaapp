import { Resend } from 'resend'
import { getAdmin } from '../src/_lib/firebaseAdmin.js'
import { mailPedido } from '../src/services/mailTemplates.js'

const resend = new Resend(process.env.RESEND_API_KEY)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { pedidoId, to } = req.body || {}

    if (!pedidoId || !to) {
      return res.status(400).json({
        error: 'pedidoId y email son obligatorios',
      })
    }

    // 🔥 ADMIN SDK (ÚNICO)
    const admin = getAdmin()
    const db = admin.firestore()

    // --------------------------------------------------
    // LEER PEDIDO REAL
    // --------------------------------------------------
    const ref = db.collection('compras').doc(pedidoId)
    const snap = await ref.get()

    if (!snap.exists) {
      return res.status(404).json({ error: 'Pedido no encontrado' })
    }

    const pedido = snap.data()

    // --------------------------------------------------
    // SEGURIDAD: SOLO PEDIDOS PAGADOS
    // --------------------------------------------------
    if (pedido.estado !== 'pagado') {
      return res.status(403).json({
        error: 'Pedido no pagado',
      })
    }

    // --------------------------------------------------
    // IDEMPOTENCIA
    // --------------------------------------------------
    if (pedido.mailEnviado) {
      return res.status(200).json({
        ok: true,
        yaEnviado: true,
      })
    }

    // --------------------------------------------------
    // ENVIAR MAIL
    // --------------------------------------------------
    const result = await resend.emails.send({
      from: 'AppBar <onboarding@resend.dev>',
      to,
      subject: `Pedido #${pedido.numeroPedido}`,
      html: mailPedido({
        nombre: pedido.usuarioNombre || '',
        numeroPedido: pedido.numeroPedido,
        total: pedido.total,
        lugar: pedido.lugar,
        fecha: pedido.creadoEn?.toDate
          ? pedido.creadoEn.toDate().toLocaleString('es-AR')
          : new Date().toLocaleString('es-AR'),
        qrUrl: pedido.qrUrl,
        ticketId: pedido.ticketId,
      }),
    })

    // --------------------------------------------------
    // MARCAR MAIL COMO ENVIADO (ADMIN SDK)
    // --------------------------------------------------
    await ref.update({
      mailEnviado: true,
      mailEnviadoAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    return res.status(200).json({
      ok: true,
      enviado: true,
      result,
    })
  } catch (err) {
    console.error('❌ confirmar-pedido error:', err)

    return res.status(500).json({
      ok: false,
      error: err.message || 'Mail error',
    })
  }
}

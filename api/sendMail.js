import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

// 🔒 BLINDAJE TOTAL: headers SOLO ASCII
function asciiOnly(str = '') {
  return typeof str === 'string' ? str.replace(/[^\x00-\x7F]/g, '') : str
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { to, subject, html } = req.body

    if (!to || !subject || !html) {
      return res.status(400).json({ error: 'Missing fields' })
    }

    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY no configurada')
    }

    const data = await resend.emails.send({
      from: asciiOnly('AppBar <onboarding@resend.dev>'),
      to: asciiOnly(to),
      subject: asciiOnly(subject),
      html, // 👈 HTML SÍ puede tener emojis
    })

    return res.status(200).json({ ok: true, data })
  } catch (err) {
    console.error('SEND MAIL ERROR:', err)

    return res.status(500).json({
      ok: false,
      error: err.message || 'Mail error',
    })
  }
}

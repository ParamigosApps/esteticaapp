// --------------------------------------------------
// functions/mp/webhookMP.js
// --------------------------------------------------

const { onRequest } = require("firebase-functions/v2/https")
const { getAdmin } = require("../_lib/firebaseAdmin")
const { FieldValue } = require("firebase-admin/firestore")

exports.webhookMP = onRequest(
  {
    cors: true,
    region: "us-central1",
  },
  async (req, res) => {
    try {
      const admin = getAdmin()
      const db = admin.firestore()

      const body = req.body || {}

      const topic = body.type || body.topic || null

      // 🔑 Payment ID real (MP v1)
      let paymentId =
        body.data?.id ||
        body.payment_id ||
        null

      // 🔁 Fallback desde resource URL
      if (!paymentId && typeof body.resource === "string") {
        const match = body.resource.match(/\/(\d+)$/)
        if (match) paymentId = match[1]
      }

      // 🔑 External reference (nuestro pago_turnoId)
      const pagoId =
        body.data?.external_reference ||
        body.external_reference ||
        null

      await db.collection("webhook_events").add({
        raw: body,
        topic,
        paymentId,
        pagoId,
        creadoEn: FieldValue.serverTimestamp(),
        processed: false,
      })

      // ⚡ MP exige respuesta rápida
      return res.status(200).send("ok")

    } catch (err) {
      console.error("❌ webhookMP error", err)
      return res.status(500).send("error")
    }
  }
)
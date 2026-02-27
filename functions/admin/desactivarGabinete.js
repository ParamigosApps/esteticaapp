const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getAdmin } = require("../_lib/firebaseAdmin");

exports.desactivarGabinete = onCall(
  { region: "us-central1" },
  async (req) => {
    if (!req.auth?.uid)
      throw new HttpsError("unauthenticated", "No autenticado");

    const nivel = Number(req.auth.token?.nivel || 0);
    if (nivel < 3)
      throw new HttpsError("permission-denied", "Solo administradores");

    const { gabineteId } = req.data;
    if (!gabineteId)
      throw new HttpsError("invalid-argument", "Falta gabineteId");

    const admin = getAdmin();
    const db = admin.firestore();

    await db.collection("gabinetes").doc(gabineteId).update({
      activo: false,
      eliminadoEn: admin.firestore.FieldValue.serverTimestamp(),
      desactivadoPor: req.auth.uid,
    });

    return { ok: true };
  }
);
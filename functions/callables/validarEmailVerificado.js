// functions/callables/validarEmailVerificado.js
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getAdmin } = require("../_lib/firebaseAdmin");

exports.validarEmailVerificado = onCall({ region: "us-central1" }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "No autenticado");

  const admin = getAdmin();
  const user = await admin.auth().getUser(uid);

  if (!user.email) {
    throw new HttpsError("failed-precondition", "El usuario no tiene email");
  }

  if (!user.emailVerified) {
    throw new HttpsError("failed-precondition", "Email no verificado", {
      email: user.email,
      needsVerification: true,
    });
  }

  // ✅ Persistimos un claim propio (útil para Rules /admin, etc.)
  const prev = user.customClaims || {};
  const next = { ...prev, emailVerificado: true };

  // (opcional) si querés que sea explícito:
  // next.email = user.email; // NO recomendado por tamaño/privacidad

  await admin.auth().setCustomUserClaims(uid, next);

  return { ok: true, emailVerified: true };
});
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getAdmin } = require("../_lib/firebaseAdmin");

exports.eliminarServicio = onCall(
  { region: "us-central1" },
  async (req) => {
    if (!req.auth?.uid)
      throw new HttpsError("unauthenticated", "No autenticado");

    const nivel = Number(req.auth.token?.nivel || 0);
    if (nivel < 3)
      throw new HttpsError("permission-denied", "Solo administradores");

    const { servicioId } = req.data;
    if (!servicioId)
      throw new HttpsError("invalid-argument", "Falta servicioId");

    const admin = getAdmin();
    const db = admin.firestore();

    // Verificar que no tenga turnos (pasados ni futuros)
    const turnosSnap = await db
      .collection("turnos")
      .where("servicioId", "==", servicioId)
      .limit(1)
      .get();

    if (!turnosSnap.empty) {
      throw new HttpsError(
        "failed-precondition",
        "No se puede eliminar definitivamente: tiene historial de turnos"
      );
    }

    await db.collection("servicios").doc(servicioId).delete();

    return { ok: true };
  }
);
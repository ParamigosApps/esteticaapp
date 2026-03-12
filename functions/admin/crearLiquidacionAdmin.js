const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { FieldValue } = require("firebase-admin/firestore");
const { getAdmin } = require("../_lib/firebaseAdmin");
const { assertAdmin } = require("./adminTurnosShared");

function sumarPorClave(items, key) {
  return items.reduce((acc, item) => {
    const valor = String(item?.[key] || "sin_definir");
    acc[valor] = (acc[valor] || 0) + Number(item?.montoLiquidable ?? item?.monto ?? 0);
    return acc;
  }, {});
}

exports.crearLiquidacionAdmin = onCall(
  { region: "us-central1" },
  async (request) => {
    assertAdmin(request);

    const { pagoIds, notas = null } = request.data || {};

    if (!Array.isArray(pagoIds) || !pagoIds.length) {
      throw new HttpsError("invalid-argument", "pagoIds requerido");
    }

    const idsUnicos = [...new Set(pagoIds.map((id) => String(id || "").trim()).filter(Boolean))];
    if (!idsUnicos.length) {
      throw new HttpsError("invalid-argument", "pagoIds inválido");
    }

    const admin = getAdmin();
    const db = admin.firestore();

    const pagoRefs = idsUnicos.map((id) => db.collection("pagos").doc(id));
    const snaps = await db.getAll(...pagoRefs);

    const pagos = snaps.map((snap) => {
      if (!snap.exists) {
        throw new HttpsError("not-found", `Pago inexistente: ${snap.id}`);
      }
      return { id: snap.id, ...snap.data() };
    });

    const invalidos = pagos.filter(
      (p) => p.estado !== "aprobado" || p.liquidado === true,
    );

    if (invalidos.length) {
      throw new HttpsError(
        "failed-precondition",
        "Hay pagos que no están aprobados o ya fueron liquidados",
      );
    }

    const total = pagos.reduce((acc, pago) => acc + Number(pago.monto || 0), 0);
    const totalComisiones = pagos.reduce(
      (acc, pago) => acc + Number(pago.montoComision || 0),
      0,
    );
    const totalLiquidable = pagos.reduce(
      (acc, pago) =>
        acc + Number(pago.montoLiquidable ?? (Number(pago.monto || 0) - Number(pago.montoComision || 0))),
      0,
    );
    const totalPorMetodo = sumarPorClave(pagos, "metodo");
    const totalPorProfesional = sumarPorClave(pagos, "profesionalNombre");

    const liquidacionRef = db.collection("liquidaciones").doc();
    const liquidacionId = liquidacionRef.id;
    const batch = db.batch();

    batch.set(liquidacionRef, {
      estado: "cerrada",
      total,
      totalBruto: total,
      totalComisiones,
      totalLiquidable,
      cantidadPagos: pagos.length,
      pagosIds: idsUnicos,
      notas,
      totalPorMetodo,
      totalPorProfesional,
      creadaPorUid: request.auth.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    pagos.forEach((pago) => {
      batch.update(db.collection("pagos").doc(pago.id), {
        liquidado: true,
        liquidacionId,
        liquidadoEn: FieldValue.serverTimestamp(),
        liquidadoPorUid: request.auth.uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    await batch.commit();

    return {
      ok: true,
      liquidacionId,
      total,
      cantidadPagos: pagos.length,
    };
  },
);

//functions\turnos\crearTurnoInteligente.js
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getAdmin } = require("../_lib/firebaseAdmin");

const { FieldValue } = require("firebase-admin/firestore");


exports.crearTurnoInteligente = onCall(
  { region: "us-central1" },
  async (request) => {
    console.log("=== crearTurnoInteligente INPUT ===");
console.log("UID:", request.auth?.uid);
console.log("DATA:", JSON.stringify(request.data));
    if (!request.auth?.uid)
      throw new HttpsError("unauthenticated", "No autenticado");

    const {
      servicioId,
      nombreServicio,
      gabineteIds,
      fecha,
      horaInicio,
      horaFin,
      modoAsignacion,
    } = request.data || {};

    if (
  !servicioId ||
  !fecha ||
  horaInicio == null ||
  horaFin == null
) {
  throw new HttpsError("invalid-argument", "Datos incompletos");
}

    const db = getAdmin().firestore();

    if (!Array.isArray(gabineteIds))
      throw new HttpsError("invalid-argument", "gabineteIds debe ser array");

    const idsValidos = gabineteIds.filter(
      (id) => typeof id === "string" && id.trim() !== ""
    );

    if (!idsValidos.length)
      throw new HttpsError("invalid-argument", "gabineteIds inválidos");

    if (idsValidos.length > 10)
      throw new HttpsError("invalid-argument", "Máximo 10 gabinetes");

    // ============================================
// 🔎 CHEQUEAR MODO DE RESERVA REAL DEL SERVICIO
// ============================================

const servicioSnap = await db.collection("servicios").doc(servicioId).get();

if (!servicioSnap.exists) {
  throw new Error("Servicio no encontrado");
}

const servicio = servicioSnap.data();
const modoReserva = servicio.modoReserva || "automatico";

const pedirAnticipoServicio = Boolean(servicio.pedirAnticipo);
const tipoAnticipo = servicio.tipoAnticipo || "online"; // online | manual
const porcentajeAnticipo = Number(servicio.porcentajeAnticipo || 0);

    return await db.runTransaction(async (tx) => {

      const inicioNum = Number(horaInicio);
const finNum = Number(horaFin);

if (isNaN(inicioNum) || isNaN(finNum)) {
  throw new HttpsError("invalid-argument", "Horario inválido");
}

if (finNum <= inicioNum) {
  throw new HttpsError("invalid-argument", "Rango horario inválido");
}

    // 1️⃣ Traer gabinetes activos (SIN query IN dentro de transaction)
    const gabineteDocs = await Promise.all(
      idsValidos.map((id) => tx.get(db.collection("gabinetes").doc(id)))
    );

    const gabinetes = gabineteDocs
      .filter((snap) => snap.exists)
      .map((snap) => ({ id: snap.id, ...snap.data() }))
      .filter((g) => g.activo !== false);

    if (!gabinetes.length) {
      throw new HttpsError("failed-precondition", "Sin gabinetes activos");
    }
    console.log("Gabinetes válidos:", gabinetes.map(g => g.id));
     // 2️⃣ Traer turnos del día (sin IN dentro de transaction)
const turnosSnap = await tx.get(
  db.collection("turnos").where("fecha", "==", fecha)
);

const turnos = turnosSnap.docs
  .map((d) => d.data())
  .filter((t) =>
   [
  "pendiente_pago_mp",
  "pendiente_aprobacion",
  "confirmado"
].includes(
      t.estado
    )
  );

const ahora = Date.now();

const turnosActivos = turnos.filter((t) => {
  if (!t.venceEn) return true;
  return t.venceEn > ahora;
});

console.log("Turnos encontrados:", turnos.length);
console.log("Detalle turnos:", turnos);
console.log("Intentando reservar:", {
  fecha,
  horaInicio,
  horaFin
});
     
// ============================================
// 🔒 SERVICIO EXCLUSIVO POR HORARIO
// ============================================

const conflictoServicio = turnosActivos.some((t) =>
  t.servicioId === servicioId &&
  inicioNum < Number(t.horaFin) &&
  finNum > Number(t.horaInicio)
);

if (conflictoServicio) {
  throw new HttpsError("failed-precondition", "Horario ocupado");
}

const candidatos = gabinetes.filter((g) => {
  const solapado = turnosActivos.some((t) => {
    const conflicto =
      t.gabineteId === g.id &&
      inicioNum < Number(t.horaFin) &&
finNum > Number(t.horaInicio);

    if (conflicto) {
      console.log("⚠️ Conflicto detectado:", {
        gabinete: g.id,
        turnoExistente: t,
      });
    }

    return conflicto;
  });

  return !solapado;
});
console.log("Candidatos finales:", candidatos.map(g => g.id));
      if (!candidatos.length)
        throw new HttpsError("failed-precondition", "Horario ocupado");

      let gabineteElegido;

      if (modoAsignacion === "prioridad") {
        gabineteElegido = candidatos.sort(
          (a, b) => (a.prioridad ?? 999) - (b.prioridad ?? 999)
        )[0];
      } else {
        const carga = candidatos.map((g) => ({
          ...g,
          carga: turnosActivos.filter((t) => t.gabineteId === g.id).length,
        }));

        carga.sort((a, b) => {
          if (a.carga !== b.carga) return a.carga - b.carga;
          return (a.prioridad ?? 999) - (b.prioridad ?? 999);
        });

        gabineteElegido = carga[0];
      }

     // ============================================
// 📌 SI EL SERVICIO ES PENDIENTE → CREAR SOLICITUD
// ============================================

let estadoInicial;
let venceTurno = null;
let montoAnticipoCalculado = 0;

if (modoReserva === "reserva") {

  estadoInicial = "pendiente_aprobacion";
  venceTurno = Date.now() + 24 * 60 * 60 * 1000;

} else {

  // automático
  if (pedirAnticipoServicio && tipoAnticipo === "online") {

    montoAnticipoCalculado =
      (Number(servicio.precio || 0) * porcentajeAnticipo) / 100;

    estadoInicial = "pendiente_pago_mp";
    venceTurno = Date.now() + 60 * 60 * 1000;

  } else {

    estadoInicial = "confirmado";

  }
}

const ref = db.collection("turnos").doc();

    tx.set(ref, {
      servicioId,
      nombreServicio,
      clienteId: request.auth.uid,
      gabineteId: gabineteElegido.id,
      fecha,
      horaInicio: inicioNum,
    horaFin: finNum,
      estado: estadoInicial,
      tipoAnticipo: tipoAnticipo,
      pedirAnticipo: montoAnticipoCalculado > 0,
      montoAnticipo: montoAnticipoCalculado,
      precioTotal: Number(servicio.precio || 0),
      creadoEn: FieldValue.serverTimestamp(),
      venceEn: venceTurno,
    });

      return {
        ok: true,
        turnoId: ref.id,
        gabineteAsignado: gabineteElegido.id,
        estadoInicial,
        venceEn: venceTurno,
      };
    });
  }
);
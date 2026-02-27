const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getAdmin } = require("../_lib/firebaseAdmin");

exports.crearTurnoInteligente = onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth?.uid)
      throw new HttpsError("unauthenticated", "No autenticado");

    const {
      servicioId,
      servicioNombre,
      gabineteIds,
      fecha,
      horaInicio,
      horaFin,
      modoAsignacion,
      requiereSena,
      montoSena,
      precioTotal,
    } = request.data || {};

    const db = getAdmin().firestore();
    const now = Date.now();
    const venceEn = requiereSena ? now + 10 * 60 * 1000 : null;

    if (!Array.isArray(gabineteIds))
      throw new HttpsError("invalid-argument", "gabineteIds debe ser array");

    const idsValidos = gabineteIds.filter(
      (id) => typeof id === "string" && id.trim() !== ""
    );

    if (!idsValidos.length)
      throw new HttpsError("invalid-argument", "gabineteIds inválidos");

    if (idsValidos.length > 10)
      throw new HttpsError("invalid-argument", "Máximo 10 gabinetes");

    return await db.runTransaction(async (tx) => {

      // 1️⃣ Traer gabinetes activos
      const gabinetesSnap = await tx.get(
        db.collection("gabinetes").where("__name__", "in", idsValidos)
      );

      const gabinetes = gabinetesSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((g) => g.activo !== false);

      if (!gabinetes.length)
        throw new HttpsError("failed-precondition", "Sin gabinetes activos");

      // 2️⃣ Traer turnos activos del día
      const turnosSnap = await tx.get(
        db.collection("turnos")
          .where("fecha", "==", fecha)
          .where("estado", "in", [
            "pendiente_pago",
            "pendiente_aprobacion",
            "confirmado",
          ])
      );

      const turnos = turnosSnap.docs.map((d) => d.data());

      // 3️⃣ Filtrar gabinetes disponibles
      const candidatos = gabinetes.filter((g) => {
        const solapado = turnos.some(
          (t) =>
            t.gabineteId === g.id &&
            horaInicio < t.horaFin &&
            horaFin > t.horaInicio
        );
        return !solapado;
      });

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
          carga: turnos.filter((t) => t.gabineteId === g.id).length,
        }));

        carga.sort((a, b) => {
          if (a.carga !== b.carga) return a.carga - b.carga;
          return (a.prioridad ?? 999) - (b.prioridad ?? 999);
        });

        gabineteElegido = carga[0];
      }

      // 4️⃣ Crear turno preliminar
      const ref = db.collection("turnos").doc();

      tx.set(ref, {
        servicioId,
        servicioNombre,
        clienteId: request.auth.uid,
        gabineteId: gabineteElegido.id,
        fecha,
        horaInicio,
        horaFin,
        estado: requiereSena ? "pendiente_pago" : "confirmado",
        requiereSena: Boolean(requiereSena),
        montoSena: Number(montoSena || 0),
        precioTotal: Number(precioTotal || 0),
        creadoEn: now,
        venceEn,
      });

      return {
        ok: true,
        turnoId: ref.id,
        gabineteAsignado: gabineteElegido.id,
        estadoInicial: requiereSena ? "pendiente_pago" : "confirmado",
        venceEn,
      };
    });
  }
);
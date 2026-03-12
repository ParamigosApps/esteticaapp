const { HttpsError } = require("firebase-functions/v2/https");
const { getAdmin } = require("../_lib/firebaseAdmin");

function normalizarTexto(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function resolveEstadoTurno(turno = {}) {
  if (turno.estadoTurno) return turno.estadoTurno;
  return turno.estado || "pendiente";
}

async function resolverProfesionalDesdeRequest(request) {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "No autenticado");
  }

  const nivel = Number(request.auth?.token?.nivel || 0);
  if (nivel < 1) {
    throw new HttpsError("permission-denied", "Solo personal autorizado");
  }

  const admin = getAdmin();
  const db = admin.firestore();
  const userSnap = await db.collection("usuarios").doc(request.auth.uid).get();

  if (!userSnap.exists) {
    throw new HttpsError("failed-precondition", "Perfil de usuario inexistente");
  }

  const perfil = userSnap.data() || {};

  return {
    uid: request.auth.uid,
    nivel,
    esAdmin: Boolean(request.auth?.token?.admin) || nivel >= 3,
    nombre: perfil.nombre || "",
    email: perfil.email || request.auth.token.email || "",
  };
}

function validarAccesoProfesionalATurno(turno, profesional) {
  if (profesional.esAdmin) return true;

  if ((turno?.responsableGestion || "profesional") !== "profesional") {
    return false;
  }

  if (turno?.profesionalId && profesional?.uid) {
    return String(turno.profesionalId) === String(profesional.uid);
  }

  const nombreTurno = normalizarTexto(turno?.profesionalNombre);
  const candidatos = [
    profesional.nombre,
    profesional.email,
    requestDisplayNameFallback(profesional),
  ]
    .map(normalizarTexto)
    .filter(Boolean);

  return Boolean(nombreTurno) && candidatos.includes(nombreTurno);
}

function requestDisplayNameFallback(profesional) {
  return profesional.nombre || profesional.email || "";
}

module.exports = {
  normalizarTexto,
  resolveEstadoTurno,
  resolverProfesionalDesdeRequest,
  validarAccesoProfesionalATurno,
};

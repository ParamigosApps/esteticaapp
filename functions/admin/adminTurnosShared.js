const { HttpsError } = require("firebase-functions/v2/https");

function assertAdmin(request) {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "No autenticado");
  }

  const nivel = Number(request.auth?.token?.nivel || 0);
  const esAdmin = Boolean(request.auth?.token?.admin) || nivel >= 3;

  if (!esAdmin) {
    throw new HttpsError("permission-denied", "Solo admin");
  }
}

function assertOwnerAdmin(request) {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "No autenticado");
  }

  const nivel = Number(request.auth?.token?.nivel || 0);

  if (nivel !== 4) {
    throw new HttpsError("permission-denied", "Solo el dueño puede realizar esta acción");
  }
}

function resolveEstadoTurno(turno = {}) {
  if (turno.estadoTurno) return turno.estadoTurno;
  return turno.estado || "pendiente";
}

function extraerGabineteIdsDesdeServicio(servicio) {
  const raw = Array.isArray(servicio?.gabinetes) ? servicio.gabinetes : [];

  return raw
    .map((g) => {
      if (typeof g === "string") return g.trim();
      if (g && typeof g === "object") {
        return String(g.id || g.gabineteId || "").trim();
      }
      return "";
    })
    .filter(Boolean);
}

module.exports = {
  assertAdmin,
  assertOwnerAdmin,
  resolveEstadoTurno,
  extraerGabineteIdsDesdeServicio,
};

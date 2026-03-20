const { FieldValue } = require("firebase-admin/firestore");

const OAUTH_CONNECTIONS_COLLECTION = "mp_oauth_connections";
const OAUTH_COLLECTORS_COLLECTION = "mp_oauth_collectors";
const OAUTH_CONFIG_DOC = "mercadopago_oauth";

function normalizeUid(uid) {
  const value = String(uid || "").trim();
  return value || null;
}

function normalizeCollectorId(id) {
  const value = Number(id || 0);
  return Number.isFinite(value) && value > 0 ? String(value) : null;
}

function sanitizeConnection(uid, data = {}) {
  const accessToken = String(data.accessToken || "").trim();
  if (!uid || !accessToken) return null;

  return {
    uid,
    accessToken,
    refreshToken: String(data.refreshToken || "").trim() || null,
    mpUserId: Number(data.mpUserId || 0) || null,
    mpNickname: String(data.mpNickname || "").trim() || null,
    scope: String(data.scope || "").trim() || null,
    connected: data.connected !== false,
    updatedAt: data.updatedAt || null,
    connectedAt: data.connectedAt || null,
  };
}

async function getMpConnectionByUid(db, uid) {
  const normalizedUid = normalizeUid(uid);
  if (!normalizedUid) return null;

  const snap = await db
    .collection(OAUTH_CONNECTIONS_COLLECTION)
    .doc(normalizedUid)
    .get();

  if (!snap.exists) return null;
  return sanitizeConnection(normalizedUid, snap.data() || {});
}

async function getMpConnectionByCollectorId(db, collectorId) {
  const normalizedCollectorId = normalizeCollectorId(collectorId);
  if (!normalizedCollectorId) return null;

  const mapSnap = await db
    .collection(OAUTH_COLLECTORS_COLLECTION)
    .doc(normalizedCollectorId)
    .get();

  if (!mapSnap.exists) return null;

  const mapData = mapSnap.data() || {};
  const uid = normalizeUid(mapData.uid);
  if (!uid) return null;

  return getMpConnectionByUid(db, uid);
}

async function getActiveMpConnection(db) {
  const configSnap = await db
    .collection("configuracion")
    .doc(OAUTH_CONFIG_DOC)
    .get();

  if (!configSnap.exists) return null;

  const config = configSnap.data() || {};
  const activeUid = normalizeUid(config.activeUid);
  if (!activeUid) return null;

  return getMpConnectionByUid(db, activeUid);
}

async function saveMpConnection({
  db,
  uid,
  accessToken,
  refreshToken,
  mpUserId,
  mpNickname,
  scope,
}) {
  const normalizedUid = normalizeUid(uid);
  const normalizedCollectorId = normalizeCollectorId(mpUserId);
  if (!normalizedUid) {
    throw new Error("oauth_uid_missing");
  }

  const now = FieldValue.serverTimestamp();

  await db
    .collection(OAUTH_CONNECTIONS_COLLECTION)
    .doc(normalizedUid)
    .set(
      {
        uid: normalizedUid,
        connected: true,
        accessToken: String(accessToken || "").trim(),
        refreshToken: String(refreshToken || "").trim() || null,
        mpUserId: normalizedCollectorId ? Number(normalizedCollectorId) : null,
        mpNickname: String(mpNickname || "").trim() || null,
        scope: String(scope || "").trim() || null,
        updatedAt: now,
        connectedAt: now,
      },
      { merge: true },
    );

  await db
    .collection("configuracion")
    .doc(OAUTH_CONFIG_DOC)
    .set(
      {
        activeUid: normalizedUid,
        connected: true,
        mpUserId: normalizedCollectorId ? Number(normalizedCollectorId) : null,
        updatedAt: now,
        connectedAt: now,
      },
      { merge: true },
    );

  if (normalizedCollectorId) {
    await db
      .collection(OAUTH_COLLECTORS_COLLECTION)
      .doc(normalizedCollectorId)
      .set(
        {
          uid: normalizedUid,
          mpUserId: Number(normalizedCollectorId),
          updatedAt: now,
        },
        { merge: true },
      );
  }
}

async function clearMpConnectionByUid({ db, uid }) {
  const normalizedUid = normalizeUid(uid);
  if (!normalizedUid) return { disconnected: false };

  const connRef = db.collection(OAUTH_CONNECTIONS_COLLECTION).doc(normalizedUid);
  const connSnap = await connRef.get();
  const connData = connSnap.exists ? connSnap.data() || {} : {};
  const collectorId = normalizeCollectorId(connData.mpUserId);
  const now = FieldValue.serverTimestamp();

  await connRef.set(
    {
      uid: normalizedUid,
      connected: false,
      accessToken: null,
      refreshToken: null,
      scope: null,
      disconnectedAt: now,
      updatedAt: now,
    },
    { merge: true },
  );

  if (collectorId) {
    await db.collection(OAUTH_COLLECTORS_COLLECTION).doc(collectorId).delete();
  }

  const configRef = db.collection("configuracion").doc(OAUTH_CONFIG_DOC);
  const configSnap = await configRef.get();
  const config = configSnap.exists ? configSnap.data() || {} : {};
  if (normalizeUid(config.activeUid) === normalizedUid) {
    await configRef.set(
      {
        activeUid: null,
        connected: false,
        mpUserId: null,
        disconnectedAt: now,
        updatedAt: now,
      },
      { merge: true },
    );
  }

  return { disconnected: true };
}

module.exports = {
  OAUTH_CONNECTIONS_COLLECTION,
  OAUTH_COLLECTORS_COLLECTION,
  OAUTH_CONFIG_DOC,
  getMpConnectionByUid,
  getMpConnectionByCollectorId,
  getActiveMpConnection,
  saveMpConnection,
  clearMpConnectionByUid,
};

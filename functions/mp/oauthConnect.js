const crypto = require("crypto");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { getAdmin } = require("../_lib/firebaseAdmin");
const { FieldValue } = require("firebase-admin/firestore");
const { assertOwnerAdmin } = require("../admin/adminTurnosShared");
const {
  saveMpConnection,
  getMpConnectionByUid,
  clearMpConnectionByUid,
} = require("./oauthStore");

const fetch = global.fetch ?? require("node-fetch");

const MP_OAUTH_CLIENT_ID = defineSecret("MP_OAUTH_CLIENT_ID");
const MP_OAUTH_CLIENT_SECRET = defineSecret("MP_OAUTH_CLIENT_SECRET");
const MP_OAUTH_REDIRECT_URI = defineSecret("MP_OAUTH_REDIRECT_URI");
const FRONT_URL = defineSecret("FRONT_URL");

function sanitizeUrl(url) {
  const value = String(url || "").trim();
  if (!/^https?:\/\//i.test(value)) return "";
  return value.replace(/\/$/, "");
}

function makeState() {
  return crypto.randomBytes(24).toString("hex");
}

function buildAuthUrl({ clientId, redirectUri, state }) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: String(clientId || "").trim(),
    redirect_uri: redirectUri,
    state,
  });

  return `https://auth.mercadopago.com/authorization?${params.toString()}`;
}

function mapOauthTokenError(data = {}, raw = "", status = 0) {
  const message = String(data?.message || "").toLowerCase();
  const error = String(data?.error || "").toLowerCase();
  const description = String(data?.error_description || "").toLowerCase();
  const rawText = String(raw || "").toLowerCase();
  const joined = [message, error, description, rawText].join(" | ");

  if (
    status === 401 ||
    joined.includes("invalid client_id or client_secret") ||
    joined.includes("invalid_client")
  ) {
    return "invalid_client_credentials (revisa MP_OAUTH_CLIENT_ID y MP_OAUTH_CLIENT_SECRET de la misma app)";
  }

  if (joined.includes("redirect_uri") || joined.includes("redirect uri")) {
    return "redirect_uri_mismatch (la redirect_uri debe coincidir exacta entre MP, secret y request)";
  }

  if (
    joined.includes("invalid_grant") ||
    joined.includes("code") ||
    joined.includes("authorization code")
  ) {
    return "invalid_or_expired_code (reintenta la conexion OAuth desde el inicio)";
  }

  return data?.message || data?.error_description || raw || status || "unknown_error";
}

async function exchangeCodeForToken({
  clientId,
  clientSecret,
  redirectUri,
  code,
}) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: String(clientId || "").trim(),
    client_secret: String(clientSecret || "").trim(),
    code: String(code || "").trim(),
    redirect_uri: redirectUri,
  });

  const response = await fetch("https://api.mercadopago.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const raw = await response.text();
  let data = {};
  try {
    data = JSON.parse(raw);
  } catch {
    data = { raw };
  }

  if (!response.ok) {
    const reason = mapOauthTokenError(data, raw, response.status);
    throw new Error(
      `oauth_token_exchange_failed: ${reason}`,
    );
  }

  return data;
}

async function getMpUserProfile(accessToken) {
  const response = await fetch("https://api.mercadopago.com/users/me", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const raw = await response.text();
  let data = {};
  try {
    data = JSON.parse(raw);
  } catch {
    data = { raw };
  }

  if (!response.ok) {
    throw new Error(
      `oauth_user_profile_failed: ${data?.message || raw || response.status}`,
    );
  }

  return data;
}

exports.mpOAuthStart = onCall(
  {
    region: "us-central1",
    secrets: [MP_OAUTH_CLIENT_ID, MP_OAUTH_REDIRECT_URI],
  },
  async (request) => {
    assertOwnerAdmin(request);

    const clientId = MP_OAUTH_CLIENT_ID.value();
    const redirectUri = sanitizeUrl(MP_OAUTH_REDIRECT_URI.value());

    if (!clientId || !redirectUri) {
      throw new HttpsError("failed-precondition", "OAuth no configurado en backend");
    }

    const uid = request.auth.uid;
    const state = makeState();
    const db = getAdmin().firestore();

    await db.collection("mp_oauth_states").doc(state).set({
      uid,
      createdAt: FieldValue.serverTimestamp(),
      createdAtMs: Date.now(),
      used: false,
    });

    const authUrl = buildAuthUrl({
      clientId,
      redirectUri,
      state,
    });

    return {
      ok: true,
      url: authUrl,
      state,
      redirectUri,
    };
  },
);

exports.mpOAuthStatus = onCall(
  {
    region: "us-central1",
  },
  async (request) => {
    assertOwnerAdmin(request);

    const db = getAdmin().firestore();
    const uid = request.auth.uid;
    const connection = await getMpConnectionByUid(db, uid);

    return {
      ok: true,
      connected: Boolean(connection?.accessToken),
      account: connection
        ? {
            uid: connection.uid,
            mpUserId: connection.mpUserId || null,
            mpNickname: connection.mpNickname || null,
            scope: connection.scope || null,
            updatedAt: connection.updatedAt || null,
            connectedAt: connection.connectedAt || null,
          }
        : null,
    };
  },
);

exports.mpOAuthDisconnect = onCall(
  {
    region: "us-central1",
  },
  async (request) => {
    assertOwnerAdmin(request);
    const db = getAdmin().firestore();
    const uid = request.auth.uid;
    const result = await clearMpConnectionByUid({ db, uid });

    return {
      ok: true,
      disconnected: Boolean(result?.disconnected),
    };
  },
);

exports.mpOAuthCallback = onRequest(
  {
    region: "us-central1",
    secrets: [
      MP_OAUTH_CLIENT_ID,
      MP_OAUTH_CLIENT_SECRET,
      MP_OAUTH_REDIRECT_URI,
      FRONT_URL,
    ],
  },
  async (req, res) => {
    const db = getAdmin().firestore();
    const frontBase = sanitizeUrl(FRONT_URL.value());

    const done = (status, error = "") => {
      if (!frontBase) {
        return res
          .status(200)
          .send(`mp_oauth=${status}${error ? `&reason=${error}` : ""}`);
      }

      const base = frontBase;
      const qs = new URLSearchParams({
        mp_oauth: status,
      });
      if (error) {
        qs.set("reason", String(error).slice(0, 120));
      }
      return res.redirect(`${base}/admin/configuracion?${qs.toString()}`);
    };

    try {
      const code = String(req.query?.code || "").trim();
      const state = String(req.query?.state || "").trim();
      const error = String(req.query?.error || "").trim();

      if (error) {
        return done("error", error);
      }

      if (!code || !state) {
        return done("error", "missing_code_or_state");
      }

      const stateRef = db.collection("mp_oauth_states").doc(state);
      const stateSnap = await stateRef.get();
      if (!stateSnap.exists) {
        return done("error", "invalid_state");
      }

      const stateData = stateSnap.data() || {};
      const uid = String(stateData.uid || "").trim();
      const createdAtMs = Number(stateData.createdAtMs || 0);
      const expired = !createdAtMs || Date.now() - createdAtMs > 15 * 60 * 1000;

      if (!uid || stateData.used === true || expired) {
        await stateRef.set(
          {
            used: true,
            usedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        return done("error", expired ? "state_expired" : "state_invalid");
      }

      const clientId = MP_OAUTH_CLIENT_ID.value();
      const clientSecret = MP_OAUTH_CLIENT_SECRET.value();
      const redirectUri = sanitizeUrl(MP_OAUTH_REDIRECT_URI.value());

      if (!clientId || !clientSecret || !redirectUri) {
        return done("error", "oauth_backend_not_configured");
      }

      const tokenData = await exchangeCodeForToken({
        clientId,
        clientSecret,
        redirectUri,
        code,
      });

      const accessToken = String(tokenData.access_token || "").trim();
      const refreshToken = String(tokenData.refresh_token || "").trim();
      const scope = String(tokenData.scope || "").trim();

      if (!accessToken) {
        throw new Error("missing_access_token");
      }

      const userProfile = await getMpUserProfile(accessToken);

      await saveMpConnection({
        db,
        uid,
        accessToken,
        refreshToken,
        scope,
        mpUserId: Number(userProfile?.id || 0) || null,
        mpNickname: String(userProfile?.nickname || "").trim() || null,
      });

      await stateRef.set(
        {
          used: true,
          usedAt: FieldValue.serverTimestamp(),
          uid,
        },
        { merge: true },
      );

      return done("ok");
    } catch (err) {
      console.error("mpOAuthCallback error", err);
      return done("error", err?.message || "unexpected_error");
    }
  },
);

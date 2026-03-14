const { defineSecret } = require("firebase-functions/params");
const fetch = global.fetch ?? require("node-fetch");
const { getAdmin } = require("../_lib/firebaseAdmin");

const GOOGLE_PLACES_API_KEY = defineSecret("GOOGLE_PLACES_API_KEY");
const GOOGLE_PLACES_FIELDS = [
  "displayName",
  "rating",
  "userRatingCount",
  "reviews",
].join(",");

function toCleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizarReview(review = {}) {
  const autor = toCleanString(review?.authorAttribution?.displayName) || "Cliente";
  const fecha =
    toCleanString(review?.relativePublishTimeDescription) ||
    toCleanString(review?.publishTime) ||
    "Google";
  const texto =
    toCleanString(review?.text?.text) ||
    toCleanString(review?.originalText?.text) ||
    "";
  const rating = Number(review?.rating || 0);

  return {
    autor,
    fecha,
    texto,
    rating: Number.isFinite(rating) ? rating : 0,
  };
}

async function fetchGooglePlaceReviews({ placeId, apiKey }) {
  const normalizedPlaceId = toCleanString(placeId);
  const normalizedApiKey = toCleanString(apiKey);

  if (!normalizedPlaceId) {
    throw new Error("Falta el Google Place ID");
  }

  if (!normalizedApiKey) {
    throw new Error("Falta configurar GOOGLE_PLACES_API_KEY");
  }

  const endpoint = `https://places.googleapis.com/v1/places/${encodeURIComponent(normalizedPlaceId)}?fields=${encodeURIComponent(GOOGLE_PLACES_FIELDS)}&languageCode=es-AR`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": normalizedApiKey,
      "X-Goog-FieldMask": GOOGLE_PLACES_FIELDS,
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Google Places respondio ${response.status}${detail ? `: ${detail}` : ""}`);
  }

  const data = await response.json();
  const reviewsRaw = Array.isArray(data?.reviews) ? data.reviews : [];
  const reviews = reviewsRaw
    .map(normalizarReview)
    .filter((item) => item.texto)
    .slice(0, 6);

  return {
    nombreLugar: toCleanString(data?.displayName?.text),
    promedio: Number(data?.rating || 0),
    total: Number(data?.userRatingCount || 0),
    reviews,
  };
}

async function sincronizarGoogleReviewsDesdeConfig() {
  const admin = getAdmin();
  const db = admin.firestore();
  const configRef = db.collection("configuracion").doc("homeVisuales");
  const snap = await configRef.get();

  if (!snap.exists) {
    throw new Error("No existe la configuracion homeVisuales");
  }

  const config = snap.data() || {};
  const placeId = toCleanString(config.googlePlaceId);

  if (!placeId) {
    throw new Error("Falta configurar el Google Place ID");
  }

  const payload = await fetchGooglePlaceReviews({
    placeId,
    apiKey: GOOGLE_PLACES_API_KEY.value(),
  });

  const updatedAt = admin.firestore.FieldValue.serverTimestamp();
  const next = {
    googleReviewsRating: payload.promedio,
    googleReviewsTotal: payload.total,
    googleReviewsItems: payload.reviews,
    googleReviewsPlaceName: payload.nombreLugar,
    googleReviewsSource: "google_places",
    googleReviewsSyncError: "",
    googleReviewsUpdatedAt: updatedAt,
  };

  await configRef.set(next, { merge: true });

  return {
    ...next,
    googleReviewsUpdatedAt: new Date().toISOString(),
  };
}

async function registrarErrorGoogleReviews(error) {
  const admin = getAdmin();
  const db = admin.firestore();

  await db.collection("configuracion").doc("homeVisuales").set(
    {
      googleReviewsSyncError: toCleanString(error?.message) || "No se pudo sincronizar Google Reviews",
      googleReviewsUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

module.exports = {
  GOOGLE_PLACES_API_KEY,
  sincronizarGoogleReviewsDesdeConfig,
  registrarErrorGoogleReviews,
};

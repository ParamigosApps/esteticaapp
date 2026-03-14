const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { assertOwnerAdmin } = require("../admin/adminTurnosShared");
const {
  GOOGLE_PLACES_API_KEY,
  registrarErrorGoogleReviews,
  sincronizarGoogleReviewsDesdeConfig,
} = require("../google/googleReviewsShared");

exports.sincronizarGoogleReviewsAdmin = onCall(
  {
    region: "us-central1",
    secrets: [GOOGLE_PLACES_API_KEY],
  },
  async (request) => {
    assertOwnerAdmin(request);

    try {
      const data = await sincronizarGoogleReviewsDesdeConfig();
      return {
        ok: true,
        ...data,
      };
    } catch (error) {
      await registrarErrorGoogleReviews(error);
      throw new HttpsError(
        "failed-precondition",
        error?.message || "No se pudieron sincronizar las reseñas de Google",
      );
    }
  },
);

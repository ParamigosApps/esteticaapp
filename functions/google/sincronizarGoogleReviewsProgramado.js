const { onSchedule } = require("firebase-functions/v2/scheduler");
const {
  GOOGLE_PLACES_API_KEY,
  registrarErrorGoogleReviews,
  sincronizarGoogleReviewsDesdeConfig,
} = require("./googleReviewsShared");

exports.sincronizarGoogleReviewsProgramado = onSchedule(
  {
    schedule: "every 12 hours",
    timeZone: "America/Argentina/Buenos_Aires",
    region: "us-central1",
    secrets: [GOOGLE_PLACES_API_KEY],
  },
  async () => {
    try {
      await sincronizarGoogleReviewsDesdeConfig();
    } catch (error) {
      console.error("Error sincronizando Google Reviews", error);
      await registrarErrorGoogleReviews(error);
    }
  },
);

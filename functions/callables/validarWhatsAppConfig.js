const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { assertOwnerAdmin } = require("../admin/adminTurnosShared");
const { WHATSAPP_TOKEN, validarWhatsAppConfig } = require("../turnos/whatsapp");

exports.validarWhatsAppConfig = onCall(
  {
    region: "us-central1",
    secrets: [WHATSAPP_TOKEN],
  },
  async (request) => {
    assertOwnerAdmin(request);

    const { phoneNumberId } = request.data || {};

    try {
      const data = await validarWhatsAppConfig({ phoneNumberId });

      return {
        ok: true,
        status: "ok",
        displayPhoneNumber: data?.display_phone_number || "",
        verifiedName: data?.verified_name || "",
        phoneNumberId: data?.id || "",
      };
    } catch (error) {
      throw new HttpsError(
        "failed-precondition",
        error?.message || "No se pudo validar la configuracion de WhatsApp",
      );
    }
  },
);

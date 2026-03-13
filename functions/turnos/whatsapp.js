const { defineSecret } = require("firebase-functions/params");

const fetch = global.fetch;

const WHATSAPP_TOKEN = defineSecret("WHATSAPP_TOKEN");

function sanitizeDigits(value) {
  return String(value || "").replace(/\D+/g, "");
}

function normalizarTelefonoWhatsApp(value, defaultCountryCode = "54") {
  const digits = sanitizeDigits(value);
  const countryCode = sanitizeDigits(defaultCountryCode) || "54";

  if (!digits) return "";

  if (digits.startsWith(countryCode)) {
    return digits;
  }

  if (digits.startsWith("0")) {
    return `${countryCode}${digits.slice(1)}`;
  }

  return `${countryCode}${digits}`;
}

function buildTemplateComponents(bodyParameters = []) {
  const safeParameters = bodyParameters
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .map((text) => ({ type: "text", text }));

  if (!safeParameters.length) return undefined;

  return [
    {
      type: "body",
      parameters: safeParameters,
    },
  ];
}

async function enviarWhatsApp({
  telefono,
  texto,
  phoneNumberId,
  templateName = "",
  languageCode = "es_AR",
  bodyParameters = [],
  countryCode = "54",
}) {
  const token = WHATSAPP_TOKEN.value();
  const to = normalizarTelefonoWhatsApp(telefono, countryCode);
  const fromPhoneNumberId = sanitizeDigits(phoneNumberId);

  if (!token) {
    throw new Error("WHATSAPP_TOKEN no configurado");
  }

  if (!fromPhoneNumberId) {
    throw new Error("whatsappPhoneNumberId no configurado");
  }

  if (!to) {
    throw new Error("telefono invalido para WhatsApp");
  }

  const useTemplate = String(templateName || "").trim().length > 0;
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: useTemplate ? "template" : "text",
  };

  if (useTemplate) {
    payload.template = {
      name: String(templateName).trim(),
      language: {
        code: String(languageCode || "es_AR").trim() || "es_AR",
      },
    };

    const components = buildTemplateComponents(bodyParameters);
    if (components) {
      payload.template.components = components;
    }
  } else {
    const body = String(texto || "").trim();
    if (!body) {
      throw new Error("texto de WhatsApp vacio");
    }

    payload.text = {
      preview_url: false,
      body,
    };
  }

  const response = await fetch(
    `https://graph.facebook.com/v22.0/${fromPhoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`WhatsApp API error ${response.status}: ${errorText}`);
  }

  return response.json();
}

async function validarWhatsAppConfig({ phoneNumberId }) {
  const token = WHATSAPP_TOKEN.value();
  const fromPhoneNumberId = sanitizeDigits(phoneNumberId);

  if (!token) {
    throw new Error("WHATSAPP_TOKEN no configurado");
  }

  if (!fromPhoneNumberId) {
    throw new Error("whatsappPhoneNumberId no configurado");
  }

  const response = await fetch(
    `https://graph.facebook.com/v22.0/${fromPhoneNumberId}?fields=id,display_phone_number,verified_name`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`WhatsApp config error ${response.status}: ${errorText}`);
  }

  return response.json();
}

module.exports = {
  WHATSAPP_TOKEN,
  enviarWhatsApp,
  normalizarTelefonoWhatsApp,
  validarWhatsAppConfig,
};

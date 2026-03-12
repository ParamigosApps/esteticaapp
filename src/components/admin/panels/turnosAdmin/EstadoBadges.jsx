import { getEstadoPago, getMetodoPagoEsperado } from "./turnosAdminHelpers";

function renderBadge(texto, className) {
  return <span className={`turno-badge ${className}`}>{texto}</span>;
}

export function BadgeEstadoTurno({ estado }) {
  const config = {
    pendiente: { texto: "Pendiente", className: "turno-badge-neutral" },
    pendiente_aprobacion: {
      texto: "Pendiente aprobación",
      className: "turno-badge-warning",
    },
    confirmado: { texto: "Confirmado", className: "turno-badge-success" },
    rechazado: { texto: "Rechazado", className: "turno-badge-danger" },
    cancelado: { texto: "Cancelado", className: "turno-badge-muted" },
    perdido: { texto: "Perdido", className: "turno-badge-muted" },
    finalizado: { texto: "Finalizado", className: "turno-badge-info" },
    ausente: { texto: "Ausente", className: "turno-badge-purple" },
  };

  const data = config[estado] || {
    texto: estado || "Desconocido",
    className: "turno-badge-neutral",
  };

  return renderBadge(data.texto, data.className);
}

export function BadgeEstadoPago({ turno }) {
  const estado = getEstadoPago(turno);
  const metodoReal = turno?.metodoPagoUsado || null;
  const metodoEsperado = getMetodoPagoEsperado(turno);
  const metodo = metodoReal || metodoEsperado;

  let data;

  if (estado === "pendiente" && metodo === "mercadopago") {
    data = {
      texto: "Esperando MercadoPago",
      className: "turno-badge-purple",
    };
  } else if (
    estado === "pendiente" &&
    (metodo === "manual" || metodo === "transferencia")
  ) {
    data = {
      texto: "Esperando transferencia",
      className: "turno-badge-warning",
    };
  } else if (
    estado === "pendiente_aprobacion" &&
    (metodo === "manual" || metodo === "transferencia")
  ) {
    data = {
      texto: "Comprobante recibido",
      className: "turno-badge-warning",
    };
  } else if (estado === "abonado" && metodo === "mercadopago") {
    data = {
      texto: "Pagado por MercadoPago",
      className: "turno-badge-success",
    };
  } else if (
    estado === "abonado" &&
    (metodo === "manual" || metodo === "transferencia")
  ) {
    data = {
      texto: "Pagado por transferencia",
      className: "turno-badge-success",
    };
  } else if (estado === "parcial" && metodo === "mercadopago") {
    data = {
      texto: "Seña por MercadoPago",
      className: "turno-badge-info",
    };
  } else if (
    estado === "parcial" &&
    (metodo === "manual" || metodo === "transferencia")
  ) {
    data = {
      texto: "Seña por transferencia",
      className: "turno-badge-info",
    };
  } else {
    const config = {
      pendiente: { texto: "Pago pendiente", className: "turno-badge-warning" },
      pendiente_aprobacion: {
        texto: "Falta confirmar pago",
        className: "turno-badge-warning",
      },
      parcial: { texto: "Seña abonada", className: "turno-badge-info" },
      abonado: { texto: "Abonado", className: "turno-badge-success" },
      rechazado: { texto: "Rechazado", className: "turno-badge-danger" },
      expirado: { texto: "Expirado", className: "turno-badge-muted" },
      reembolsado: { texto: "Reembolsado", className: "turno-badge-teal" },
    };

    data = config[estado] || {
      texto: estado || "Desconocido",
      className: "turno-badge-neutral",
    };
  }

  return renderBadge(data.texto, data.className);
}

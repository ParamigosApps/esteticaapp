import Swal from "sweetalert2";

function formatMoney(value) {
  return Number(value || 0).toLocaleString("es-AR");
}

export function swalSuccess({
  title = "Operación exitosa",
  text = "",
  confirmText = "Aceptar",
  timer = 2500,
}) {
  return Swal.fire({
    title,
    text,
    icon: "success",

    confirmButtonText: confirmText,

    timer,
    timerProgressBar: true,

    customClass: {
      confirmButton: "swal-btn-confirm",
    },

    buttonsStyling: false,
  });
}

export function swalError({
  title = "Error",
  text = "",
  confirmText = "Aceptar",
  timer = 3000,
}) {
  return Swal.fire({
    title,
    text,
    icon: "error",

    confirmButtonText: confirmText,

    timer,
    timerProgressBar: true,

    customClass: {
      confirmButton: "swal-btn-confirm",
    },

    buttonsStyling: false,
  });
}

export function swalInfo({
  title = "Información",
  text,
  confirmText = "Entendido",
  timer = 3000,
} = {}) {
  return Swal.fire({
    title,
    ...(text ? { text } : {}), // solo agrega text si existe
    icon: "info",

    confirmButtonText: confirmText,
    timer,
    timerProgressBar: true,

    customClass: {
      confirmButton: "swal-btn-confirm",
    },

    buttonsStyling: false,
  });
}

// =====================================================
// 🔴 CONFIRM DANGER (RECHAZAR)
// =====================================================
export function swalConfirmDanger({
  title = "¿Confirmar acción?",
  html = "",
  confirmText = "Rechazar",
  cancelText = "Cancelar",
  width = 520,
  customClass = {},
}) {
  return Swal.fire({
    title,
    html,
    icon: "warning",
    width,

    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,

    allowOutsideClick: false,
    allowEscapeKey: false,
    allowEnterKey: false,

    reverseButtons: true,

    customClass: {
      confirmButton: customClass.confirmButton || "swal-btn-danger",
      cancelButton: customClass.cancelButton || "swal-btn-dark",
      popup: customClass.popup || "",
      title: customClass.title || "",
      htmlContainer: customClass.htmlContainer || "",
      actions: customClass.actions || "",
    },

    buttonsStyling: false,
    focusCancel: true,
  });
}

// =====================================================
// 🟡 CONFIRM WARNING (OPCIONAL / FUTURO)
// =====================================================
export function swalConfirmWarning({
  title = "¿Confirmar?",
  html = "",
  confirmText = "Continuar",
  cancelText = "Cancelar",
  width = 520,
}) {
  return Swal.fire({
    title,
    html,
    icon: "question",
    width,

    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,

    customClass: {
      confirmButton: "swal-btn-confirm",
      cancelButton: "swal-btn-dark",
    },
    reverseButtons: true,
    buttonsStyling: false,
  });
} // =====================================================
// REQUIERE INICIAR SESION
// =====================================================

export async function swalRequiereLogin(contexto = null) {
  const result = await Swal.fire({
    title: "Debes iniciar sesión",
    text: "Inicia sesión para comprar.",
    icon: "warning",
    confirmButtonText: "Iniciar sesión",
    allowOutsideClick: true,
    allowEscapeKey: true,
    customClass: {
      popup: "swal-popup-custom",
      confirmButton: "swal-btn-confirm",
    },
    buttonsStyling: false,
  });

  if (result.isConfirmed && typeof window !== "undefined") {
    if (contexto) {
      window.sessionStorage.setItem(
        "pendingLoginAction",
        JSON.stringify(contexto),
      );
    }

    window.sessionStorage.setItem("openLoginOnHome", "1");

    if (window.location.pathname === "/") {
      window.dispatchEvent(new CustomEvent("open-login-modal"));
    } else {
      window.location.assign("/");
    }
  }

  return result;
}
// =====================================================
//  FORM PERFIL USUARIO (NOMBRE + EMAIL + TELÉFONO)
// =====================================================
export function swalEditarPerfil({
  nombreActual = "",
  apodoActual = "",
  emailActual = "",
  telefono = "",
  bloquearEmail = false,
}) {
  return Swal.fire({
    title: "✏️ Editar perfil",
    html: `
      <input
        id="swal-nombre"
        class="swal2-input"
        placeholder="Nombre y apellido"
        value="${nombreActual}"
      />
      <input
        id="swal-apodo"
        class="swal2-input"
        placeholder="Apodo (opcional)"
        value="${apodoActual}"
      />
      ${
        bloquearEmail
          ? `
      <input
        class="swal2-input"
        style="opacity:0.5; cursor:not-allowed;"
        value="${emailActual || "Email asociado a tu cuenta"}"
        disabled
      />
          `
          : `
            <input
              id="swal-email"
              class="swal2-input"
              placeholder="Email (opcional)"
              value="${emailActual || ""}"
            />
          `
      }

      ${
        telefono
          ? `
            <input class="swal2-input" value="${telefono}" disabled />
            <p style="font-size:12px;color:#777;margin-top:-6px">
              El teléfono no puede modificarse
            </p>
          `
          : ""
      }

      <p style="font-size:12px;color:#777">
        Tus entradas estarán disponibles en la app y serán enviadas al email si lo ingresás.
      </p>
    `,

    showCancelButton: true,
    confirmButtonText: "Guardar",
    cancelButtonText: "Cancelar",

    customClass: {
      confirmButton: "swal-btn-confirm",
      cancelButton: "swal-btn-dark",
    },

    buttonsStyling: false,
    reverseButtons: true,
    focusConfirm: false,

preConfirm: () => {
  const nombre = document.getElementById("swal-nombre").value.trim();
  const apodo = document.getElementById("swal-apodo")?.value.trim() || "";

  const emailInput = document.getElementById("swal-email");
  const email = emailInput ? emailInput.value.trim() : null;

  if (!nombre || nombre.length < 2) {
    Swal.showValidationMessage("Ingresá un nombre válido");
    return false;
  }

  if (email && !/^\S+@\S+\.\S+$/.test(email)) {
    Swal.showValidationMessage("Email inválido");
    return false;
  }

  return {
    nombre,
    apodo: apodo || null,
    email: email || null,
  };
},
  });
}

// =====================================================
// 📧 LOGIN POR EMAIL
// =====================================================
export function swalLoginEmail({
  title = "Ingresá tu correo electrónico",
  confirmText = "Enviar enlace",
  cancelText = "Cancelar",
  width = 380,
} = {}) {
  return Swal.fire({
    title,
    html: `
      <input
        id="swal-email-login"
        class="swal2-input"
        type="email"
        placeholder="tuemail@email.com"
        autocomplete="email"
      />
      <p style="font-size:12px;color:#777">
        Te enviaremos un enlace para iniciar sesión.
      </p>
    `,
    width,

    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    reverseButtons: true,

    buttonsStyling: false,
    customClass: {
      confirmButton: "swal-btn-confirm",
      cancelButton: "swal-btn-alt",
    },

    focusConfirm: false,

    preConfirm: () => {
      const email = document.getElementById("swal-email-login")?.value?.trim();

      if (!email) {
        Swal.showValidationMessage("Ingresá tu email");
        return false;
      }

      if (!/^\S+@\S+\.\S+$/.test(email)) {
        Swal.showValidationMessage("Email inválido");
        return false;
      }

      return email;
    },
  });
}

// =====================================================
// 💳 TRANSFERENCIA MANUAL TURNO (ESTILO APPBAR)
// =====================================================
export function swalTransferenciaTurnoManual({
  monto,
  alias,
  cbu,
  titular,
  banco,
  telefono,
  mensaje,
  onConfirmar,
}) {
  return Swal.fire({
    title: `<span class="swal-title-main">Transferencia Bancaria</span>`,
    width: "480px",
    showConfirmButton: false,
    allowOutsideClick: false,
    allowEscapeKey: false,
    allowEnterKey: false,

    html: `
      <div class="transfer-box">
        <p class="transfer-monto">
          <b>Monto a transferir:</b>
          <span class="transfer-precio">$${monto}</span>
        </p>

        <div class="transfer-datos-dark">
          <div class="dato-line">
            <span class="label">Alias</span>
            <span class="value">${alias}</span>
          </div>
          <div class="dato-line">
            <span class="label">CBU</span>
            <span class="value">${cbu}</span>
          </div>
          <div class="dato-line">
            <span class="label">Titular</span>
            <span class="value">${titular}</span>
          </div>
          <div class="dato-line">
            <span class="label">Banco</span>
            <span class="value">${banco}</span>
          </div>
        </div>
        <p class="small text-muted">
          Importante: Enviar comprobante por WhatsApp para que su turno sea confirmado.
          
        </p>
        <button id="comprobante-btn" class="method-btn full-btn azul">
          Confirmar y enviar comprobante
        </button>

        <button id="copiar-btn" class="method-btn full-btn celeste">
          Copiar ALIAS
        </button>

        <div id="copiado-ok" class="copiado-ok" style="display:none;">
          Alias copiado
        </div>

        <button id="cerrar-btn" class="method-btn full-btn gris">
          Cancelar
        </button>
      </div>
    `,

    didOpen: () => {
      const copiarBtn = document.getElementById("copiar-btn");
      const compBtn = document.getElementById("comprobante-btn");
      const cerrarBtn = document.getElementById("cerrar-btn");

      if (copiarBtn) {
        copiarBtn.onclick = async () => {
          await navigator.clipboard.writeText(alias);
          const ok = document.getElementById("copiado-ok");
          if (ok) ok.style.display = "block";
          setTimeout(() => {
            if (ok) ok.style.display = "none";
          }, 1800);
        };
      }

      if (compBtn) {
        compBtn.onclick = async () => {
          try {
            if (typeof onConfirmar === "function") {
              await onConfirmar();
            }

            if (telefono) {
              window.open(
                `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`,
                "_blank",
              );
            }

            Swal.close();
          } catch (e) {
            console.error("Error confirmando turno manual", e);
          }
        };
      }

      if (cerrarBtn) {
        cerrarBtn.onclick = () => Swal.close();
      }
    },
  });
}

// =====================================================
// 🗓 RESUMEN TURNO
// =====================================================
export function swalResumenTurno({
  servicio,
  profesional,
  fecha,
  horaInicio,
  horaFin,
  duracion,
  precio,
  precioBase = null,
  montoExtras = 0,
  comision = 0,
  precioAnticipo,
  itemsPrecioVariable = [],
  modoReserva,
}) {
  const esManual = modoReserva === "reserva";
  const precioFormateado = formatMoney(precio);
  const precioBaseFormateado = formatMoney(precioBase);
  const montoExtrasFormateado = formatMoney(montoExtras);
  const precioAnticipoFormateado = formatMoney(precioAnticipo);

  let tituloSwal = esManual ? "Solicitud de turno" : "Confirmacion de turno";
  return Swal.fire({
    title: `<span class="swal-title-main">${tituloSwal}</span>`,
    width: "480px",
    showCancelButton: true,
    confirmButtonText: esManual
      ? "Confirmar por WhatsApp"
      : "Pagar y confirmar",
    cancelButtonText: "Cancelar",
    reverseButtons: true,
    buttonsStyling: false,

    customClass: {
      popup: "swal-popup-custom",
      confirmButton: esManual ? "swal-btn-confirm" : "swal-btn-confirm-dark",
      cancelButton: "swal-btn-cancel",
    },

    html: `
      <div class="swal-turno-container">

        <div class="swal-turno-header">
          <div class="swal-servicio">${servicio}</div>
          <div class="swal-profesional">con <b>${profesional}</b></div>
          ${
            precioBase != null && precioBase > 0
              ? `
              <div class="swal-servicio-meta">
                Costo del servicio: <strong>$${precioBaseFormateado}</strong>
              </div>
              `
              : ""
          }
        </div>

        <div class="swal-turno-body">

          <div class="swal-row">
            <div class="swal-label">Fecha</div>
            <div class="swal-value">${fecha}</div>
          </div>

          <div class="swal-row">
            <div class="swal-label">Horario</div>
            <div class="swal-value">${horaInicio} - ${horaFin}</div>
          </div>

          <div class="swal-row">
            <div class="swal-label">Duración</div>
            <div class="swal-value">${duracion} min</div>
          </div>

          ${
            itemsPrecioVariable.length
              ? itemsPrecioVariable
                  .map(
                    (item) => `
              <div class="swal-row">
                <div class="swal-label">${item.nombre}</div>
                <div class="swal-value">+$${formatMoney(item.monto)}</div>
              </div>
            `,
                  )
                  .join("")
              : ""
          }

          ${
            montoExtras > 0
              ? `
              <div class="swal-row precio-row">
                <div class="swal-label">Extras agregados</div>
                <div class="swal-value precio">+$${montoExtrasFormateado}</div>
              </div>
              `
              : ""
          }

          ${
            precio > 0
              ? `
              <div class="swal-row precio-row">
                <div class="swal-label">Total del servicio</div>
                <div class="swal-value precio">$${precioFormateado}</div>
              </div>


                        ${
            precioAnticipo != null
              ? `
              <div class="swal-row precio-row mt-2">
                <div class="swal-label">${
                  precioAnticipo >= precio ? "Pago a abonar ahora" : "Seña a abonar ahora"
                }</div>
                <div class="swal-value precio">$${precioAnticipoFormateado}</div>
              </div>
              ${
                Number(comision || 0) > 0
                  ? `
                  <div class="swal-price-caption">
                    Incluye un cargo de reserva online de $${formatMoney(comision)}.
                  </div>
                  `
                  : ""
              }
              `
              : ""
          }
              `
              : ""
          }

        </div>

        <div class="swal-turno-footer ${esManual ? "manual" : "automatico"}">
          ${
            esManual
              ? `
              ⚠️ Este turno requiere confirmación manual. 
              Un administrador verificará disponibilidad y te responderá por WhatsApp.
              `
              : `
              Serás redirigido a MercadoPago para completar el pago y confirmar el turno.
              `
          }
        </div>

      </div>
    `,
  });
}

export function swalConfirmWarningHtml({
  title = "¿Confirmar?",
  html = "",
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  width = 520,
}) {
  return Swal.fire({
    title,
    html,
    icon: "warning",
    width,

    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,

    allowOutsideClick: false,
    allowEscapeKey: false,
    allowEnterKey: false,

    customClass: {
      popup: "swal-popup-custom",
      confirmButton: "swal-btn-confirm",
      cancelButton: "swal-btn-cancel",
    },

    buttonsStyling: false,
  });
}

export function swalErrorHtml({
  title = "Error",
  html = "",
  confirmText = "Aceptar",
  timer = 3500,
}) {
  return Swal.fire({
    title,
    html,
    icon: "error",

    confirmButtonText: confirmText,

    timer,
    timerProgressBar: true,

    customClass: {
      confirmButton: "swal-btn-confirm",
    },

    buttonsStyling: false,
  });
}

export function swalInputText({
  title,
  placeholder = "",
  confirmText = "Confirmar",
  cancelText = "Cancelar",
}) {
  return Swal.fire({
    title,
    input: "text",
    inputPlaceholder: placeholder,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,

    allowOutsideClick: false,
    allowEscapeKey: false,
    allowEnterKey: false,

    customClass: {
      popup: "swal-popup-custom",
      confirmButton: "swal-btn-confirm",
      cancelButton: "swal-btn-cancel",
    },

    buttonsStyling: false,
  });
}

// =====================================================
// 💳 ELECCIÓN DE TIPO DE PAGO
// =====================================================
export function swalElegirTipoPago({
  title = "Confirmar pago",
  html = "",
  confirmText = "Pago total",
  denyText = "Pago parcial / seña",
  cancelText = "Cancelar",
  width = 520,
  customClass = {},
  buttonsStyling = false,
  reverseButtons = true,
}) {
  return Swal.fire({
    title,
    html,
    icon: "question",
    width,

    showCancelButton: true,
    showDenyButton: true,

    confirmButtonText: confirmText,
    denyButtonText: denyText,
    cancelButtonText: cancelText,

    allowOutsideClick: false,
    allowEscapeKey: false,
    allowEnterKey: false,

    customClass: {
      popup: customClass.popup || "swal-popup-custom",
      confirmButton: customClass.confirmButton || "swal-btn-confirm",
      denyButton:  "swal-btn-alt",
      cancelButton: customClass.cancelButton || "swal-btn-cancel",
      actions: customClass.actions || "",
      title: customClass.title || "",
      htmlContainer: customClass.htmlContainer || "",
    },

    buttonsStyling,
    reverseButtons,
  });
}

// =====================================================
// 🔢 INPUT NÚMERICO
// =====================================================
export function swalInputNumber({
  title = "Ingresá un monto",
  inputValue = "",
  placeholder = "",
  confirmText = "Guardar",
  cancelText = "Cancelar",
  min = "0",
  step = "1",
  inputValidator,
}) {
  return Swal.fire({
    title,
    input: "number",
    inputValue,
    inputPlaceholder: placeholder,
    inputAttributes: {
      min,
      step,
    },

    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,

    allowOutsideClick: false,
    allowEscapeKey: false,
    allowEnterKey: false,

    customClass: {
      popup: "swal-popup-custom",
      confirmButton: "swal-btn-confirm",
      cancelButton: "swal-btn-cancel",
    },

    buttonsStyling: false,
    reverseButtons: true,
    inputValidator,
  });
}

// =====================================================
// ✅ CONFIRMACIÓN ADMIN GENÉRICA
// =====================================================
export function swalConfirmAdmin({
  title = "Confirmar acción",
  text = "",
  html = "",
  icon = "question",
  confirmText = "Confirmar",
  cancelText = "Volver",
  confirmButtonClass = "swal-btn-confirm",
  cancelButtonClass = "swal-btn-cancel",
  width = 520,
}) {
  return Swal.fire({
    title,
    ...(text ? { text } : {}),
    ...(html ? { html } : {}),
    icon,
    width,

    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,

    customClass: {
      popup: "swal-popup-custom",
      confirmButton: confirmButtonClass,
      cancelButton: cancelButtonClass,
    },

    buttonsStyling: false,
    reverseButtons: true,
    allowOutsideClick: false,
    allowEscapeKey: false,
    allowEnterKey: false,
  });
}

// =====================================================
// 🗓 REPROGRAMAR TURNO
// =====================================================
export function swalReprogramarTurno({
  title = "Reprogramar turno",
  fecha = "",
  horaInicio = "",
  horaFin = "",
} = {}) {
  return Swal.fire({
    title,
    html: `
      <input id="swal-fecha" type="date" class="swal2-input" value="${fecha}">
      <input id="swal-hora-inicio" type="time" class="swal2-input" value="${horaInicio}">
      <input id="swal-hora-fin" type="time" class="swal2-input" value="${horaFin}">
    `,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: "Guardar cambio",
    cancelButtonText: "Volver",

    customClass: {
      popup: "swal-popup-custom",
      confirmButton: "swal-btn-confirm",
      cancelButton: "swal-btn-cancel",
    },

    buttonsStyling: false,
    reverseButtons: true,
    allowOutsideClick: false,
    allowEscapeKey: false,

    preConfirm: () => {
      const fechaValue = document.getElementById("swal-fecha")?.value;
      const horaInicioValue = document.getElementById("swal-hora-inicio")?.value;
      const horaFinValue = document.getElementById("swal-hora-fin")?.value;

      if (!fechaValue || !horaInicioValue || !horaFinValue) {
        Swal.showValidationMessage("Completá fecha y horario");
        return false;
      }

      if (horaInicioValue >= horaFinValue) {
        Swal.showValidationMessage("La hora fin debe ser mayor a la hora inicio");
        return false;
      }

      return {
        fecha: fechaValue,
        horaInicio: horaInicioValue,
        horaFin: horaFinValue,
      };
    },
  });
}

export function swalTurnoConfirmado({
  title = "Turno confirmado",
  html = `
    <p style="text-align:center;font-size:15px;">
      Tu turno fue confirmado correctamente.
    </p>
    <p style="text-align:center;color:#555;">
      Podes verlo en Mis turnos o seguir agendando.
    </p>
  `,
} = {}) {
  return Swal.fire({
    icon: "success",
    title,
    html,
    showCancelButton: true,
    confirmButtonText: "Ir a mis turnos",
    cancelButtonText: "Seguir agendando",
    reverseButtons: true,
    customClass: {
      popup: "swal-popup-custom",
      confirmButton: "swal-btn-confirm",
      cancelButton: "swal-btn-cancel",
    },
    buttonsStyling: false,
  });
}

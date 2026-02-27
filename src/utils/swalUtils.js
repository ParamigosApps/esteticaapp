import Swal from 'sweetalert2'
import { formatearSoloFecha } from './utils'

function normalizarFecha(ev) {
  if (!ev?.fechaInicio) return null
  if (ev.fechaInicio.seconds) {
    return new Date(ev.fechaInicio.seconds * 1000)
  }
  return new Date(ev.fechaInicio)
}

function calcularTextoArranca(fecha) {
  const ahora = new Date()
  const diffMs = fecha - ahora

  if (diffMs <= 0) return 'EN CURSO'

  const min = Math.floor(diffMs / 60000)
  if (min < 60) return `ARRANCA EN ${min} MIN`

  const hs = Math.floor(min / 60)
  if (hs < 24) return `ARRANCA EN ${hs} HS`

  const dias = Math.floor(hs / 24)
  if (dias >= 1) return `ARRANCA EN ${dias} DÍA${dias > 1 ? 'S' : ''}`
}

export function swalSuccess({
  title = 'Operación exitosa',
  text = '',
  confirmText = 'Aceptar',
  timer = 2500,
}) {
  return Swal.fire({
    title,
    text,
    icon: 'success',

    confirmButtonText: confirmText,

    timer,
    timerProgressBar: true,

    customClass: {
      confirmButton: 'swal-btn-confirm',
    },

    buttonsStyling: false,
  })
}

export function swalError({
  title = 'Error',
  text = '',
  confirmText = 'Aceptar',
  timer = 3000,
}) {
  return Swal.fire({
    title,
    text,
    icon: 'error',

    confirmButtonText: confirmText,

    timer,
    timerProgressBar: true,

    customClass: {
      confirmButton: 'swal-btn-confirm',
    },

    buttonsStyling: false,
  })
}

export function swalInfo({
  title = 'Información',
  text,
  confirmText = 'Entendido',
  timer = 3000,
} = {}) {
  return Swal.fire({
    title,
    ...(text ? { text } : {}), // solo agrega text si existe
    icon: 'info',

    confirmButtonText: confirmText,
    timer,
    timerProgressBar: true,

    customClass: {
      confirmButton: 'swal-btn-confirm',
    },

    buttonsStyling: false,
  })
}

// =====================================================
// 🔴 CONFIRM DANGER (RECHAZAR)
// =====================================================
export function swalConfirmDanger({
  title = '¿Confirmar acción?',
  html = '',
  confirmText = 'Rechazar',
  cancelText = 'Cancelar',
  width = 520,
}) {
  return Swal.fire({
    title,
    html,
    icon: 'warning',
    width,

    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,

    // 🔒 BLOQUEO TOTAL
    allowOutsideClick: false,
    allowEscapeKey: false,
    allowEnterKey: false,

    // 🔁 BOTONES INVERTIDOS (CANCELAR A LA IZQ)
    reverseButtons: true,

    customClass: {
      confirmButton: 'swal-btn-danger', // ⚠️ peligro real
      cancelButton: 'swal-btn-dark',
    },

    buttonsStyling: false,
    focusCancel: true, // UX: foco en cancelar
  })
}

// =====================================================
// 🟡 CONFIRM WARNING (OPCIONAL / FUTURO)
// =====================================================
export function swalConfirmWarning({
  title = '¿Confirmar?',
  html = '',
  confirmText = 'Continuar',
  cancelText = 'Cancelar',
  width = 520,
}) {
  return Swal.fire({
    title,
    html,
    icon: 'question',
    width,

    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,

    customClass: {
      confirmButton: 'swal-btn-confirm',
      cancelButton: 'swal-btn-dark',
    },
    reverseButtons: true,
    buttonsStyling: false,
  })
} // =====================================================
// REQUIERE INICIAR SESION
// =====================================================

export async function swalRequiereLogin() {
  return Swal.fire({
    title: 'Debes iniciar sesión',
    text: 'Inicia sesión para comprar.',
    icon: 'warning',
    confirmButtonText: 'Iniciar sesión',
    allowOutsideClick: true,
    allowEscapeKey: true,
    customClass: {
      popup: 'swal-popup-custom',
      confirmButton: 'swal-btn-confirm',
    },
    buttonsStyling: false,
  })
}
// =====================================================
//  FORM PERFIL USUARIO (NOMBRE + EMAIL + TELÉFONO)
// =====================================================
export function swalEditarPerfil({
  nombreActual = '',
  emailActual = '',
  telefono = '',
  bloquearEmail = false,
}) {
  return Swal.fire({
    title: '✏️ Editar perfil',
    html: `
      <input
        id="swal-nombre"
        class="swal2-input"
        placeholder="Nombre y apellido"
        value="${nombreActual}"
      />

      ${
        bloquearEmail
          ? `
      <input
        class="swal2-input"
        style="opacity:0.5; cursor:not-allowed;"
        value="${emailActual || 'Email asociado a tu cuenta'}"
        disabled
      />
          `
          : `
            <input
              id="swal-email"
              class="swal2-input"
              placeholder="Email (opcional)"
              value="${emailActual || ''}"
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
          : ''
      }

      <p style="font-size:12px;color:#777">
        Tus entradas estarán disponibles en la app y serán enviadas al email si lo ingresás.
      </p>
    `,

    showCancelButton: true,
    confirmButtonText: 'Guardar',
    cancelButtonText: 'Cancelar',

    customClass: {
      confirmButton: 'swal-btn-confirm',
      cancelButton: 'swal-btn-dark',
    },

    buttonsStyling: false,
    reverseButtons: true,
    focusConfirm: false,

    preConfirm: () => {
      const nombre = document.getElementById('swal-nombre').value.trim()

      const emailInput = document.getElementById('swal-email')
      const email = emailInput ? emailInput.value.trim() : null

      if (!nombre || nombre.length < 2) {
        Swal.showValidationMessage('Ingresá un nombre válido')
        return false
      }

      if (email && !/^\S+@\S+\.\S+$/.test(email)) {
        Swal.showValidationMessage('Email inválido')
        return false
      }

      return {
        nombre,
        email: email || null,
      }
    },
  })
}

// =====================================================
// 📧 LOGIN POR EMAIL
// =====================================================
export function swalLoginEmail({
  title = 'Ingresá tu correo electrónico',
  confirmText = 'Enviar enlace',
  cancelText = 'Cancelar',
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
      confirmButton: 'swal-btn-confirm',
      cancelButton: 'swal-btn-alt',
    },

    focusConfirm: false,

    preConfirm: () => {
      const email = document.getElementById('swal-email-login')?.value?.trim()

      if (!email) {
        Swal.showValidationMessage('Ingresá tu email')
        return false
      }

      if (!/^\S+@\S+\.\S+$/.test(email)) {
        Swal.showValidationMessage('Email inválido')
        return false
      }

      return email
    },
  })
}

export function mostrarResultadoEntradasGratis({
  evento,
  exitosas = [],
  fallidas = [],
  onConfirm,
}) {
  // ==========================================================
  // ✅ AGRUPAR EXITOSAS POR LOTE
  // ==========================================================
  const okAgrupadas = {}

  exitosas.forEach(e => {
    const loteKey =
      e.lote?.id ||
      e.loteIndice ||
      `${e.lote?.nombre || e.loteNombre || e.nombre}-${e.lote?.genero || ''}`

    const loteNombre =
      e.lote?.nombre || e.loteNombre || e.nombre || 'Entrada general'

    if (!okAgrupadas[loteKey]) {
      okAgrupadas[loteKey] = {
        lote: loteNombre,
        genero: e.lote?.genero || null,
        generadas: 0,
      }
    }

    okAgrupadas[loteKey].generadas += Number(e.cantidad || 1)
  })

  const okHtml = Object.values(okAgrupadas)
    .map(
      info => `
      <div class="swal-row ok">
        <div class="swal-row-title">
          ${info.lote || 'Entrada'}
        </div>
        <div class="swal-row-value">
          x${Number(info.generadas || 0)}
        </div>
      </div>
    `
    )
    .join('')

  // ==========================================================
  // ❌ AGRUPAR FALLIDAS POR LOTE + CUPO
  // ==========================================================
  const errAgrupadas = {}

  fallidas.forEach(e => {
    const lote = e.lote?.nombre || e.loteNombre || e.nombre || 'Entrada general'

    if (!errAgrupadas[lote]) {
      errAgrupadas[lote] = {
        lote,
        solicitadas: 0,
        maxPorUsuario: e.maxPorUsuario ?? null,
        usadas: Number(e.usadasPorUsuario || 0),
        pendientes: Number(e.pendientesPorUsuario || 0),
        motivo: e.error || 'No se pudo generar la entrada',
      }
    }

    errAgrupadas[lote].solicitadas += Number(e.cantidad || 0)
  })
  const errHtml = Object.values(errAgrupadas)
    .map(e => {
      let detalle = ''

      if (Number.isFinite(e.maxPorUsuario)) {
        const disponibles = e.maxPorUsuario - e.usadas - e.pendientes

        if (disponibles > 0) {
          detalle = `
          Tenés ${e.usadas} ·
          Solicitaste ${e.solicitadas} ·
          Podés solicitar hasta ${disponibles}
        `
        } else {
          detalle = `
          Ya alcanzaste el máximo permitido (${e.maxPorUsuario})
        `
        }
      }

      return `
      <div class="swal-row error">
        <div class="swal-row-title">${e.lote}</div>
        <div class="swal-row-sub">
          ${e.motivo}
          ${detalle ? `<div class="swal-row-hint">${detalle}</div>` : ''}
        </div>
      </div>
    `
    })
    .join('')

  // ==========================================================
  // 🎨 HTML FINAL
  // ==========================================================
  const html = `
    <div class="swal-event-header">
  <h2>🎟 ${evento?.nombre || 'Evento'}</h2>
  ${
    evento?.fechaInicio
      ? `<small>${formatearSoloFecha(evento.fechaInicio)}</small>`
      : ''
  }
</div>

${
  okHtml
    ? `<div class="swal-block">
      <h4 class="swal-block-title success">Entradas confirmadas</h4>
      ${okHtml}
    </div>`
    : ''
}

${
  errHtml
    ? `<div class="swal-block">
      <h4 class="swal-block-title error">Entradas no generadas</h4>
      ${errHtml}
    </div>`
    : ''
}
  `

  // ==========================================================
  // 🔔 SWAL FINAL
  // ==========================================================
  return Swal.fire({
    icon: fallidas.length > 0 ? 'warning' : 'success',
    title: 'Resultado de tu solicitud',
    html,
    showCancelButton: true,
    confirmButtonText: 'Ir a mis entradas',
    cancelButtonText: 'Cerrar',
    buttonsStyling: false,
    reverseButtons: true,
    customClass: {
      popup: 'swal-resultado-entradas',
      confirmButton: 'swal-btn-confirm',
      cancelButton: 'swal-btn-cancel',
    },
  }).then(res => {
    if (res.isConfirmed && typeof onConfirm === 'function') {
      onConfirm()
    }
  })
}

export function swalConfirmWarningHtml({
  title = '¿Confirmar?',
  html = '',
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  width = 520,
}) {
  return Swal.fire({
    title,
    html,
    icon: 'warning',
    width,

    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,

    allowOutsideClick: false,
    allowEscapeKey: false,
    allowEnterKey: false,

    customClass: {
      popup: 'swal-popup-custom',
      confirmButton: 'swal-btn-confirm',
      cancelButton: 'swal-btn-cancel',
    },

    buttonsStyling: false,
  })
}

export function swalErrorHtml({
  title = 'Error',
  html = '',
  confirmText = 'Aceptar',
  timer = 3500,
}) {
  return Swal.fire({
    title,
    html,
    icon: 'error',

    confirmButtonText: confirmText,

    timer,
    timerProgressBar: true,

    customClass: {
      confirmButton: 'swal-btn-confirm',
    },

    buttonsStyling: false,
  })
}

export function swalInputText({
  title,
  placeholder = '',
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
}) {
  return Swal.fire({
    title,
    input: 'text',
    inputPlaceholder: placeholder,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,

    allowOutsideClick: false,
    allowEscapeKey: false,
    allowEnterKey: false,

    customClass: {
      popup: 'swal-popup-custom',
      confirmButton: 'swal-btn-confirm',
      cancelButton: 'swal-btn-cancel',
    },

    buttonsStyling: false,
  })
}
// =====================================================
// ⛔ LÍMITE DE PEDIDOS PENDIENTES
// =====================================================
export function swalLimitePedidos() {
  return Swal.fire({
    title: 'No puedes generar más pedidos',
    text: 'Ya tienes 3 pedidos pendientes.',
    icon: 'warning',

    confirmButtonText: 'Entendido',

    customClass: {
      popup: 'swal-popup-custom',
      confirmButton: 'swal-btn-confirm',
    },

    buttonsStyling: false,
  })
}

// src/services/loadingService.js
import Swal from 'sweetalert2'

export function showLoading({
  title = 'Procesando',
  text = 'Por favor aguardá unos segundos...',
  showBackButton = false,
  backButtonText = 'Volver atrás',
  onBack = null,
} = {}) {
  Swal.fire({
    title: `<span class="loading-title">${title}</span>`,
    text: '',
    html: `
      <div class="loading-box">
        <div class="loading-spinner"></div>
        <div class="loading-text">${text}</div>
      </div>
    `,
    showConfirmButton: false,
    showCancelButton: showBackButton,
    cancelButtonText: backButtonText,
    allowOutsideClick: false,
    allowEscapeKey: false,
    backdrop: true,
    customClass: {
      popup: 'swal-loading-popup',
      cancelButton: 'swal-loading-back-btn',
    },
  }).then((result) => {
    if (
      result.dismiss === Swal.DismissReason.cancel &&
      typeof onBack === 'function'
    ) {
      onBack()
    }
  })
}

export function hideLoading() {
  Swal.close()
}
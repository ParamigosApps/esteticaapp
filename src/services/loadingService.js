// src/services/loadingService.js
import Swal from 'sweetalert2'

export function showLoading({
  title = 'Procesando',
  text = 'Por favor aguardá unos segundos...',
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
    allowOutsideClick: false,
    allowEscapeKey: false,
    backdrop: true,
    customClass: {
      popup: 'swal-loading-popup',
    },
  })
}

export function hideLoading() {
  Swal.close()
}

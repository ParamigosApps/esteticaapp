// src/services/loadingService.js
import Swal from "sweetalert2";

export function showLoading({
  title = "Procesando",
  text = "Por favor aguarda unos segundos...",
  showBackButton = false,
  showCloseButton = false,
  backButtonText = "Volver atras",
  onBack = null,
  onClose = null,
} = {}) {
  Swal.fire({
    title: `<span class="loading-title">${title}</span>`,
    text: "",
    html: `
      <div class="loading-box">
        <div class="loading-spinner-shell" aria-hidden="true">
          <span class="spinner-border loading-spinner" role="status"></span>
        </div>
        <div class="loading-copy">
          <div class="loading-text">${text}</div>
        </div>
      </div>
    `,
    showConfirmButton: false,
    showCancelButton: showBackButton,
    showCloseButton,
    cancelButtonText: backButtonText,
    allowOutsideClick: false,
    allowEscapeKey: showCloseButton,
    backdrop: "rgba(248, 243, 252, 0.88)",
    customClass: {
      popup: "swal-loading-popup",
      title: "swal-loading-title",
      cancelButton: "swal-loading-back-btn",
      closeButton: "swal-loading-close-btn",
    },
  }).then((result) => {
    if (
      result.dismiss === Swal.DismissReason.cancel &&
      typeof onBack === "function"
    ) {
      onBack();
    }

    if (
      result.dismiss === Swal.DismissReason.close &&
      typeof onClose === "function"
    ) {
      onClose();
    }
  });
}

export function hideLoading() {
  Swal.close();
}

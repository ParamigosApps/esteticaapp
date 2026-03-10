import Swal from 'sweetalert2'

function withTimeout(promise, ms = 10000) {
  return Promise.race([
    promise,
    new Promise((_, r) =>
      setTimeout(() => r(new Error('Tiempo de espera agotado')), ms)
    ),
  ])
}

export async function swalInputAsync({
  title,
  placeholder,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  onSubmit,
  widthDesktop = 420,
  inputMode = 'text',
}) {
  const r = await Swal.fire({
    title,
    input: 'text',
    inputPlaceholder: placeholder,

    inputAttributes: {
      inputmode: inputMode,
    },

    confirmButtonText: confirmText,
    showCancelButton: true,
    cancelButtonText: cancelText,
    reverseButtons: true,

    allowOutsideClick: () => !Swal.isLoading(),
    allowEscapeKey: () => !Swal.isLoading(),

    customClass: {
      popup: 'swal-codigo-popup',
      input: 'swal-codigo-input',
      confirmButton: 'swal-btn-confirm',
      cancelButton: 'swal-btn-alt',
    },

    didOpen: () => {
      const input = Swal.getInput()
      input.focus()
      input.select()

      if (window.innerWidth < 600) {
        input.style.width = '100%'
      } else {
        input.style.width = `${widthDesktop}px`
        input.style.maxWidth = '100%'
      }

      input.style.margin = '12px auto'
      input.style.fontSize = '1.05rem'
    },

    preConfirm: async value => {
      if (Swal.isLoading()) return false

      if (!value) {
        Swal.showValidationMessage('Ingresá un valor válido')
        return false
      }

      const clean = value.replace(/\s+/g, '').trim()

      if (!clean) {
        Swal.showValidationMessage('Ingresá un valor válido')
        return false
      }

      try {
        Swal.showLoading()
        return await withTimeout(onSubmit(clean), 10000)
      } catch (err) {
        Swal.hideLoading()
        Swal.showValidationMessage(err.message || 'Error procesando')
        return false
      }
    },
  })

  return r.isConfirmed ? r.value : null
}

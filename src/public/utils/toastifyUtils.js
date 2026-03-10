import { toast } from 'react-toastify'

// =====================================================
// ✅ TOAST SUCCESS
// =====================================================
export function toastSuccess(message, options = {}) {
  return toast.success(message, {
    position: 'top-center',
    autoClose: 1500,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    ...options,
  })
}

// =====================================================
// ❌ TOAST ERROR
// =====================================================
export function toastError(message, options = {}) {
  return toast.error(message, {
    position: 'top-center',
    autoClose: 3000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    ...options,
  })
}

// =====================================================
// ℹ️ TOAST INFO
// =====================================================
export function toastInfo(message, options = {}) {
  return toast.info(message, {
    position: 'top-center',
    autoClose: 1500,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    ...options,
  })
}

// =====================================================
// ⚠️ TOAST WARNING
// =====================================================
export function toastWarning(message, options = {}) {
  return toast.warning(message, {
    position: 'top-center',
    autoClose: 2500,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    ...options,
  })
}

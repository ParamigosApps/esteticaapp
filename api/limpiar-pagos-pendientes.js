//C:\Users\ivang\OneDrive\Escritorio\esteticapp\api\limpiar-pagos-pendientes.js

import { limpiarPagosPendientes } from '../src/services/limpiarPagosPendientes.js'

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed',
    })
  }

  try {
    const resultado = await limpiarPagosPendientes()

    return res.status(200).json({
      ok: true,
      ...resultado,
    })
  } catch (error) {
    console.error('❌ limpiar-pagos-pendientes error', error)

    return res.status(500).json({
      ok: false,
      error: error?.message || 'Error interno',
    })
  }
}
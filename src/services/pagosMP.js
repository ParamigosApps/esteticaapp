// src/services/pagosMP.js
import { obtenerComisionEntrada } from '../config/comisiones.js'
import { normalizarPrecio } from '../utils/utils.js'

export async function crearPreferenciaEntrada({
  eventoId,
  pagoId,
  items,
  imagenEventoUrl,
  usuarioId,
  usuarioNombre,
  usuarioEmail,
}) {
  try {
    if (!usuarioId) {
      throw new Error('Usuario no autenticado')
    }
    const comisionPorEntrada = obtenerComisionEntrada({
      evento: { id: eventoId },
    })

    let total = 0
    let totalComision = 0
    let totalBase = 0

    const itemsMP = items.map((i, idx) => {
      const cantidad = Math.max(1, Math.trunc(Number(i.cantidad)))
      const precioBase = normalizarPrecio(i.precio)

      const comisionUnit = obtenerComisionEntrada({
        evento: { id: eventoId },
        lote: i,
      })

      const unitPrice = precioBase + comisionUnit

      totalBase += precioBase * cantidad
      totalComision += comisionUnit * cantidad
      total += unitPrice * cantidad

      return {
        id: i.id || `entrada_${idx + 1}_${i.nombre}`,
        title: String(i.nombre),
        description: `Entrada ${i.nombre} - Evento ${eventoId}`,
        quantity: cantidad,
        unit_price: unitPrice,
        currency_id: 'ARS',
        category_id: 'tickets',
      }
    })

    console.log('🧾 Preferencia ENTRADA payload', {
      pagoId,
      total,
      usuarioEmail,
      usuarioNombre,
      itemsMP,
    })

    const res = await fetch('/api/crear-preferencia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pagoId,
        external_reference: pagoId,
        usuarioId,
        usuarioEmail,
        usuarioNombre,
        items: itemsMP,
        imagenEventoUrl,

        // 🔐 DESGLOSE FISCAL
        breakdown: {
          total,
          totalBase,
          totalComision,
          comisionPorEntrada,
        },
      }),
    })

    let data = null
    const text = await res.text()

    try {
      data = text ? JSON.parse(text) : null
    } catch (e) {
      console.error('❌ Respuesta NO JSON desde /api/crear-preferencia', {
        status: res.status,
        text,
      })
      return null
    }

    if (!res.ok || !data?.init_point) {
      console.error('❌ Backend MP error:', data)
      return null
    }

    return {
      ...data,
      total,
      totalBase,
      totalComision,
    }
  } catch (err) {
    console.error('❌ crearPreferenciaEntrada ERROR:', err)
    return null
  }
}

export async function crearPreferenciaCompra({
  carrito,
  total,
  evento,
  idToken,
}) {
  if (!idToken) {
    throw new Error('idToken requerido para Mercado Pago')
  }

  const res = await fetch(
    'https://us-central1-appbar-24e02.cloudfunctions.net/crearCompraMP',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ carrito, total, evento }),
    }
  )

  let data = {}
  try {
    data = await res.json()
  } catch {
    // backend no devolvió JSON válido
  }

  // 🔥 MANEJO REAL DE ERRORES DE NEGOCIO
  if (!res.ok) {
    throw new Error(data?.error || 'No se pudo iniciar el pago')
  }

  if (!data?.init_point) {
    throw new Error('Mercado Pago no devolvió link de pago')
  }

  if (data?.pagoId) {
    localStorage.setItem('pagoIdEnProceso', data.pagoId)
  }

  return data.init_point
}

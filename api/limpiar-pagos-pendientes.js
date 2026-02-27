import { collection, getDocs, updateDoc, doc } from 'firebase/firestore'
import { db } from '../src/Firebase.js'
import { liberarCuposGratis } from '../src/logic/entradas/entradasCupos.js'

const TIMEOUT_MS = 15 * 60 * 1000 // 15 minutos

export async function limpiarPagosPendientes() {
  const snap = await getDocs(collection(db, 'pagos'))
  const ahora = Date.now()

  let countRevisados = 0
  let countLiberados = 0

  for (const d of snap.docs) {
    countRevisados++

    const pago = d.data()

    // --------------------------------------------------
    // Filtros defensivos
    // --------------------------------------------------
    if (pago.estado !== 'pendiente') continue
    if (pago.metodo !== 'mp') continue

    const iniciado = pago.paymentStartedAt?.toMillis?.()
    if (!iniciado) continue

    if (ahora - iniciado < TIMEOUT_MS) continue

    // --------------------------------------------------
    // ⏱️ TIMEOUT → liberar stock
    // --------------------------------------------------
    try {
      await liberarCuposGratis({
        eventoId: pago.eventoId,
        entradasGratisPendientes: pago.entradasGratisPendientes,
      })

      await updateDoc(doc(db, 'pagos', d.id), {
        estado: 'timeout',
        liberadoAt: new Date(),
      })

      countLiberados++
    } catch (err) {
      // ❌ Importante: NO romper el loop
      console.error('❌ Error liberando pago', d.id, err)
    }
  }

  return {
    revisados: countRevisados,
    liberados: countLiberados,
  }
}

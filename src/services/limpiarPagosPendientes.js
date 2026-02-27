import { collection, getDocs, updateDoc, doc } from 'firebase/firestore'
import { db } from '../src/Firebase.js'
import { liberarCuposGratis } from '../src/logic/entradas/entradasCupos.js'

const TIMEOUT_MS = 30 * 60 * 1000

export async function limpiarPagosPendientes() {
  const snap = await getDocs(collection(db, 'pagos'))
  const ahora = Date.now()

  for (const d of snap.docs) {
    const pago = d.data()
    if (pago.estado !== 'pendiente') continue

    const creado = pago.creadoEn?.toMillis?.()
    if (!creado) continue

    if (ahora - creado > TIMEOUT_MS) {
      await liberarCuposGratis({
        eventoId: pago.eventoId,
        entradasGratisPendientes: pago.entradasGratisPendientes,
      })

      await updateDoc(doc(db, 'pagos', d.id), {
        estado: 'timeout',
        liberadoAt: new Date(),
      })
    }
  }
}

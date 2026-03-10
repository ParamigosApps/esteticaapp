import { useEffect, useState } from "react";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";

const db = getFirestore();

export default function TurnosAdmin() {
  const [turnos, setTurnos] = useState([]);

  async function cargar() {
    const q = query(
      collection(db, "turnos"),
      where("estadoTurno", "==", "pendiente_aprobacion"),
    );

    const snap = await getDocs(q);
    setTurnos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  async function confirmar(turnoId) {
    const fn = httpsCallable(getFunctions(), "confirmarPagoTurno");
    await fn({ turnoId });
    await cargar();
  }

  useEffect(() => {
    cargar();
  }, []);

  return (
    <div>
      <h4>Turnos pendientes de aprobación</h4>

      {turnos.map((t) => (
        <div key={t.id}>
          {new Date(t.inicio.toMillis()).toLocaleString()}{" "}
          <span>
            | Turno: {t.estadoTurno || "-"} | Pago: {t.estadoPago || "-"}
          </span>
          <button onClick={() => confirmar(t.id)}>Confirmar</button>
        </div>
      ))}
    </div>
  );
}

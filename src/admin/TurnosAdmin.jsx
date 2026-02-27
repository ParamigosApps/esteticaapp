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
      where("estado", "==", "pendiente"),
    );

    const snap = await getDocs(q);
    setTurnos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  async function confirmar(turnoId) {
    const fn = httpsCallable(getFunctions(), "confirmarPagoTurno");
    await fn({ turnoId });
    cargar();
  }

  useEffect(() => {
    cargar();
  }, []);

  return (
    <div>
      <h4>Turnos pendientes</h4>

      {turnos.map((t) => (
        <div key={t.id}>
          {new Date(t.inicio.toMillis()).toLocaleString()}
          <button onClick={() => confirmar(t.id)}>Confirmar</button>
        </div>
      ))}
    </div>
  );
}

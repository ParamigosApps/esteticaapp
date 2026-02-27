import { useState } from "react";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

const db = getFirestore();

export default function ServiciosAdmin() {
  const [nombre, setNombre] = useState("");
  const [duracionMin, setDuracion] = useState(30);
  const [precio, setPrecio] = useState(0);
  const [gabineteId, setGabinete] = useState("gab1");

  async function crearServicio() {
    await addDoc(collection(db, "servicios"), {
      nombre,
      duracionMin: Number(duracionMin),
      precio: Number(precio),
      gabineteId,

      bufferAntesMin: 0,
      bufferDespuesMin: 0,

      montoSeña: 0,
      requierePago: false,
      permiteSeña: false,

      activo: true,
      creadoEn: serverTimestamp(),
    });

    alert("Servicio creado");
  }

  return (
    <div>
      <h4>Servicios</h4>

      <input placeholder="Nombre" onChange={(e) => setNombre(e.target.value)} />
      <input
        type="number"
        placeholder="Duración (min)"
        onChange={(e) => setDuracion(e.target.value)}
      />
      <input
        type="number"
        placeholder="Precio"
        onChange={(e) => setPrecio(e.target.value)}
      />

      <button onClick={crearServicio}>Crear servicio</button>
    </div>
  );
}

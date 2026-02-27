// --------------------------------------------------------------
// src/context/ServiciosContext.jsx
// --------------------------------------------------------------
import { createContext, useContext, useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { db } from "../Firebase";

const ServiciosContext = createContext(null);

export const useServicios = () => useContext(ServiciosContext);

export function ServiciosProvider({ children }) {
  const [servicios, setServicios] = useState([]);
  const [loadingServicios, setLoadingServicios] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, "servicios"),
      where("activo", "==", true),
      orderBy("nombre"),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const lista = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        setServicios(lista);
        setLoadingServicios(false);
      },
      (err) => {
        console.error("Error cargando servicios:", err);
        setLoadingServicios(false);
      },
    );

    return () => unsub();
  }, []);

  return (
    <ServiciosContext.Provider
      value={{
        servicios,
        loadingServicios,
      }}
    >
      {children}
    </ServiciosContext.Provider>
  );
}

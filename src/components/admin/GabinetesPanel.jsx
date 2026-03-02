// --------------------------------------------------
// GabinetesPanel.jsx — MODELO SUBCOLECCIONES
// --------------------------------------------------

import { db } from "../../Firebase";
import {
  collection,
  addDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { useEffect, useState } from "react";

import TimeRangeSelector from "../common/TimeRangeSelector";
import { esRangoValido } from "../../utils/timeUtils";
import HorariosBadges from "../common/HorariosBadges";

function normalizar(str) {
  return str.trim().toLowerCase();
}

// ==================================================
// ITEM GABINETE
// ==================================================
function GabineteItem({ gabinete }) {
  const [horarios, setHorarios] = useState([]);
  const [editando, setEditando] = useState(false);

  const [diaInicio, setDiaInicio] = useState(1);
  const [diaFin, setDiaFin] = useState(6);
  const [modoCarga, setModoCarga] = useState("semana");

  // 🔥 SUBCOLECCIÓN horarios
  useEffect(() => {
    const q = query(
      collection(db, "gabinetes", gabinete.id, "horarios"),
      orderBy("diaSemana"),
    );

    return onSnapshot(q, (snap) => {
      setHorarios(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [gabinete.id]);

  useEffect(() => {
    if (modoCarga === "semana") {
      setDiaInicio(1);
      setDiaFin(6);
    } else if (modoCarga === "dia") {
      setDiaFin(diaInicio);
    }
  }, [modoCarga]);

  useEffect(() => {
    if (modoCarga === "dia") {
      setDiaFin(diaInicio);
    }
  }, [diaInicio, modoCarga]);

  async function agregarRango({ desde, hasta }) {
    if (!esRangoValido(desde, hasta)) {
      alert("La hora 'hasta' debe ser mayor que 'desde'");
      return;
    }

    const dias = [];

    if (modoCarga === "dia") {
      dias.push(diaInicio);
    } else {
      let d = diaInicio;
      while (true) {
        dias.push(d);
        if (d === diaFin) break;
        d = (d + 1) % 7;
      }
    }

    for (const dia of dias) {
      await addDoc(collection(db, "gabinetes", gabinete.id, "horarios"), {
        gabineteId: gabinete.id, // 🔥 agregar esto
        diaSemana: dia,
        desde,
        hasta,
        activo: true,
        creadoEn: serverTimestamp(),
      });
    }

    if (modoCarga === "dia") {
      setDiaInicio((prev) => (prev + 1) % 7);
    }
  }

  async function borrarHorario(id) {
    await deleteDoc(doc(db, "gabinetes", gabinete.id, "horarios", id));
  }

  async function eliminarGabinete() {
    const confirmar = window.confirm(
      `¿Eliminar el gabinete "${gabinete.nombreGabinete}"?\n\nSe borrarán también todos sus horarios.`,
    );
    if (!confirmar) return;

    await deleteDoc(doc(db, "gabinetes", gabinete.id));
  }

  return (
    <div className="service-card">
      <div className="service-header">
        <div className="service-title">{gabinete.nombreGabinete}</div>

        <div className="service-actions">
          <button
            className="swal-btn-editar"
            onClick={() => setEditando(!editando)}
          >
            {editando ? "Cerrar" : "Editar"}
          </button>

          {gabinete.activo ? (
            <button
              className="swal-btn-desactivar"
              onClick={() =>
                updateDoc(doc(db, "gabinetes", gabinete.id), {
                  activo: false,
                })
              }
            >
              Desactivar
            </button>
          ) : (
            <button
              className="swal-btn-desactivar"
              onClick={() =>
                updateDoc(doc(db, "gabinetes", gabinete.id), {
                  activo: true,
                })
              }
            >
              Reactivar
            </button>
          )}

          <button
            className="swal-btn-eliminar"
            onClick={eliminarGabinete}
            style={{ marginLeft: 8 }}
          >
            X
          </button>
        </div>
      </div>

      <div className="service-editor">
        {editando && (
          <>
            <div className="admin-row mb-2">
              <strong>Día:</strong>
              <select
                value={diaInicio}
                onChange={(e) => setDiaInicio(Number(e.target.value))}
              >
                {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map(
                  (d, i) => (
                    <option key={i} value={i}>
                      {d}
                    </option>
                  ),
                )}
              </select>

              {modoCarga === "semana" && (
                <>
                  a
                  <select
                    value={diaFin}
                    onChange={(e) => setDiaFin(Number(e.target.value))}
                  >
                    {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map(
                      (d, i) => (
                        <option key={i} value={i}>
                          {d}
                        </option>
                      ),
                    )}
                  </select>
                </>
              )}
            </div>

            <TimeRangeSelector onAdd={agregarRango} showDay={false} />
          </>
        )}

        {horarios.length === 0 && !editando ? (
          <div className="text-muted">No hay horarios añadidos.</div>
        ) : (
          <HorariosBadges
            horarios={horarios}
            diaKey="diaSemana"
            onDelete={editando ? (h) => borrarHorario(h.id) : undefined}
          />
        )}
      </div>
    </div>
  );
}

// ==================================================
// PANEL PRINCIPAL
// ==================================================
export default function GabinetesPanel() {
  const [gabinetes, setGabinetes] = useState([]);
  const [nombre, setNombre] = useState("");

  useEffect(() => {
    const q = query(collection(db, "gabinetes"), orderBy("creadoEn", "desc"));

    return onSnapshot(q, (snap) => {
      setGabinetes(
        snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })),
      );
    });
  }, []);

  async function crearGabinete() {
    if (!nombre.trim()) return;

    const yaExisteActivo = gabinetes.some(
      (g) => g.activo && normalizar(g.nombreGabinete) === normalizar(nombre),
    );

    if (yaExisteActivo)
      return alert("Ya existe un gabinete activo con ese nombre");

    await addDoc(collection(db, "gabinetes"), {
      nombreGabinete: nombre.trim(),
      activo: true,
      prioridad: 1,
      creadoEn: serverTimestamp(),
    });

    setNombre("");
  }

  return (
    <div className="admin-panel">
      <div className="admin-title">Gabinetes</div>

      <div className="admin-card">
        <div className="admin-row">
          <input
            className="admin-input"
            placeholder="Nombre del gabinete"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
          <button className="swal-btn-guardar" onClick={crearGabinete}>
            Crear gabinete
          </button>
        </div>
      </div>

      {gabinetes.map((g) => (
        <GabineteItem key={g.id} gabinete={g} />
      ))}
    </div>
  );
}

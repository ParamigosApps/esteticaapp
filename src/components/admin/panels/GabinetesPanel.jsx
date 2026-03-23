import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../../../Firebase";
import TimeRangeSelector from "../../common/TimeRangeSelector";
import HorariosBadges from "../../common/HorariosBadges";
import { esRangoValido } from "../../../public/utils/timeUtils";
import {
  swalConfirmDanger,
  swalError,
} from "../../../public/utils/swalUtils.js";

const DIAS = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];

function normalizar(str) {
  return str.trim().toLowerCase();
}

function GabineteItem({ gabinete, gabinetes, editando, onToggleEditar }) {
  const [horarios, setHorarios] = useState([]);
  const [diaInicio, setDiaInicio] = useState(1);
  const [diaFin, setDiaFin] = useState(6);
  const [modoCarga, setModoCarga] = useState("semana");
  const [nombreEditado, setNombreEditado] = useState(
    gabinete.nombreGabinete || "",
  );

  useEffect(() => {
    const horariosQuery = query(
      collection(db, "gabinetes", gabinete.id, "horarios"),
      orderBy("diaSemana"),
    );

    return onSnapshot(horariosQuery, (snap) => {
      setHorarios(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [gabinete.id]);

  useEffect(() => {
    if (modoCarga === "semana") {
      setDiaInicio(1);
      setDiaFin(6);
      return;
    }

    setDiaFin(diaInicio);
  }, [modoCarga, diaInicio]);

  useEffect(() => {
    setNombreEditado(gabinete.nombreGabinete || "");
  }, [gabinete.nombreGabinete]);

  async function agregarRango({ desde, hasta }) {
    if (!esRangoValido(desde, hasta)) {
      await swalError({
        text: "La hora 'hasta' debe ser mayor que 'desde'.",
      });
      return;
    }

    const dias = [];

    if (modoCarga === "dia") {
      dias.push(diaInicio);
    } else {
      let diaActual = diaInicio;
      while (true) {
        dias.push(diaActual);
        if (diaActual === diaFin) break;
        diaActual = (diaActual + 1) % 7;
      }
    }

    const diasDuplicados = dias.filter((dia) =>
      horarios.some(
        (horario) =>
          Number(horario.diaSemana) === dia &&
          String(horario.desde || "").trim() === desde &&
          String(horario.hasta || "").trim() === hasta,
      ),
    );

    if (diasDuplicados.length > 0) {
      const diasTexto = [...new Set(diasDuplicados)]
        .map((dia) => DIAS[dia] || `Dia ${dia}`)
        .join(", ");

      await swalError({
        text: `Ya existe ese horario (${desde} a ${hasta}) para: ${diasTexto}.`,
      });
      return;
    }

    const diasDuplicadosEnFirestore = [];

    for (const dia of dias) {
      const existeDuplicadoQuery = query(
        collection(db, "gabinetes", gabinete.id, "horarios"),
        where("diaSemana", "==", dia),
        where("desde", "==", desde),
        where("hasta", "==", hasta),
        limit(1),
      );

      const existeDuplicadoSnap = await getDocs(existeDuplicadoQuery);
      if (!existeDuplicadoSnap.empty) {
        diasDuplicadosEnFirestore.push(dia);
      }
    }

    if (diasDuplicadosEnFirestore.length > 0) {
      const diasTexto = [...new Set(diasDuplicadosEnFirestore)]
        .map((dia) => DIAS[dia] || `Dia ${dia}`)
        .join(", ");

      await swalError({
        text: `Ese horario ya existe para: ${diasTexto}.`,
      });
      return;
    }

    for (const dia of dias) {
      await addDoc(collection(db, "gabinetes", gabinete.id, "horarios"), {
        gabineteId: gabinete.id,
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

  async function toggleActivo() {
    await updateDoc(doc(db, "gabinetes", gabinete.id), {
      activo: !gabinete.activo,
    });
  }

  async function guardarNombreGabinete() {
    const nombreLimpio = nombreEditado.trim();

    if (!nombreLimpio) {
      await swalError({
        text: "Ingresa un nombre para el gabinete.",
      });
      return;
    }

    const yaExisteActivo = gabinetes.some(
      (item) =>
        item.id !== gabinete.id &&
        item.activo &&
        normalizar(item.nombreGabinete || "") === normalizar(nombreLimpio),
    );

    if (yaExisteActivo) {
      await swalError({
        text: "Ya existe un gabinete activo con ese nombre.",
      });
      return;
    }

    await updateDoc(doc(db, "gabinetes", gabinete.id), {
      nombreGabinete: nombreLimpio,
    });
  }

  async function eliminarGabinete() {
    const confirmar = await swalConfirmDanger({
      title: "Eliminar gabinete",
      html: `Se eliminara <b>${gabinete.nombreGabinete}</b> y tambien sus horarios.`,
      confirmText: "Eliminar",
    });
    if (!confirmar?.isConfirmed) return;

    await deleteDoc(doc(db, "gabinetes", gabinete.id));
  }

  return (
    <article
      className={`gabinete-card ${!gabinete.activo ? "gabinete-card-inactive" : ""}`}
    >
      <div className="gabinete-card-head">
        <div className="gabinete-card-copy">
          <span className="gabinete-card-kicker">Gabinete</span>
          <div className="gabinete-card-title-row">
            <h3 className="gabinete-card-title">{gabinete.nombreGabinete}</h3>
            <span
              className={`gabinete-status ${gabinete.activo ? "is-active" : "is-inactive"}`}
            >
              {gabinete.activo ? "Activo" : "Inactivo"}
            </span>
          </div>
          <div className="gabinete-card-meta">
            <span>{horarios.length} rango(s) cargado(s)</span>
            <span>{editando ? "Modo edicion" : "Vista general"}</span>
          </div>
        </div>

        <div className="service-actions gabinete-card-actions">
          <button
            type="button"
            className="swal-btn-editar"
            onClick={onToggleEditar}
          >
            {editando ? "Cerrar" : "Editar"}
          </button>

          <button
            type="button"
            className="swal-btn-desactivar"
            onClick={toggleActivo}
          >
            {gabinete.activo ? "Desactivar" : "Reactivar"}
          </button>

          {!gabinete.activo ? (
            <button
              type="button"
              className="swal-btn-eliminar"
              onClick={eliminarGabinete}
            >
              Eliminar
            </button>
          ) : null}
        </div>
      </div>

      {editando ? (
        <div className="gabinete-editor-shell">
          <div className="gabinete-rename-row">
            <div className="field-group gabinete-field">
              <label htmlFor={`nombre-${gabinete.id}`}>
                Nombre del gabinete
              </label>
              <input
                id={`nombre-${gabinete.id}`}
                className="admin-input gabinete-input"
                value={nombreEditado}
                onChange={(e) => setNombreEditado(e.target.value)}
                placeholder="Nombre del gabinete"
              />
            </div>

            <button
              type="button"
              className="swal-btn-guardar"
              onClick={guardarNombreGabinete}
            >
              Guardar
            </button>
          </div>

          <div className="gabinete-editor-top">
            <div className="field-group gabinete-field">
              <label htmlFor={`modo-${gabinete.id}`}>Modo de carga</label>
              <select
                id={`modo-${gabinete.id}`}
                className="admin-input"
                value={modoCarga}
                onChange={(e) => setModoCarga(e.target.value)}
              >
                <option value="semana">Varios dias</option>
                <option value="dia">Un dia</option>
              </select>
            </div>

            <div className="field-group gabinete-field">
              <label htmlFor={`dia-inicio-${gabinete.id}`}>Dia inicial</label>
              <select
                id={`dia-inicio-${gabinete.id}`}
                className="admin-input"
                value={diaInicio}
                onChange={(e) => setDiaInicio(Number(e.target.value))}
              >
                {DIAS.map((dia, index) => (
                  <option key={dia} value={index}>
                    {dia}
                  </option>
                ))}
              </select>
            </div>

            {modoCarga === "semana" && (
              <div className="field-group gabinete-field">
                <label htmlFor={`dia-fin-${gabinete.id}`}>Dia final</label>
                <select
                  id={`dia-fin-${gabinete.id}`}
                  className="admin-input"
                  value={diaFin}
                  onChange={(e) => setDiaFin(Number(e.target.value))}
                >
                  {DIAS.map((dia, index) => (
                    <option key={dia} value={index}>
                      {dia}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="gabinete-time-shell">
            <TimeRangeSelector onAdd={agregarRango} showDay={false} />
          </div>
        </div>
      ) : null}

      <div className="gabinete-schedule-block">
        <div className="gabinete-schedule-head">
          <strong>Horarios cargados</strong>
          <span>
            {horarios.length
              ? "Toca editar para quitar rangos"
              : "Todavia no tiene disponibilidad"}
          </span>
        </div>

        {horarios.length === 0 ? (
          <div className="gabinete-empty">
            Sin horarios cargados. Agrega rangos para habilitar este gabinete.
          </div>
        ) : (
          <HorariosBadges
            horarios={horarios}
            diaKey="diaSemana"
            onDelete={
              editando ? (horario) => borrarHorario(horario.id) : undefined
            }
          />
        )}
      </div>
    </article>
  );
}

export default function GabinetesPanel() {
  const [gabinetes, setGabinetes] = useState([]);
  const [nombre, setNombre] = useState("");
  const [gabineteEditandoId, setGabineteEditandoId] = useState(null);

  useEffect(() => {
    const gabinetesQuery = query(
      collection(db, "gabinetes"),
      orderBy("creadoEn", "desc"),
    );

    return onSnapshot(gabinetesQuery, (snap) => {
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

    if (yaExisteActivo) {
      await swalError({
        text: "Ya existe un gabinete activo con ese nombre.",
      });
      return;
    }

    await addDoc(collection(db, "gabinetes"), {
      nombreGabinete: nombre.trim(),
      activo: true,
      prioridad: 1,
      creadoEn: serverTimestamp(),
    });

    setNombre("");
  }

  return (
    <div className="admin-panel gabinetes-admin-page">
      <section className="gabinetes-hero">
        <div className="gabinetes-hero-copy">
          <span className="gabinetes-eyebrow">Agenda y espacios</span>
          <div className="admin-title">Gabinetes</div>
          <p>
            Organiza los espacios disponibles, define sus horarios y mantiene
            una lectura mas clara del estado de cada gabinete.
          </p>
        </div>

        <div className="gabinetes-hero-stats">
          <div className="gabinetes-stat">
            <strong>{gabinetes.length}</strong>
            <span>gabinetes totales</span>
          </div>
          <div className="gabinetes-stat gabinetes-stat-soft">
            <strong>{gabinetes.filter((g) => g.activo).length}</strong>
            <span>activos</span>
          </div>
        </div>
      </section>

      <section className="gabinetes-create-card">
        <div className="gabinetes-create-copy">
          <span className="gabinetes-section-kicker">Alta rapida</span>
          <h3>Crear nuevo gabinete</h3>
          <p>
            Agrega un nombre y luego carga su disponibilidad por dia o por
            semana.
          </p>
        </div>

        <div className="gabinetes-create-form">
          <input
            className="admin-input gabinete-input"
            placeholder="Nombre del gabinete"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
          <button
            type="button"
            className="swal-btn-guardar"
            onClick={crearGabinete}
          >
            Crear gabinete
          </button>
        </div>
      </section>

      <section className="gabinetes-grid">
        {gabinetes.map((gabinete) => (
          <GabineteItem
            key={gabinete.id}
            gabinete={gabinete}
            gabinetes={gabinetes}
            editando={gabineteEditandoId === gabinete.id}
            onToggleEditar={() =>
              setGabineteEditandoId((prev) =>
                prev === gabinete.id ? null : gabinete.id,
              )
            }
          />
        ))}
      </section>
    </div>
  );
}

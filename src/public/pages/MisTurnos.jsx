// src/pages/MisTurnos.jsx
import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";

import { db } from "../../Firebase";
import { getFunctions, httpsCallable } from "firebase/functions";

import { useAuth } from "../../context/AuthContext";
import { generarSlotsDia } from "../../public/utils/generarSlotsDia";

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  where,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

const HORA_CANCELACION_MINIMA = 48;
const functions = getFunctions(undefined, "us-central1");

const ESTADO_TURNO_LABEL = {
  confirmado: "Confirmado",
  pendiente: "Pendiente",
  pendiente_aprobacion: "Pendiente de aprobación",
  cancelado: "Cancelado por usuario",
  rechazado: "Rechazado",
  perdido: "Perdido",
  finalizado: "Finalizado",
};

const ESTADO_PAGO_LABEL = {
  pendiente: "Pago no realizado",
  pendiente_aprobacion: "Pago en revisión",
  parcial: "Pago parcial",
  abonado: "Abonado",
  rechazado: "Pago rechazado",
  expirado: "Pago expirado",
  reembolsado: "Reembolsado",
};

function getEstadoTurno(turno) {
  if (turno?.estadoTurno) return turno.estadoTurno;

  switch (turno?.estado) {
    case "pendiente_pago":
    case "pendiente_pago_mp":
      return "pendiente";
    case "pendiente_aprobacion":
      return "pendiente_aprobacion";
    case "señado":
    case "confirmado":
      return "confirmado";
    case "cancelado":
      return "cancelado";
    case "rechazado":
      return "rechazado";
    case "vencido":
    case "expirado":
      return "cancelado";
    default:
      return "pendiente";
  }
}

function getEstadoPago(turno) {
  if (turno?.estadoPago) return turno.estadoPago;

  switch (turno?.estado) {
    case "pendiente_pago":
    case "pendiente_pago_mp":
      return "pendiente";
    case "pendiente_aprobacion":
      return "pendiente_aprobacion";
    case "señado":
      return "parcial";
    case "confirmado": {
      const total = Number(
        turno?.montoTotal ?? turno?.precioTotal ?? turno?.total ?? 0,
      );
      const pagado = Number(turno?.montoPagado ?? turno?.pagadoTotal ?? 0);
      if (total > 0 && pagado > 0 && pagado < total) return "parcial";
      if (total > 0 && pagado >= total) return "abonado";
      return total > 0 ? "pendiente" : "abonado";
    }
    case "rechazado":
      return "rechazado";
    case "vencido":
    case "expirado":
      return "expirado";
    default:
      return "pendiente";
  }
}

function getMontos(turno) {
  const total = Number(
    turno?.montoTotal ?? turno?.precioTotal ?? turno?.total ?? 0,
  );

  const anticipo = Number(
    turno?.montoAnticipo ?? turno?.montoSena ?? turno?.seña ?? turno?.sena ?? 0,
  );

  let pagado = Number(turno?.montoPagado ?? turno?.pagadoTotal ?? 0);

  if (!pagado) {
    if (turno?.estado === "señado") {
      pagado = anticipo;
    } else if (getEstadoPago(turno) === "abonado" && total > 0) {
      pagado = total;
    }
  }

  const saldoPendiente = Math.max(
    0,
    Number(turno?.saldoPendiente ?? total - pagado),
  );

  return { total, anticipo, pagado, saldoPendiente };
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatHora(ms) {
  if (!ms) return "--:--";
  const d = new Date(Number(ms));
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

function formatFechaISO(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return dt.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function humanizeDiff(msDiff) {
  const abs = Math.abs(msDiff);
  const min = Math.floor(abs / 60000);
  const h = Math.floor(min / 60);
  const d = Math.floor(h / 24);

  if (d >= 2) return `${d} días`;
  if (d === 1) return `1 día`;
  if (h >= 2) return `${h} horas`;
  if (h === 1) return `1 hora`;
  if (min >= 2) return `${min} min`;
  if (min === 1) return `1 min`;
  return `menos de 1 min`;
}

function buildGoogleCalendarUrl({ title, details, location, startMs, endMs }) {
  const toGCal = (ms) => {
    const d = new Date(ms);
    return (
      d.getUTCFullYear() +
      pad2(d.getUTCMonth() + 1) +
      pad2(d.getUTCDate()) +
      "T" +
      pad2(d.getUTCHours()) +
      pad2(d.getUTCMinutes()) +
      pad2(d.getUTCSeconds()) +
      "Z"
    );
  };

  const dates = `${toGCal(startMs)}/${toGCal(endMs || startMs + 30 * 60000)}`;

  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", title || "Turno");
  url.searchParams.set("details", details || "");
  url.searchParams.set("location", location || "");
  url.searchParams.set("dates", dates);
  return url.toString();
}

function canCancelTurno(turno) {
  if (!turno) return false;

  const estadoTurno = getEstadoTurno(turno);
  if (
    ["cancelado", "rechazado", "perdido", "finalizado"].includes(estadoTurno)
  ) {
    return false;
  }

  const start = Number(turno.horaInicio || 0);
  if (!start) return false;

  const diffH = (start - Date.now()) / 3600000;
  return diffH >= HORA_CANCELACION_MINIMA;
}

function canReprogramTurno(turno) {
  if (!turno) return false;

  const estadoTurno = getEstadoTurno(turno);
  if (
    ["cancelado", "rechazado", "perdido", "finalizado"].includes(estadoTurno)
  ) {
    return false;
  }

  const start = Number(turno.horaInicio || 0);
  if (!start) return false;

  const diffH = (start - Date.now()) / 3600000;
  if (diffH < HORA_CANCELACION_MINIMA) return false;

  const count = Number(turno.reprogramacionesCount || 0);
  return count < 1;
}

export default function MisTurnos() {
  const { user } = useAuth();

  const [turnos, setTurnos] = useState([]);
  const [loading, setLoading] = useState(true);

  const [social, setSocial] = useState(null);
  const [ubicacion, setUbicacion] = useState(null);

  const [expanded, setExpanded] = useState({});

  // -------- turnos del cliente --------
  useEffect(() => {
    if (!user?.uid) return;

    const q = query(
      collection(db, "turnos"),
      where("clienteId", "==", user.uid),
      orderBy("fecha", "desc"),
      orderBy("horaInicio", "desc"),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setTurnos(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          })),
        );
        setLoading(false);
      },
      (err) => {
        console.error("MisTurnos snapshot error:", err);
        setLoading(false);
      },
    );

    return () => unsub();
  }, [user?.uid]);

  // -------- config del negocio --------
  useEffect(() => {
    const unsubSocial = onSnapshot(
      doc(db, "configuracion", "social"),
      (snap) => {
        if (snap.exists()) setSocial(snap.data());
      },
    );

    const unsubUbic = onSnapshot(
      doc(db, "configuracion", "ubicacion"),
      (snap) => {
        if (snap.exists()) setUbicacion(snap.data());
      },
    );

    return () => {
      unsubSocial();
      unsubUbic();
    };
  }, []);

  const { proximos, historial } = useMemo(() => {
    const now = Date.now();

    const sorted = [...turnos].sort((a, b) => {
      const aa = Number(a.horaInicio || 0);
      const bb = Number(b.horaInicio || 0);
      return bb - aa;
    });

    const prox = [];
    const hist = [];

    for (const t of sorted) {
      const start = Number(t.horaInicio || 0);
      const estadoTurno = getEstadoTurno(t);

      if (!start) {
        hist.push(t);
        continue;
      }

      if (
        start >= now &&
        !["cancelado", "rechazado", "perdido", "finalizado"].includes(
          estadoTurno,
        )
      ) {
        prox.push(t);
      } else {
        hist.push(t);
      }
    }

    prox.sort((a, b) => Number(a.horaInicio || 0) - Number(b.horaInicio || 0));

    return { proximos: prox, historial: hist };
  }, [turnos]);

  async function cancelarTurno(turno) {
    if (!turno?.id) return;

    const ok = canCancelTurno(turno);
    if (!ok) {
      Swal.fire({
        icon: "warning",
        title: "No se puede cancelar",
        text: `Solo se puede cancelar con al menos ${HORA_CANCELACION_MINIMA} horas de anticipación.`,
        confirmButtonText: "Entendido",
        customClass: { confirmButton: "swal-btn-confirm" },
      });
      return;
    }

    const { anticipo } = getMontos(turno);

    const res = await Swal.fire({
      icon: "question",
      title: "¿Cancelar turno?",
      html: `
        <div style="text-align:left;font-size:14px;">
          <div><b>Servicio:</b> ${turno.nombreServicio || "-"}</div>
          <div><b>Fecha:</b> ${formatFechaISO(turno.fecha)}</div>
          <div><b>Hora:</b> ${formatHora(turno.horaInicio)}</div>
          ${
            anticipo > 0
              ? `<div style="margin-top:8px;color:#b02a37;"><b>Importante:</b> si cancelás, perdés la seña de $${anticipo.toLocaleString("es-AR")}.</div>`
              : ""
          }
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Sí, cancelar",
      cancelButtonText: "Volver",
      customClass: {
        confirmButton: "swal-btn-confirm",
        cancelButton: "swal-btn-cancel",
      },
    });

    if (!res.isConfirmed) return;

    await updateDoc(doc(db, "turnos", turno.id), {
      estadoTurno: "cancelado",
      canceladoAt: serverTimestamp(),
      canceladoPor: "cliente",
      anticipoPerdido: anticipo > 0,
      montoAnticipoPerdido: anticipo,
      updatedAt: serverTimestamp(),
    });

    Swal.fire({
      icon: "success",
      title: "Turno cancelado",
      text: "Listo. Tu turno fue cancelado correctamente.",
      confirmButtonText: "Ok",
      customClass: { confirmButton: "swal-btn-confirm" },
    });
  }

  async function reprogramarTurno(turno) {
    if (!turno?.id || !turno?.servicioId) return;

    const ok = canReprogramTurno(turno);
    if (!ok) {
      Swal.fire({
        icon: "warning",
        title: "No se puede reprogramar",
        text: `Solo se puede reprogramar con al menos ${HORA_CANCELACION_MINIMA} horas de anticipación y máximo 1 vez.`,
        confirmButtonText: "Entendido",
        customClass: { confirmButton: "swal-btn-confirm" },
      });
      return;
    }

    const fechaMin = new Date(Date.now() + HORA_CANCELACION_MINIMA * 3600000)
      .toISOString()
      .slice(0, 10);

    const { value: fechaElegida } = await Swal.fire({
      title: "Elegí una nueva fecha",
      input: "date",
      inputValue: turno.fecha || "",
      inputAttributes: {
        min: fechaMin,
      },
      showCancelButton: true,
      confirmButtonText: "Ver horarios",
      cancelButtonText: "Volver",
      customClass: {
        confirmButton: "swal-btn-confirm",
        cancelButton: "swal-btn-cancel",
      },
      inputValidator: (value) => {
        if (!value) return "Elegí una fecha";
        return null;
      },
    });

    if (!fechaElegida) return;

    try {
      const servicioSnap = await getDoc(doc(db, "servicios", turno.servicioId));

      if (!servicioSnap.exists()) {
        throw new Error("Servicio no encontrado");
      }

      const servicio = {
        id: servicioSnap.id,
        ...servicioSnap.data(),
      };

      const gabineteIds = Array.isArray(servicio.gabinetes)
        ? servicio.gabinetes
            .map((g) => String(g?.id || "").trim())
            .filter(Boolean)
        : [];

      if (!gabineteIds.length) {
        throw new Error("El servicio no tiene gabinetes configurados");
      }

      const getAgenda = httpsCallable(functions, "getAgendaGabinete");

      const agendaResp = await getAgenda({
        gabineteIds,
        fecha: fechaElegida,
      });

      const agenda = agendaResp?.data || {
        horarios: [],
        bloqueos: [],
        turnos: [],
      };

      const fechaObj = new Date(`${fechaElegida}T00:00:00`);
      const slots = generarSlotsDia(agenda, servicio, fechaObj).filter(
        (s) => !s.ocupado,
      );

      if (!slots.length) {
        Swal.fire({
          icon: "info",
          title: "Sin disponibilidad",
          text: "No hay horarios disponibles para esa fecha.",
          confirmButtonText: "Entendido",
          customClass: { confirmButton: "swal-btn-confirm" },
        });
        return;
      }

      const htmlSlots = slots
        .map((slot) => {
          const hora = formatHora(slot.inicio);
          return `
            <button
              type="button"
              class="slot-reprogramar-btn"
              data-inicio="${slot.inicio}"
              data-fin="${slot.fin}"
              style="
                border:1px solid #d0d7de;
                background:#fff;
                border-radius:10px;
                padding:10px 12px;
                cursor:pointer;
                font-weight:600;
              "
            >
              ${hora}
            </button>
          `;
        })
        .join("");

      let slotSeleccionado = null;

      const seleccion = await Swal.fire({
        title: "Elegí un horario disponible",
        html: `
          <div style="text-align:left;font-size:14px;margin-bottom:12px;">
            <b>Fecha:</b> ${formatFechaISO(fechaElegida)}
          </div>
          <div
            id="slots-reprogramacion"
            style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;"
          >
            ${htmlSlots}
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: "Confirmar reprogramación",
        cancelButtonText: "Volver",
        customClass: {
          confirmButton: "swal-btn-confirm",
          cancelButton: "swal-btn-cancel",
        },
        didOpen: () => {
          const botones = document.querySelectorAll(".slot-reprogramar-btn");

          botones.forEach((btn) => {
            btn.addEventListener("click", () => {
              botones.forEach((b) => {
                b.style.background = "#fff";
                b.style.color = "#111";
                b.style.border = "1px solid #d0d7de";
              });

              btn.style.background = "#111";
              btn.style.color = "#fff";
              btn.style.border = "1px solid #111";

              slotSeleccionado = {
                inicio: Number(btn.dataset.inicio),
                fin: Number(btn.dataset.fin),
              };
            });
          });
        },
        preConfirm: () => {
          if (!slotSeleccionado) {
            Swal.showValidationMessage("Elegí un horario");
            return false;
          }
          return slotSeleccionado;
        },
      });

      if (!seleccion.isConfirmed || !seleccion.value) return;

      const callable = httpsCallable(functions, "reprogramarTurnoInteligente");

      const resp = await callable({
        turnoId: turno.id,
        fecha: fechaElegida,
        horaInicio: seleccion.value.inicio,
        horaFin: seleccion.value.fin,
      });

      const data = resp?.data || {};

      await Swal.fire({
        icon: "success",
        title: "Turno reprogramado",
        html: `
          <div style="text-align:left;font-size:14px;">
            <div><b>Nueva fecha:</b> ${formatFechaISO(data.fecha || fechaElegida)}</div>
            <div><b>Nueva hora:</b> ${formatHora(data.horaInicio || seleccion.value.inicio)}</div>
            <div><b>Gabinete:</b> ${data.nombreGabinete || "-"}</div>
          </div>
        `,
        confirmButtonText: "Ok",
        customClass: { confirmButton: "swal-btn-confirm" },
      });
    } catch (error) {
      console.error("Error reprogramando turno:", error);

      Swal.fire({
        icon: "error",
        title: "No se pudo reprogramar",
        text:
          error?.message?.replace("FirebaseError: ", "") ||
          "Ocurrió un error al intentar reprogramar el turno.",
        confirmButtonText: "Entendido",
        customClass: { confirmButton: "swal-btn-confirm" },
      });
    }
  }

  function abrirWhatsappTurno(turno) {
    const nro = String(social?.whatsappContacto || "").trim();
    if (!nro) return;

    const estadoTurno = getEstadoTurno(turno);
    const estadoPago = getEstadoPago(turno);

    const msg = [
      "Hola! Quería consultar por mi turno:",
      `• Servicio: ${turno?.nombreServicio || "-"}`,
      `• Fecha: ${formatFechaISO(turno?.fecha)}`,
      `• Hora: ${formatHora(turno?.horaInicio)}`,
      `• Estado turno: ${ESTADO_TURNO_LABEL[estadoTurno] || estadoTurno || "-"}`,
      `• Estado pago: ${ESTADO_PAGO_LABEL[estadoPago] || estadoPago || "-"}`,
    ].join("\n");

    const url = `https://wa.me/54${nro}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function addToCalendar(turno) {
    const startMs = Number(turno?.horaInicio || 0);
    const endMs = Number(turno?.horaFin || 0) || startMs + 60 * 60000;

    if (!startMs) return;

    const estadoTurno = getEstadoTurno(turno);
    const estadoPago = getEstadoPago(turno);

    const title = `Turno: ${turno?.nombreServicio || "Servicio"}`;
    const details = [
      `Estado turno: ${ESTADO_TURNO_LABEL[estadoTurno] || estadoTurno || ""}`,
      `Estado pago: ${ESTADO_PAGO_LABEL[estadoPago] || estadoPago || ""}`,
    ].join("\n");

    const location = ubicacion?.mapsDireccion || "";

    const url = buildGoogleCalendarUrl({
      title,
      details,
      location,
      startMs,
      endMs,
    });

    window.open(url, "_blank", "noopener,noreferrer");
  }

  function badgeClassTurno(estadoTurno) {
    if (estadoTurno === "confirmado") return "badge bg-success";
    if (estadoTurno === "pendiente") return "badge bg-warning text-dark";
    if (estadoTurno === "pendiente_aprobacion")
      return "badge bg-info text-dark";
    if (estadoTurno === "cancelado") return "badge bg-danger";
    if (estadoTurno === "rechazado") return "badge bg-danger";
    if (estadoTurno === "perdido") return "badge bg-secondary";
    if (estadoTurno === "finalizado") return "badge bg-primary";
    return "badge bg-secondary";
  }

  function badgeClassPago(estadoPago) {
    if (estadoPago === "abonado") return "badge bg-success";
    if (estadoPago === "parcial") return "badge bg-primary";
    if (estadoPago === "pendiente") return "badge bg-warning text-dark";
    if (estadoPago === "pendiente_aprobacion") return "badge bg-info text-dark";
    if (estadoPago === "rechazado") return "badge bg-danger";
    if (estadoPago === "expirado") return "badge bg-secondary";
    if (estadoPago === "reembolsado") return "badge bg-dark";
    return "badge bg-secondary";
  }

  function TurnoCard({ t, isProximo }) {
    const start = Number(t.horaInicio || 0);
    const diff = start ? start - Date.now() : null;

    const estadoTurno = getEstadoTurno(t);
    const estadoPago = getEstadoPago(t);
    const { total, anticipo, pagado, saldoPendiente } = getMontos(t);

    const isExpanded = !!expanded[t.id];

    return (
      <div className="card mb-3">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-start gap-3">
            <div style={{ minWidth: 0 }}>
              <div className="d-flex align-items-center gap-2 flex-wrap">
                <strong style={{ fontSize: 16 }}>
                  {t.nombreServicio || "Servicio"}
                </strong>

                <span className={badgeClassTurno(estadoTurno)}>
                  {ESTADO_TURNO_LABEL[estadoTurno] || estadoTurno || "—"}
                </span>

                <span className={badgeClassPago(estadoPago)}>
                  {ESTADO_PAGO_LABEL[estadoPago] || estadoPago || "—"}
                </span>
              </div>

              <div className="text-muted" style={{ fontSize: 14 }}>
                {t.fecha ? formatFechaISO(t.fecha) : "Fecha —"}{" "}
                {start ? `· ${formatHora(t.horaInicio)}` : ""}
                {isProximo && diff !== null && diff > 0 && (
                  <span>
                    {" "}
                    · <b>En {humanizeDiff(diff)}</b>
                  </span>
                )}
              </div>

              {!!ubicacion?.mapsDireccion && (
                <div className="text-muted" style={{ fontSize: 13 }}>
                  📍 {ubicacion.mapsDireccion}
                </div>
              )}
            </div>

            <div className="text-end" style={{ whiteSpace: "nowrap" }}>
              {total > 0 && (
                <div style={{ fontSize: 14 }}>
                  <div>
                    Total: <b>${total.toLocaleString("es-AR")}</b>
                  </div>
                  {anticipo > 0 && (
                    <div>
                      Seña: <b>${anticipo.toLocaleString("es-AR")}</b>
                    </div>
                  )}
                  <div>
                    Pagado: <b>${pagado.toLocaleString("es-AR")}</b>
                  </div>
                  <div className="text-muted" style={{ fontSize: 13 }}>
                    Saldo: ${saldoPendiente.toLocaleString("es-AR")}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="d-flex flex-wrap gap-2 mt-3">
            {ubicacion?.mapsLink && (
              <a
                href={ubicacion.mapsLink}
                target="_blank"
                rel="noreferrer"
                className="btn btn-outline-secondary btn-sm"
              >
                Cómo llegar
              </a>
            )}

            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => addToCalendar(t)}
              disabled={!t.horaInicio}
            >
              Agregar a calendario
            </button>

            {social?.whatsappContacto && (
              <button
                type="button"
                className="btn btn-outline-success btn-sm"
                onClick={() => abrirWhatsappTurno(t)}
              >
                WhatsApp
              </button>
            )}

            {isProximo && (
              <>
                <button
                  type="button"
                  className="btn btn-outline-primary btn-sm"
                  onClick={() => reprogramarTurno(t)}
                  disabled={!canReprogramTurno(t)}
                  title={
                    canReprogramTurno(t)
                      ? ""
                      : `Reprogramable con ${HORA_CANCELACION_MINIMA}h de anticipación y máximo 1 vez`
                  }
                >
                  Reprogramar
                </button>

                <button
                  type="button"
                  className="btn btn-outline-danger btn-sm"
                  onClick={() => cancelarTurno(t)}
                  disabled={!canCancelTurno(t)}
                  title={
                    canCancelTurno(t)
                      ? ""
                      : `Cancelable con ${HORA_CANCELACION_MINIMA}h de anticipación`
                  }
                >
                  Cancelar turno
                </button>
              </>
            )}

            <button
              type="button"
              className="btn btn-link btn-sm"
              onClick={() => setExpanded((p) => ({ ...p, [t.id]: !p[t.id] }))}
            >
              {isExpanded ? "Ocultar detalle" : "Ver detalle"}
            </button>
          </div>

          {isExpanded && (
            <div
              className="mt-3 p-3"
              style={{
                background: "#f8f9fa",
                borderRadius: 10,
                fontSize: 13,
              }}
            >
              <div>
                <b>ID turno:</b> {t.id}
              </div>
              <div>
                <b>Estado turno:</b>{" "}
                {ESTADO_TURNO_LABEL[estadoTurno] || estadoTurno || "-"}
              </div>
              <div>
                <b>Estado pago:</b>{" "}
                {ESTADO_PAGO_LABEL[estadoPago] || estadoPago || "-"}
              </div>
              {!!t.metodoPago && (
                <div>
                  <b>Método pago:</b> {t.metodoPago}
                </div>
              )}
              {!!t.tipoAnticipo && (
                <div>
                  <b>Tipo anticipo:</b> {t.tipoAnticipo}
                </div>
              )}
              {!!(t.nombreGabinete || t.gabineteId) && (
                <div>
                  <b>Gabinete:</b> {t.nombreGabinete || t.gabineteId}
                </div>
              )}
              {!!t.servicioId && (
                <div>
                  <b>Servicio ID:</b> {t.servicioId}
                </div>
              )}
              {!!t.pagoId && (
                <div>
                  <b>Pago ID:</b> {t.pagoId}
                </div>
              )}
              {typeof t.montoTotal !== "undefined" && (
                <>
                  <div>
                    <b>Monto total:</b> ${total.toLocaleString("es-AR")}
                  </div>
                  <div>
                    <b>Monto pagado:</b> ${pagado.toLocaleString("es-AR")}
                  </div>
                  <div>
                    <b>Saldo pendiente:</b> $
                    {saldoPendiente.toLocaleString("es-AR")}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!user?.uid) {
    return (
      <div className="container py-4">
        <h4>Mis turnos</h4>
        <p className="text-muted">Iniciá sesión para ver tus turnos.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container py-4">
        <h4>Mis turnos</h4>
        <p>Cargando...</p>
      </div>
    );
  }

  return (
    <div className="container py-4">
      <h4 className="mb-3">Mis turnos</h4>

      <div className="d-flex align-items-center justify-content-between mb-2">
        <h6 className="mb-0">Próximos</h6>
        <span className="text-muted" style={{ fontSize: 13 }}>
          {proximos.length} turno(s)
        </span>
      </div>

      {proximos.length === 0 ? (
        <p className="text-muted">No tenés turnos próximos.</p>
      ) : (
        proximos.map((t) => <TurnoCard key={t.id} t={t} isProximo />)
      )}

      <hr className="my-4" />

      <div className="d-flex align-items-center justify-content-between mb-2">
        <h6 className="mb-0">Historial</h6>
        <span className="text-muted" style={{ fontSize: 13 }}>
          {historial.length} turno(s)
        </span>
      </div>

      {historial.length === 0 ? (
        <p className="text-muted">Todavía no tenés turnos en el historial.</p>
      ) : (
        historial.map((t) => <TurnoCard key={t.id} t={t} isProximo={false} />)
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";

import { db } from "../../Firebase";
import { getFunctions, httpsCallable } from "firebase/functions";

import { useAuth } from "../../context/AuthContext";
import { generarSlotsDia } from "../../public/utils/generarSlotsDia";
import { hideLoading, showLoading } from "../../services/loadingService.js";

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
  pendiente_aprobacion: "Pendiente de aprobacion",
  cancelado: "Cancelado por usuario",
  rechazado: "Rechazado",
  perdido: "Perdido",
  finalizado: "Finalizado",
};

const ESTADO_PAGO_LABEL = {
  pendiente: "Pago no realizado",
  pendiente_aprobacion: "Pago en revision",
  parcial: "Pago parcial",
  abonado: "Abonado",
  rechazado: "Pago rechazado",
  expirado: "Pago expirado",
  reembolsado: "Reembolsado",
};

function getMaxReprogramacionesUsuario(reservasConfig = {}) {
  return Math.max(0, Number(reservasConfig?.maxReprogramacionesUsuario ?? 1));
}

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

function formatFechaCortaISO(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return dt.toLocaleDateString("es-AR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function sumarDiasISO(iso, dias) {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  const base = new Date(y, (m || 1) - 1, d || 1);
  base.setDate(base.getDate() + dias);
  return `${base.getFullYear()}-${pad2(base.getMonth() + 1)}-${pad2(
    base.getDate(),
  )}`;
}

function humanizeDiff(msDiff) {
  const abs = Math.abs(msDiff);
  const min = Math.floor(abs / 60000);
  const h = Math.floor(min / 60);
  const d = Math.floor(h / 24);

  if (d >= 2) return `${d} dias`;
  if (d === 1) return "1 dia";
  if (h >= 2) return `${h} horas`;
  if (h === 1) return "1 hora";
  if (min >= 2) return `${min} min`;
  if (min === 1) return "1 min";
  return "menos de 1 min";
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

function canReprogramTurno(turno, reservasConfig = {}) {
  if (!turno) return false;
  if (reservasConfig?.permitirReprogramacionUsuario === false) return false;
  const maxReprogramaciones = Math.max(
    0,
    Number(reservasConfig?.maxReprogramacionesUsuario ?? 1),
  );
  if (maxReprogramaciones < 1) return false;

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
  return count < maxReprogramaciones;
}

function getTurnoTone(estadoTurno) {
  if (estadoTurno === "confirmado") return "success";
  if (estadoTurno === "pendiente" || estadoTurno === "pendiente_aprobacion") {
    return "warning";
  }
  if (estadoTurno === "finalizado") return "info";
  return "danger";
}

function getPagoTone(estadoPago) {
  if (estadoPago === "abonado") return "success";
  if (estadoPago === "parcial") return "info";
  if (estadoPago === "pendiente" || estadoPago === "pendiente_aprobacion") {
    return "warning";
  }
  return "danger";
}

export default function MisTurnos() {
  const { user } = useAuth();

  const [turnos, setTurnos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [social, setSocial] = useState(null);
  const [ubicacion, setUbicacion] = useState(null);
  const [reservasConfig, setReservasConfig] = useState({
    permitirReprogramacionUsuario: true,
  });

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

    const unsubReservas = onSnapshot(
      doc(db, "configuracion", "reservas"),
      (snap) => {
        if (!snap.exists()) return;
        setReservasConfig((current) => ({
          ...current,
          ...snap.data(),
        }));
      },
    );

    return () => {
      unsubSocial();
      unsubUbic();
      unsubReservas();
    };
  }, []);

  const { proximos, pendientes, historial } = useMemo(() => {
    const now = Date.now();
    const sorted = [...turnos].sort(
      (a, b) => Number(b.horaInicio || 0) - Number(a.horaInicio || 0),
    );

    const prox = [];
    const pend = [];
    const hist = [];

    for (const t of sorted) {
      const start = Number(t.horaInicio || 0);
      const estadoTurno = getEstadoTurno(t);
      const estadoPago = getEstadoPago(t);
      const requiereGestion =
        estadoTurno === "pendiente" ||
        estadoTurno === "pendiente_aprobacion" ||
        estadoPago === "pendiente" ||
        estadoPago === "pendiente_aprobacion";

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
        if (requiereGestion) {
          pend.push(t);
        } else {
          prox.push(t);
        }
      } else {
        hist.push(t);
      }
    }

    prox.sort((a, b) => Number(a.horaInicio || 0) - Number(b.horaInicio || 0));
    pend.sort((a, b) => Number(a.horaInicio || 0) - Number(b.horaInicio || 0));

    return { proximos: prox, pendientes: pend, historial: hist };
  }, [turnos]);

  async function cancelarTurno(turno) {
    if (!turno?.id) return;

    if (!canCancelTurno(turno)) {
      Swal.fire({
        icon: "warning",
        title: "No se puede cancelar",
        text: `Solo se puede cancelar con al menos ${HORA_CANCELACION_MINIMA} horas de anticipacion.`,
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
      confirmButtonText: "Si, cancelar",
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
      canceladoEn: serverTimestamp(),
      canceladoPor: "cliente",
      motivoCancelacion: "cancelacion_cliente",
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

    if (!canReprogramTurno(turno, reservasConfig)) {
      const maxReprogramaciones = getMaxReprogramacionesUsuario(reservasConfig);
      Swal.fire({
        icon: "warning",
        title: "No se puede reprogramar",
        text:
          reservasConfig?.permitirReprogramacionUsuario === false
            ? "La reprogramacion por parte del usuario esta desactivada."
            : `Solo se puede reprogramar con al menos ${HORA_CANCELACION_MINIMA} horas de anticipacion y hasta ${maxReprogramaciones} ${maxReprogramaciones === 1 ? "vez" : "veces"} por turno.`,
        confirmButtonText: "Entendido",
        customClass: { confirmButton: "swal-btn-confirm" },
      });
      return;
    }

    try {
      showLoading({
        title: "Buscando disponibilidad",
        text: "Estamos cargando dias y horarios para reprogramar tu turno...",
      });

      const servicioSnap = await getDoc(doc(db, "servicios", turno.servicioId));

      if (!servicioSnap.exists()) {
        throw new Error("Servicio no encontrado");
      }

      const servicio = { id: servicioSnap.id, ...servicioSnap.data() };
      const gabineteIds = Array.isArray(servicio.gabinetes)
        ? servicio.gabinetes
            .map((g) => String(g?.id || "").trim())
            .filter(Boolean)
        : [];

      if (!gabineteIds.length) {
        throw new Error("El servicio no tiene gabinetes configurados");
      }

      const getAgenda = httpsCallable(functions, "getAgendaGabinete");
      const fechaMin = new Date(Date.now() + HORA_CANCELACION_MINIMA * 3600000)
        .toISOString()
        .slice(0, 10);
      const disponibilidades = [];

      for (let offset = 0; offset < 14 && disponibilidades.length < 7; offset++) {
        const fecha = sumarDiasISO(fechaMin, offset);
        const agendaResp = await getAgenda({
          gabineteIds,
          fecha,
        });

        const agenda = agendaResp?.data || {
          horarios: [],
          bloqueos: [],
          turnos: [],
        };

        const fechaObj = new Date(`${fecha}T00:00:00`);
        const slots = generarSlotsDia(agenda, servicio, fechaObj).filter(
          (s) => !s.ocupado,
        );

        if (!slots.length) continue;

        disponibilidades.push({
          fecha,
          label: formatFechaCortaISO(fecha),
          fullLabel: formatFechaISO(fecha),
          slots: slots.map((slot) => ({
            inicio: Number(slot.inicio),
            fin: Number(slot.fin),
            hora: formatHora(slot.inicio),
          })),
        });
      }

      if (!disponibilidades.length) {
        hideLoading();
        Swal.fire({
          icon: "info",
          title: "Sin disponibilidad",
          text: "No encontramos dias con horarios disponibles para reprogramar en este momento.",
          confirmButtonText: "Entendido",
          customClass: { confirmButton: "swal-btn-confirm" },
        });
        return;
      }

      hideLoading();

      let slotSeleccionado = null;
      let fechaElegida = disponibilidades[0].fecha;

      const seleccion = await Swal.fire({
        title: "Reprogramar turno",
        width: 760,
        html: `
          <div style="text-align:left;font-size:14px;margin-bottom:12px;color:#6b6178;">
            Elegi un dia disponible y despues el horario para cambiar tu turno.
          </div>
          <div id="fechas-reprogramacion" style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px;"></div>
          <div id="fecha-reprogramacion-actual" style="margin-bottom:10px;font-size:14px;color:#4b4258;font-weight:700;"></div>
          <div id="slots-reprogramacion" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;"></div>
        `,
        showCancelButton: true,
        confirmButtonText: "Confirmar reprogramacion",
        cancelButtonText: "Volver",
        customClass: {
          confirmButton: "swal-btn-confirm",
          cancelButton: "swal-btn-cancel",
        },
        didOpen: () => {
          const fechasContainer = document.getElementById("fechas-reprogramacion");
          const slotsContainer = document.getElementById("slots-reprogramacion");
          const fechaActual = document.getElementById("fecha-reprogramacion-actual");

          function renderSlots(fecha) {
            const disponibilidad = disponibilidades.find((item) => item.fecha === fecha);
            fechaElegida = fecha;
            slotSeleccionado = null;

            fechaActual.textContent = disponibilidad
              ? `Horarios para ${disponibilidad.fullLabel}`
              : "";

            slotsContainer.innerHTML = (disponibilidad?.slots || [])
              .map(
                (slot) => `
                  <button
                    type="button"
                    class="slot-reprogramar-btn"
                    data-inicio="${slot.inicio}"
                    data-fin="${slot.fin}"
                    style="
                      border:1px solid #d9cdea;
                      background:#fff;
                      border-radius:14px;
                      padding:11px 12px;
                      cursor:pointer;
                      font-weight:700;
                      color:#2f2438;
                    "
                  >
                    ${slot.hora}
                  </button>
                `,
              )
              .join("");

            const botonesSlot = slotsContainer.querySelectorAll(".slot-reprogramar-btn");
            botonesSlot.forEach((btn) => {
              btn.addEventListener("click", () => {
                botonesSlot.forEach((b) => {
                  b.style.background = "#fff";
                  b.style.color = "#2f2438";
                  b.style.border = "1px solid #d9cdea";
                });

                btn.style.background = "linear-gradient(135deg, #d86aa7, #a85fe8)";
                btn.style.color = "#fff";
                btn.style.border = "1px solid transparent";

                slotSeleccionado = {
                  inicio: Number(btn.dataset.inicio),
                  fin: Number(btn.dataset.fin),
                };
              });
            });
          }

          fechasContainer.innerHTML = disponibilidades
            .map(
              (item, index) => `
                <button
                  type="button"
                  class="fecha-reprogramar-btn"
                  data-fecha="${item.fecha}"
                  style="
                    border:1px solid ${index === 0 ? "#a85fe8" : "#ddd2ec"};
                    background:${index === 0 ? "#f6edff" : "#fff"};
                    color:#2f2438;
                    border-radius:999px;
                    padding:10px 14px;
                    cursor:pointer;
                    font-weight:700;
                  "
                >
                  ${item.label}
                </button>
              `,
            )
            .join("");

          const botonesFecha = fechasContainer.querySelectorAll(".fecha-reprogramar-btn");
          botonesFecha.forEach((btn) => {
            btn.addEventListener("click", () => {
              botonesFecha.forEach((b) => {
                b.style.background = "#fff";
                b.style.border = "1px solid #ddd2ec";
              });

              btn.style.background = "#f6edff";
              btn.style.border = "1px solid #a85fe8";
              renderSlots(btn.dataset.fecha);
            });
          });

          renderSlots(disponibilidades[0].fecha);
        },
        preConfirm: () => {
          if (!slotSeleccionado) {
            Swal.showValidationMessage("Elegi un horario");
            return false;
          }
          return {
            fecha: fechaElegida,
            ...slotSeleccionado,
          };
        },
      });

      if (!seleccion.isConfirmed || !seleccion.value) return;

      showLoading({
        title: "Reprogramando turno",
        text: "Guardando la nueva fecha y horario...",
      });

      const callable = httpsCallable(functions, "reprogramarTurnoInteligente");
      const resp = await callable({
        turnoId: turno.id,
        fecha: seleccion.value.fecha,
        horaInicio: seleccion.value.inicio,
        horaFin: seleccion.value.fin,
      });

      const data = resp?.data || {};

      hideLoading();

      await Swal.fire({
        icon: "success",
        title: "Turno reprogramado",
        html: `
          <div style="text-align:center;margin-bottom:14px;color:#5f5670;">
            Tu turno ya fue actualizado correctamente.
          </div>
          <div style="display:grid;gap:10px;text-align:left;">
            <div style="padding:12px 14px;border:1px solid #eadcf7;border-radius:16px;background:linear-gradient(180deg,#fff,#fbf7ff);">
              <div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8a7aa5;margin-bottom:4px;">Nueva fecha</div>
              <div style="font-size:16px;font-weight:800;color:#2d2337;">${formatFechaISO(data.fecha || seleccion.value.fecha)}</div>
            </div>
            <div style="padding:12px 14px;border:1px solid #eadcf7;border-radius:16px;background:linear-gradient(180deg,#fff,#fbf7ff);">
              <div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8a7aa5;margin-bottom:4px;">Nuevo horario</div>
              <div style="font-size:16px;font-weight:800;color:#2d2337;">${formatHora(data.horaInicio || seleccion.value.inicio)}</div>
            </div>
            <div style="padding:12px 14px;border:1px solid #eadcf7;border-radius:16px;background:linear-gradient(180deg,#fff,#fbf7ff);">
              <div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8a7aa5;margin-bottom:4px;">Gabinete</div>
              <div style="font-size:16px;font-weight:800;color:#2d2337;">${data.nombreGabinete || "-"}</div>
            </div>
          </div>
        `,
        confirmButtonText: "Ok",
        customClass: { confirmButton: "swal-btn-confirm" },
      });
    } catch (error) {
      hideLoading();
      console.error("Error reprogramando turno:", error);

      Swal.fire({
        icon: "error",
        title: "No se pudo reprogramar",
        text:
          error?.message?.replace("FirebaseError: ", "") ||
          "Ocurrio un error al intentar reprogramar el turno.",
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
      "Hola! Queria consultar por mi turno:",
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

  function TurnoCard({ t, isProximo }) {
    const start = Number(t.horaInicio || 0);
    const diff = start ? start - Date.now() : null;
    const esHistorial = !isProximo;

    const estadoTurno = getEstadoTurno(t);
    const estadoPago = getEstadoPago(t);
    const requiereGestion =
      estadoTurno === "pendiente" ||
      estadoTurno === "pendiente_aprobacion" ||
      estadoPago === "pendiente" ||
      estadoPago === "pendiente_aprobacion";
    const { total, anticipo, pagado, saldoPendiente } = getMontos(t);
    const mostrarResumenPago =
      total > 0 &&
      saldoPendiente > 0 &&
      !["cancelado", "rechazado", "expirado"].includes(estadoPago);

    return (
      <article
        className={`turno-card ${isProximo ? "is-upcoming" : ""} ${
          requiereGestion ? "is-pending" : "is-confirmed"
        } ${esHistorial ? "is-history" : ""}`}
      >
        <div className="turno-card-top">
          <div className="turno-card-main">
            <div className="turno-card-badges">
              <span className={`turno-pill ${getTurnoTone(estadoTurno)}`}>
                {ESTADO_TURNO_LABEL[estadoTurno] || estadoTurno || "-"}
              </span>
              <span className={`turno-pill ${getPagoTone(estadoPago)}`}>
                {ESTADO_PAGO_LABEL[estadoPago] || estadoPago || "-"}
              </span>
              {isProximo && diff !== null && diff > 0 && (
                <span className="turno-pill neutral">
                  En {humanizeDiff(diff)}
                </span>
              )}
            </div>

            {!esHistorial && (
              <div
                className={`turno-card-state ${
                  requiereGestion ? "pending" : "confirmed"
                }`}
              >
                {requiereGestion
                  ? "Pendiente de confirmacion o pago"
                  : "Turno confirmado"}
              </div>
            )}

            <h3 className="turno-card-title">
              {t.nombreServicio || "Servicio"}
            </h3>

            {!esHistorial && (
              <div className="turno-card-meta">
                <span>
                  {t.fecha ? formatFechaISO(t.fecha) : "Fecha sin definir"}
                </span>
                {start ? <span>{formatHora(t.horaInicio)}</span> : null}
                {!!ubicacion?.mapsDireccion && (
                  <span>{ubicacion.mapsDireccion}</span>
                )}
              </div>
            )}
          </div>

          {total > 0 && (
            <div className="turno-card-price">
              <div className="turno-price-total">
                ${total.toLocaleString("es-AR")}
              </div>
              <div className="turno-price-caption">Total del servicio</div>
            </div>
          )}
        </div>

        {esHistorial ? (
          <div className="turno-history-line">
            <span>{t.fecha ? formatFechaISO(t.fecha) : "Fecha sin definir"}</span>
            {start ? <span>{formatHora(t.horaInicio)}</span> : null}
            <span>{ESTADO_TURNO_LABEL[estadoTurno] || estadoTurno || "-"}</span>
            <span>{ESTADO_PAGO_LABEL[estadoPago] || estadoPago || "-"}</span>
            <span>Total ${total.toLocaleString("es-AR")}</span>
            <span>Pagado ${pagado.toLocaleString("es-AR")}</span>
          </div>
        ) : (
        <div className="turno-card-stats">
          <div className="turno-stat turno-stat-highlight">
            <span>Pagado</span>
            <strong>${pagado.toLocaleString("es-AR")}</strong>
            <small>
              {pagado > 0
                ? "Registrado en tu turno"
                : "Todavia no tenes pagos registrados"}
            </small>
          </div>
          {anticipo > 0 && (
            <div className="turno-stat">
              <span>Seña</span>
              <strong>${anticipo.toLocaleString("es-AR")}</strong>
              <small>Reserva solicitada para este servicio</small>
            </div>
          )}
        </div>
        )}

        {!esHistorial && mostrarResumenPago && (
          <div className="turno-card-payment-note">
            Te queda pendiente abonar ${saldoPendiente.toLocaleString("es-AR")}.
          </div>
        )}

        {!esHistorial && (
          <div className="turno-card-actions">
            {isProximo && (
            <>
              <button
                type="button"
                className="btn turno-action-btn info"
                onClick={() => reprogramarTurno(t)}
                disabled={!canReprogramTurno(t, reservasConfig)}
                title={
                  canReprogramTurno(t, reservasConfig)
                    ? ""
                    : reservasConfig?.permitirReprogramacionUsuario === false
                      ? "La reprogramacion por parte del usuario esta desactivada"
                      : `Se permiten ${getMaxReprogramacionesUsuario(reservasConfig)} ${getMaxReprogramacionesUsuario(reservasConfig) === 1 ? "reprogramacion" : "reprogramaciones"} por turno con ${HORA_CANCELACION_MINIMA}h de anticipacion`
                }
              >
                Reprogramar
              </button>

              <button
                type="button"
                className="btn turno-action-btn danger"
                onClick={() => cancelarTurno(t)}
                disabled={!canCancelTurno(t)}
                title={
                  canCancelTurno(t)
                    ? ""
                    : `Cancelable con ${HORA_CANCELACION_MINIMA}h de anticipacion`
                }
              >
                Cancelar turno
              </button>
            </>
            )}

          </div>
        )}
      </article>
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
    <div className="account-shell container py-4">
      <section className="turnos-page-hero">
        <div>
          <p className="profile-eyebrow">Agenda personal</p>
          <h1 className="profile-title">Mis turnos</h1>
          <p className="profile-subtitle">
            Tené a mano próximos turnos, historial y acciones rápidas desde una
            vista más ordenada.
          </p>
        </div>

        <div className="turnos-hero-stats">
          <article className="turnos-hero-stat">
            <span>Proximos</span>
            <strong>{proximos.length}</strong>
          </article>
          <article className="turnos-hero-stat">
            <span>Pendientes</span>
            <strong>{pendientes.length}</strong>
          </article>
          <article className="turnos-hero-stat">
            <span>Historial</span>
            <strong>{historial.length}</strong>
          </article>
        </div>
      </section>

      <section className="turnos-section">
        <div className="turnos-section-head turnos-section-head-confirmed">
          <div>
            <h2>Próximos</h2>
            <p>Turnos confirmados y activos con opciones para reprogramar o cancelar.</p>
          </div>
          <span className="turnos-counter">
            {proximos.length} turno{proximos.length === 1 ? "" : "s"}
          </span>
        </div>

        {proximos.length === 0 ? (
          <div className="turnos-empty-state">No tenés turnos próximos.</div>
        ) : (
          <div className="turnos-card-list">
            {proximos.map((t) => (
              <TurnoCard key={t.id} t={t} isProximo />
            ))}
          </div>
        )}
      </section>

      <section className="turnos-section">
        <div className="turnos-section-head turnos-section-head-pending">
          <div>
            <h2>Pendientes de confirmacion o pago</h2>
            <p>Turnos activos que todavia esperan aprobacion, confirmacion o un pago.</p>
          </div>
          <span className="turnos-counter">
            {pendientes.length} turno{pendientes.length === 1 ? "" : "s"}
          </span>
        </div>

        {pendientes.length === 0 ? (
          <div className="turnos-empty-state">
            No tenes turnos pendientes de confirmacion o pago.
          </div>
        ) : (
          <div className="turnos-card-list">
            {pendientes.map((t) => (
              <TurnoCard key={t.id} t={t} isProximo />
            ))}
          </div>
        )}
      </section>

      <section className="turnos-section">
        <div className="turnos-section-head">
          <div>
            <h2>Historial</h2>
            <p>Resumen de tus turnos anteriores y estados registrados.</p>
          </div>
          <span className="turnos-counter">
            {historial.length} turno{historial.length === 1 ? "" : "s"}
          </span>
        </div>

        {historial.length === 0 ? (
          <div className="turnos-empty-state">
            Todavía no tenés turnos en el historial.
          </div>
        ) : (
          <div className="turnos-card-list">
            {historial.map((t) => (
              <TurnoCard key={t.id} t={t} isProximo={false} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}


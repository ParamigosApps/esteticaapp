import {
  swalElegirTipoPago,
  swalInputNumber,
  swalSuccess,
  swalError,
  swalConfirmAdmin,
} from "../../../../public/utils/swalUtils.js";

import Swal from "sweetalert2";
import { db, functions } from "../../../../Firebase";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { hideLoading, showLoading } from "../../../../services/loadingService.js";
import { generarSlotsDia } from "../../../../public/utils/generarSlotsDia.js";

const registrarPagoTurnoAdmin = httpsCallable(functions, "registrarPagoTurnoAdmin");
const marcarTurnoReembolsadoAdminFn = httpsCallable(
  functions,
  "marcarTurnoReembolsadoAdmin",
);

function toISODateLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseISODateLocal(value) {
  if (!value || typeof value !== "string") return null;
  if (value.trim() === "null" || value.trim() === "undefined") return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  date.setHours(0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getFechaMaxReservable(servicio) {
  const maxDias = Math.max(1, Number(servicio?.agendaMaxDias || 7));
  const diasVentana = maxDias <= 1 ? 90 : maxDias;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const max = new Date(hoy);
  max.setDate(max.getDate() + diasVentana - 1);
  max.setHours(0, 0, 0, 0);

  return max;
}

function getFechaMaxMensualReservable(servicio) {
  const hoy = new Date();
  const mesBaseOffset =
    servicio?.agendaMensualModo === "mes_siguiente" ? 1 : 0;
  const mesHasta = servicio?.agendaMensualRepiteMesSiguiente
    ? mesBaseOffset + 2
    : mesBaseOffset + 1;
  const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + mesHasta, 0);
  finMes.setHours(0, 0, 0, 0);
  return finMes;
}

function getFechaMaxReservableReal(servicio) {
  if (servicio?.agendaTipo === "mensual") {
    return getFechaMaxMensualReservable(servicio);
  }

  return getFechaMaxReservable(servicio);
}

function extraerGabineteIds(servicio) {
  return (Array.isArray(servicio?.gabinetes) ? servicio.gabinetes : [])
    .map((gabinete) => {
      if (typeof gabinete === "string") return gabinete.trim();
      if (gabinete && typeof gabinete === "object") {
        return String(gabinete.id || gabinete.gabineteId || "").trim();
      }
      return "";
    })
    .filter(Boolean);
}

function formatDateOption(fechaIso) {
  return new Date(`${fechaIso}T00:00:00`).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatHourOption(ms) {
  return new Date(Number(ms)).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

async function pedirNuevaFechaDesdeAgenda(turno) {
  if (!turno?.servicioId) {
    await swalError({
      title: "Turno sin servicio",
      text: "Este turno no tiene un servicio asociado para consultar agenda.",
    });
    return null;
  }

  const servicioSnap = await getDoc(doc(db, "servicios", turno.servicioId));
  if (!servicioSnap.exists()) {
    await swalError({
      title: "Servicio no encontrado",
      text: "No se pudo cargar la configuracion del servicio.",
    });
    return null;
  }

  const servicio = {
    id: servicioSnap.id,
    ...servicioSnap.data(),
  };
  const gabineteIds = extraerGabineteIds(servicio);

  if (!gabineteIds.length) {
    await swalError({
      title: "Sin gabinetes configurados",
      text: "El servicio no tiene gabinetes asociados para reprogramar.",
    });
    return null;
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fechaAgendaDesde = parseISODateLocal(servicio?.agendaDisponibleDesde);
  const fechaMinReservable =
    fechaAgendaDesde && fechaAgendaDesde > hoy ? fechaAgendaDesde : hoy;
  const fechaMaxReservable = getFechaMaxReservableReal(servicio);
  const fechaInicial = (() => {
    if (!turno?.fecha) return toISODateLocal(fechaMinReservable);

    const parsed = new Date(`${turno.fecha}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return toISODateLocal(fechaMinReservable);
    if (parsed < fechaMinReservable) return toISODateLocal(fechaMinReservable);
    if (parsed > fechaMaxReservable) return toISODateLocal(fechaMinReservable);

    return turno.fecha;
  })();

  const getAgendaFn = httpsCallable(functions, "getAgendaGabinete");
  const agendaCache = {};

  async function obtenerSlotsDisponibles(fechaIso) {
    if (!agendaCache[fechaIso]) {
      const resp = await getAgendaFn({
        gabineteIds,
        fecha: fechaIso,
      });
      agendaCache[fechaIso] = resp.data || {};
    }

    const agenda = agendaCache[fechaIso];
    return generarSlotsDia(
      agenda,
      { ...servicio, id: servicio.id },
      new Date(`${fechaIso}T00:00:00`),
    ).filter(
      (slot) =>
        !slot.ocupado &&
        Number(slot?.inicio) <= Number(fechaMaxReservable.getTime() + 86400000 - 1),
    );
  }

  return Swal.fire({
    title: "Reprogramar turno",
    html: `
      <div style="text-align:left">
        <label for="swal-fecha-reprogramar" style="display:block;margin:0 0 6px;font-weight:600;">Fecha</label>
        <input id="swal-fecha-reprogramar" type="date" class="swal2-input" value="${fechaInicial}" min="${toISODateLocal(fechaMinReservable)}" max="${toISODateLocal(fechaMaxReservable)}" style="margin-top:0;">
        <label for="swal-slot-reprogramar" style="display:block;margin:12px 0 6px;font-weight:600;">Horario disponible</label>
        <select id="swal-slot-reprogramar" class="swal2-select" style="width:100%;margin:0;">
          <option value="">Cargando horarios...</option>
        </select>
        <p id="swal-slot-ayuda" style="font-size:12px;color:#7a6d85;margin:12px 0 0;">
          Solo se muestran horarios disponibles segun agenda y gabinetes activos.
        </p>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: "Guardar cambio",
    cancelButtonText: "Volver",
    customClass: {
      popup: "swal-popup-custom",
      confirmButton: "swal-btn-confirm",
      cancelButton: "swal-btn-cancel",
    },
    buttonsStyling: false,
    reverseButtons: true,
    allowOutsideClick: false,
    allowEscapeKey: false,
    didOpen: async () => {
      const fechaInput = document.getElementById("swal-fecha-reprogramar");
      const slotSelect = document.getElementById("swal-slot-reprogramar");
      const ayuda = document.getElementById("swal-slot-ayuda");

      const renderSlots = async () => {
        const fechaIso = fechaInput?.value;
        if (!fechaIso || !slotSelect) return;

        slotSelect.innerHTML = `<option value="">Cargando horarios...</option>`;
        slotSelect.disabled = true;

        try {
          const slots = await obtenerSlotsDisponibles(fechaIso);

          if (!slots.length) {
            slotSelect.innerHTML =
              '<option value="">No hay horarios disponibles para esta fecha</option>';
            if (ayuda) {
              ayuda.textContent =
                "Selecciona otra fecha dentro de la ventana de agenda del servicio.";
            }
            return;
          }

          slotSelect.innerHTML = [
            '<option value="">Selecciona un horario</option>',
            ...slots.map(
              (slot) =>
                `<option value="${slot.inicio}|${slot.fin}">${formatDateOption(fechaIso)} · ${formatHourOption(slot.inicio)} a ${formatHourOption(slot.fin)}</option>`,
            ),
          ].join("");

          const slotActual = slots.find(
            (slot) =>
              Number(slot.inicio) === Number(turno?.horaInicio) &&
              Number(slot.fin) === Number(turno?.horaFin),
          );

          if (slotActual && fechaIso === turno?.fecha) {
            slotSelect.value = `${slotActual.inicio}|${slotActual.fin}`;
          }

          if (ayuda) {
            ayuda.textContent =
              "Solo se muestran horarios disponibles segun agenda y gabinetes activos.";
          }
        } catch (error) {
          console.error("Error cargando agenda para reprogramar", error);
          slotSelect.innerHTML =
            '<option value="">No se pudo cargar la agenda</option>';
          if (ayuda) {
            ayuda.textContent =
              "Ocurrio un error al consultar la disponibilidad del servicio.";
          }
        } finally {
          slotSelect.disabled = false;
        }
      };

      fechaInput?.addEventListener("change", renderSlots);
      await renderSlots();
    },
    preConfirm: () => {
      const fechaValue =
        document.getElementById("swal-fecha-reprogramar")?.value || "";
      const slotValue =
        document.getElementById("swal-slot-reprogramar")?.value || "";

      if (!fechaValue) {
        Swal.showValidationMessage("Selecciona una fecha");
        return false;
      }

      if (!slotValue) {
        Swal.showValidationMessage("Selecciona un horario disponible");
        return false;
      }

      const [horaInicioValue, horaFinValue] = slotValue.split("|").map(Number);

      if (
        !Number.isFinite(horaInicioValue) ||
        !Number.isFinite(horaFinValue) ||
        horaFinValue <= horaInicioValue
      ) {
        Swal.showValidationMessage("El horario seleccionado no es valido");
        return false;
      }

      return {
        fecha: fechaValue,
        horaInicio: horaInicioValue,
        horaFin: horaFinValue,
      };
    },
  });
}

export async function pedirConfirmacionPago(turno) {
  const total = Number(
    turno?.montoTotal ?? turno?.precioTotal ?? turno?.total ?? 0,
  );

  const anticipo = Number(
    turno?.montoAnticipo ?? turno?.montoSena ?? turno?.seña ?? turno?.sena ?? 0,
  );

  const pagadoActual = Number(turno?.montoPagado ?? turno?.pagadoTotal ?? 0);

  const montoSugeridoParcial =
    pagadoActual > 0 ? pagadoActual : anticipo > 0 ? anticipo : 0;

  const resTipo = await swalElegirTipoPago({
    title: "¿Cuánto se pagó?",
    html: `
      <div style="text-align:left;font-size:14px;">
        <div><b>Servicio:</b> ${turno?.nombreServicio || "-"}</div>
        <div><b>Total:</b> $${total.toLocaleString("es-AR")}</div>
        ${
          anticipo > 0
            ? `<div><b>Seña solicitada:</b> $${anticipo.toLocaleString("es-AR")}</div>`
            : ""
        }
      </div>
    `,
    confirmText: `Total: $${total.toLocaleString("es-AR")}`,
    denyText:
      anticipo > 0
        ? `Parcial: $${anticipo.toLocaleString("es-AR")}`
        : "Pago parcial",
    cancelText: "Cancelar",
    customClass: {
      confirmButton: "swal-btn-confirm",
      denyButton: "swal-btn-confirm",
      cancelButton: "swal-btn-cancel",
    },
    buttonsStyling: false,
    reverseButtons: true,
  });

  if (resTipo.isDismissed) return null;

  if (resTipo.isConfirmed) {
    return {
      estadoPago: "abonado",
      montoPagado: total > 0 ? total : pagadoActual,
    };
  }

  const resMonto = await swalInputNumber({
    title: "Ingresá el monto parcial / seña",
    inputValue: montoSugeridoParcial > 0 ? String(montoSugeridoParcial) : "",
    placeholder: "Ej: 5000",
    confirmText: "Guardar pago parcial",
    cancelText: "Cancelar",
    min: "0",
    step: "1",
    inputValidator: (value) => {
      if (value === "" || value == null) return "Ingresá un monto";

      const monto = Number(value);

      if (Number.isNaN(monto) || monto <= 0) {
        return "Ingresá un monto válido";
      }

      if (total > 0 && monto > total) {
        return "No puede ser mayor al total";
      }

      return null;
    },
  });

  if (!resMonto.isConfirmed) return null;

  const monto = Number(resMonto.value);

  return {
    estadoPago: total > 0 && monto >= total ? "abonado" : "parcial",
    montoPagado: monto,
  };
}

async function actualizarTurnoConPago(turno, pago) {
  const montoPagado = Number(pago?.montoPagado ?? 0);
  await registrarPagoTurnoAdmin({
    turnoId: turno.id,
    monto: montoPagado,
    operacion: "set",
  });
}

export async function completarPagoTurno(turno) {
  try {
    const total = Number(turno?.montoTotal ?? turno?.precioTotal ?? 0);
    const pagadoActual = Number(turno?.montoPagado ?? 0);
    const saldoActual = Math.max(0, total - pagadoActual);

    if (saldoActual <= 0) {
      await swalError({
        title: "No hay saldo pendiente",
        text: "Este turno ya tiene el pago completo.",
      });
      return false;
    }

    const resMonto = await swalInputNumber({
      title: "Completar pago",
      inputValue: String(saldoActual),
      placeholder: "Ej: 5000",
      confirmText: "Registrar pago",
      cancelText: "Cancelar",
      min: "0",
      step: "1",
      inputValidator: (value) => {
        if (value === "" || value == null) return "Ingresá un monto";

        const monto = Number(value);

        if (Number.isNaN(monto) || monto <= 0) {
          return "Ingresá un monto válido";
        }

        if (monto > saldoActual) {
          return "No puede ser mayor al saldo pendiente";
        }

        return null;
      },
    });

    if (!resMonto.isConfirmed) return false;

    const montoIngresado = Number(resMonto.value);
    const nuevoMontoPagado = pagadoActual + montoIngresado;
    const nuevoSaldoPendiente = Math.max(0, total - nuevoMontoPagado);

    showLoading({
      title: "Registrando pago",
      text: "Actualizando el turno y el pago asociado...",
    });

    await registrarPagoTurnoAdmin({
      turnoId: turno.id,
      monto: montoIngresado,
      operacion: "add",
    });

    await swalSuccess({
      title:
        nuevoSaldoPendiente <= 0 ? "Pago completado" : "Pago parcial actualizado",
      text:
        nuevoSaldoPendiente <= 0
          ? "El turno quedó abonado en su totalidad."
          : "Se registró un nuevo pago parcial.",
    });

    return true;
  } catch (error) {
    console.error("Error completando pago:", error);
    await swalError({
      title: "No se pudo completar el pago",
      text: "Ocurrió un error al registrar el pago.",
    });
    return false;
  } finally {
    hideLoading();
  }
}

export async function aprobarPagoTurno(turno) {
  try {
    const pago = await pedirConfirmacionPago(turno);
    if (!pago) return false;

    showLoading({
      title: "Aprobando pago",
      text: "Registrando el pago del turno...",
    });

    await actualizarTurnoConPago(turno, pago);

    await swalSuccess({
      title: "Pago confirmado",
      text:
        pago.estadoPago === "parcial"
          ? "Se registró un pago parcial / seña."
          : "Se registró el pago total.",
    });

    return true;
  } catch (error) {
    console.error("Error aprobando pago:", error);
    await swalError({
      title: "No se pudo confirmar el pago",
      text: "Ocurrió un error al actualizar el turno.",
    });
    return false;
  } finally {
    hideLoading();
  }
}

export async function aprobarTurnoYRegistrarPago(turno) {
  try {
    const pago = await pedirConfirmacionPago(turno);
    if (!pago) return false;

    showLoading({
      title: "Aprobando turno",
      text: "Confirmando el turno y registrando el pago...",
    });

    await actualizarTurnoConPago(turno, pago);

    await swalSuccess({
      title: "Turno aprobado",
      text:
        pago.estadoPago === "parcial"
          ? "El turno quedó confirmado con pago parcial / seña."
          : "El turno quedó confirmado con pago total.",
    });

    return true;
  } catch (error) {
    console.error("Error aprobando turno y pago:", error);
    await swalError({
      title: "No se pudo aprobar el turno",
      text: "Ocurrió un error al actualizar el turno.",
    });
    return false;
  } finally {
    hideLoading();
  }
}

export async function rechazarTurnoAdmin(turnoId) {
  try {
    showLoading({
      title: "Rechazando turno",
      text: "Actualizando estado del turno...",
    });
    await updateDoc(doc(db, "turnos", turnoId), {
      estadoTurno: "rechazado",
      estadoPago: "rechazado",
      rechazadoEn: serverTimestamp(),
      venceEn: null,
      updatedBy: "admin",
      updatedAt: serverTimestamp(),
    });

    return true;
  } catch (error) {
    console.error("Error rechazando turno:", error);
    await swalError({
      title: "No se pudo rechazar el turno",
      text: "Ocurrió un error al actualizar el turno.",
    });
    return false;
  } finally {
    hideLoading();
  }
}

export async function cancelarTurnoAdmin(turno) {
  try {
    const res = await swalConfirmAdmin({
      title: "Cancelar turno",
      text: `Vas a cancelar el turno de ${turno?.nombreServicio || "este servicio"}.`,
      icon: "warning",
      confirmText: "Sí, cancelar",
      cancelText: "Volver",
      confirmButtonClass: "swal-btn-confirm",
      cancelButtonClass: "swal-btn-cancel",
    });

    if (!res.isConfirmed) return false;

    showLoading({
      title: "Cancelando turno",
      text: "Procesando cancelacion...",
    });

    const fn = httpsCallable(functions, "cancelarTurnoAdmin");
    await fn({ turnoId: turno.id });

    await swalSuccess({
      title: "Turno cancelado",
      confirmText: "Aceptar",
      timer: 2200,
    });

    return true;
  } catch (error) {
    console.error("Error cancelando turno:", error);
    await swalError({
      title: "No se pudo cancelar el turno",
      text: "Ocurrió un error al cancelar el turno.",
    });
    return false;
  } finally {
    hideLoading();
  }
}

export async function marcarTurnoRealizadoAdmin(turno) {
  try {
    const res = await swalConfirmAdmin({
      title: "Marcar como realizado",
      text: "Este turno quedará marcado como realizado.",
      icon: "question",
      confirmText: "Confirmar",
      cancelText: "Volver",
      confirmButtonClass: "swal-btn-confirm",
      cancelButtonClass: "swal-btn-cancel",
    });

    if (!res.isConfirmed) return false;

    showLoading({
      title: "Marcando realizado",
      text: "Actualizando estado del turno...",
    });

    const fn = httpsCallable(functions, "marcarTurnoRealizadoAdmin");
    await fn({ turnoId: turno.id });

    await swalSuccess({
      title: "Turno realizado",
      confirmText: "Aceptar",
      timer: 2200,
    });

    return true;
  } catch (error) {
    console.error("Error marcando turno realizado:", error);
    await swalError({
      title: "No se pudo marcar como realizado",
      text: "Ocurrió un error al actualizar el turno.",
    });
    return false;
  } finally {
    hideLoading();
  }
}

export async function marcarTurnoAusenteAdmin(turno) {
  try {
    const res = await swalConfirmAdmin({
      title: "Marcar ausente",
      text: "El cliente quedará marcado como ausente.",
      icon: "warning",
      confirmText: "Confirmar",
      cancelText: "Volver",
      confirmButtonClass: "swal-btn-confirm",
      cancelButtonClass: "swal-btn-cancel",
    });

    if (!res.isConfirmed) return false;

    showLoading({
      title: "Marcando ausencia",
      text: "Actualizando estado del turno...",
    });

    const fn = httpsCallable(functions, "marcarTurnoAusenteAdmin");
    await fn({ turnoId: turno.id });

    await swalSuccess({
      title: "Cliente marcado como ausente",
      confirmText: "Aceptar",
      timer: 2200,
    });

    return true;
  } catch (error) {
    console.error("Error marcando turno ausente:", error);
    await swalError({
      title: "No se pudo marcar como ausente",
      text: "Ocurrió un error al actualizar el turno.",
    });
    return false;
  } finally {
    hideLoading();
  }
}

export async function reprogramarTurnoAdmin(turno) {
  try {
    const res = await pedirNuevaFechaDesdeAgenda(turno);

    if (!res.isConfirmed || !res.value) return false;

    showLoading({
      title: "Reprogramando turno",
      text: "Guardando nueva fecha y horario...",
    });

    const fn = httpsCallable(functions, "reprogramarTurnoAdmin");
    await fn({
      turnoId: turno.id,
      fecha: res.value.fecha,
      horaInicio: res.value.horaInicio,
      horaFin: res.value.horaFin,
    });

    await swalSuccess({
      title: "Turno reprogramado",
      text: "Recorda notificar al cliente la reprogramacion.",
      confirmText: "Aceptar",
      timer: 2200,
    });

    return true;
  } catch (error) {
    console.error("Error reprogramando turno:", error);
    await swalError({
      title: "No se pudo reprogramar el turno",
      text: "Ocurrió un error al guardar el cambio.",
    });
    return false;
  } finally {
    hideLoading();
  }
}

export async function marcarTurnoReembolsadoAdmin(turno) {
  try {
    const montoPagado = Number(turno?.montoPagado ?? 0);

    if (montoPagado <= 0) {
      await swalError({
        title: "Sin pagos registrados",
        text: "Este turno no tiene monto pagado para reembolsar.",
      });
      return false;
    }

    const res = await swalConfirmAdmin({
      title: "Marcar reembolso",
      text: `Se marcara como reembolsado un total de $${montoPagado.toLocaleString("es-AR")}.`,
      icon: "warning",
      confirmText: "Marcar reembolsado",
      cancelText: "Volver",
      confirmButtonClass: "swal-btn-confirm",
      cancelButtonClass: "swal-btn-cancel",
    });

    if (!res.isConfirmed) return false;

    showLoading({
      title: "Marcando reembolso",
      text: "Actualizando el turno y sus pagos asociados...",
    });

    await marcarTurnoReembolsadoAdminFn({ turnoId: turno.id });

    await swalSuccess({
      title: "Turno reembolsado",
      text: "El estado de pago quedo marcado como reembolsado.",
      confirmText: "Aceptar",
      timer: 2200,
    });

    return true;
  } catch (error) {
    console.error("Error marcando turno reembolsado:", error);
    await swalError({
      title: "No se pudo marcar el reembolso",
      text: "Ocurrio un error al actualizar el turno.",
    });
    return false;
  } finally {
    hideLoading();
  }
}

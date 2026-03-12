import {
  swalElegirTipoPago,
  swalInputNumber,
  swalSuccess,
  swalError,
  swalConfirmAdmin,
  swalReprogramarTurno,
} from "../../../../public/utils/swalUtils.js";

import { db, functions } from "../../../../Firebase";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { hideLoading, showLoading } from "../../../../services/loadingService.js";

const registrarPagoTurnoAdmin = httpsCallable(functions, "registrarPagoTurnoAdmin");
const marcarTurnoReembolsadoAdminFn = httpsCallable(
  functions,
  "marcarTurnoReembolsadoAdmin",
);

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
    const res = await swalReprogramarTurno();

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

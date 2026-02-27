const { formatearFecha } = require('./utils/utils')

// --------------------------------------------------------------
// LOGIN
// --------------------------------------------------------------
function mailLogin({
  nombre,
  provider,
  email,
  telefono,
  uid,
  fecha = new Date(),
}) {
  const metodoMap = {
    google: 'Google',
    facebook: 'Facebook',
    phone: 'Teléfono',
  }

  const metodo = metodoMap[provider] || provider || 'Desconocido'

  const fechaStr =
    fecha instanceof Date ? fecha.toLocaleString('es-AR') : String(fecha)

  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#333">
      <h2>👋 Registro exitoso en AppBar</h2>
      <p><b>Nombre:</b> ${nombre || 'Usuario'}</p>
      <p><b>Método:</b> ${metodo}</p>
      ${email ? `<p><b>Email:</b> ${email}</p>` : ''}
      ${telefono ? `<p><b>Teléfono:</b> ${telefono}</p>` : ''}
      <p><b>Fecha:</b> ${fechaStr}</p>
    </div>
  `
}

// --------------------------------------------------------------
// ENTRADAS APROBADAS
// --------------------------------------------------------------
function mailEntradasAprobadas({
  usuarioNombre = 'Usuario',
  eventoNombre = 'Evento',
  fechaEvento = null,
  lugar = '',
  resumenLotes = [],
  qrs = [],
  metodo = 'Mercado Pago',
}) {
  const fechaStr = formatearFecha(fechaEvento)

  return `
    <div style="font-family:Arial;max-width:560px;margin:auto">
      <h2>🎟️ Entradas confirmadas</h2>
      <p>Hola <b>${usuarioNombre}</b></p>

      <p><b>Evento:</b> ${eventoNombre}</p>
      <p><b>Fecha:</b> ${fechaStr}</p>
      ${lugar ? `<p><b>Lugar:</b> ${lugar}</p>` : ''}

      <h3>Entradas</h3>
      <ul>
        ${resumenLotes
          .map(l => `<li>${l.cantidad} × ${l.nombre}</li>`)
          .join('')}
      </ul>

<h3 style="margin-top:24px">Códigos QR</h3>

${qrs
  .map(
    (q, i) => `
    <div style="
      margin:16px 0;
      padding:14px;
      border:1px solid #e5e5e5;
      border-radius:10px;
      text-align:center;
      background:#fafafa;
    ">
      <div style="font-weight:600;margin-bottom:8px">
        Entrada #${i + 1} — ${q.lote}
      </div>

      ${
        q.url
          ? `<img src="${q.url}" width="200" style="display:block;margin:0 auto"/>`
          : `<div style="color:#999">QR no disponible</div>`
      }
    </div>
  `
  )
  .join('')}


      <p><b>Método de pago:</b> ${metodo}</p>
    </div>
  `
}

function mailEntradasAgrupadas({
  usuarioNombre = 'Usuario',
  eventoNombre = 'Evento',
  fechaEvento = null,
  lugar = '',
  entradas = [],
}) {
  const fechaStr = formatearFecha(fechaEvento)

  const lotesMap = {}
  const qrs = []

  for (const e of entradas) {
    const nombreLote = e.lote?.nombre || 'Entrada general'
    lotesMap[nombreLote] = (lotesMap[nombreLote] || 0) + 1

    if (e.qr?.url && e.qr?.code) {
      qrs.push({
        url: e.qr.url,
        code: e.qr.code,
        lote: nombreLote,
      })
    }
  }

  const resumenLotes = Object.entries(lotesMap)
    .map(([nombre, cantidad]) => `<li><b>${cantidad}</b> × ${nombre}</li>`)
    .join('')

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#111">

    <h2 style="margin-bottom:6px">🎟️ Tus entradas están listas</h2>
    <p style="margin:4px 0">Hola <b>${usuarioNombre}</b></p>

    <hr style="border:none;border-top:1px solid #eee;margin:14px 0"/>

    <p><b>Evento:</b> ${eventoNombre}</p>
    <p><b>Fecha:</b> ${fechaStr}</p>
    ${lugar ? `<p><b>Lugar:</b> ${lugar}</p>` : ''}

    <h3 style="margin-top:22px">🎫 Entradas</h3>
    <ul style="padding-left:18px;margin-top:6px">${resumenLotes}</ul>

    <h3 style="margin-top:26px">Códigos QR</h3>

    ${qrs
      .map(
        (q, i) => `
        <div style="
          margin:18px auto;
          padding:16px;
          border:1px solid #e5e5e5;
          border-radius:14px;
          text-align:center;
          background:#fafafa;
          max-width:250px;
        ">
          <div style="font-weight:600;margin-bottom:10px">
            Entrada #${i + 1} — ${q.lote}
          </div>

          <img 
            src="${q.url}" 
            width="200" 
            style="display:block;margin:0 auto 10px auto"
          />

          <div style="
            font-size:12px;
            color:#555;
            letter-spacing:0.5px;
            margin-top:6px
          ">
            Código de validación:<br/>
           <b style="font-family:monospace">
           ${q.code?.split('|')[1] || q.code}
           </b>
          </div>
        </div>
      `
      )
      .join('')}

    <hr style="border:none;border-top:1px solid #eee;margin:18px 0"/>

    <p style="font-size:12px;color:#666;line-height:1.4">
      Presentá este QR en el ingreso. Entrada valida unicamente para este evento.  
      
    </p>

  </div>
  `
}

module.exports = {
  mailLogin,
  mailEntradasAprobadas,
  mailEntradasAgrupadas,
}

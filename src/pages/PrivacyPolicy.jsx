const PRIVACY_SECTIONS = [
  {
    title: "1. Informacion que recopilamos",
    paragraphs: [
      "Podemos recopilar datos que nos compartes al reservar un turno, crear tu perfil o comunicarte con el centro. Esto puede incluir nombre, telefono, correo electronico, datos basicos de agenda y preferencias vinculadas a la atencion.",
      "Tambien podemos registrar informacion tecnica minima del uso del sitio, como fecha de acceso, paginas visitadas o datos del dispositivo, con fines de seguridad, funcionamiento y mejora del servicio.",
    ],
  },
  {
    title: "2. Para que usamos tus datos",
    paragraphs: [
      "Usamos la informacion para gestionar reservas, confirmar turnos, responder consultas, coordinar cambios o cancelaciones, mejorar la experiencia del sitio y mantener un contacto administrativo u operativo cuando sea necesario.",
      "Si el servicio incluye pagos o senas online, ciertos datos pueden utilizarse para validar operaciones, prevenir fraudes y dejar constancia de las transacciones relacionadas con tu reserva.",
    ],
  },
  {
    title: "3. Comparticion de la informacion",
    paragraphs: [
      "No vendemos tus datos personales. Solo podemos compartir informacion con proveedores que participan en la operacion del servicio, por ejemplo plataformas de pagos, herramientas de mensajeria, alojamiento web o analitica, siempre bajo una finalidad vinculada a la prestacion.",
      "Tambien podremos divulgar informacion cuando exista una obligacion legal, un requerimiento valido de autoridad competente o cuando sea necesario para proteger derechos, seguridad o funcionamiento del sistema.",
    ],
  },
  {
    title: "4. Conservacion y seguridad",
    paragraphs: [
      "Aplicamos medidas razonables de seguridad administrativa, tecnica y organizativa para proteger la informacion frente a accesos no autorizados, perdida o uso indebido. Aun asi, ningun sistema en internet puede garantizar seguridad absoluta.",
      "Conservamos los datos durante el tiempo necesario para operar reservas, cumplir obligaciones legales, resolver disputas o sostener historiales operativos del negocio.",
    ],
  },
  {
    title: "5. Tus derechos",
    paragraphs: [
      "Puedes solicitar la actualizacion o correccion de tus datos personales cuando detectes informacion incompleta o inexacta. Tambien puedes pedir la baja de comunicaciones no esenciales.",
      "Si necesitas ejercer derechos sobre tus datos o realizar una consulta sobre privacidad, puedes hacerlo a traves de los canales de contacto publicados en este sitio.",
    ],
  },
  {
    title: "6. Cookies y tecnologias similares",
    paragraphs: [
      "Este sitio puede utilizar cookies o tecnologias equivalentes para recordar sesiones, mantener funcionalidades basicas, mejorar la navegacion y medir el rendimiento general del servicio.",
      "Puedes configurar tu navegador para limitar o bloquear ciertas cookies, aunque eso podria afectar el funcionamiento normal de algunas secciones.",
    ],
  },
  {
    title: "7. Cambios a esta politica",
    paragraphs: [
      "Podemos actualizar esta politica para reflejar mejoras operativas, cambios normativos o nuevas funcionalidades. La version publicada en este sitio sera la que se considere vigente desde su fecha de actualizacion.",
    ],
  },
];

export default function PrivacyPolicy() {
  return (
    <section className="legal-page">
      <div className="legal-page-shell">
        <header className="legal-page-hero">
          <span className="legal-page-kicker">Documento legal</span>
          <h1>Politica de privacidad</h1>
          <p>
            Explica como recopilamos, usamos, resguardamos y administramos la
            informacion personal vinculada al uso de este sitio y a la reserva
            de turnos.
          </p>
          <div className="legal-page-meta">
            <span>Ultima actualizacion: 17/03/2026</span>
            <span>Aplicable al uso del sitio y sus servicios digitales</span>
          </div>
        </header>

        <div className="legal-page-card">
          <p className="legal-page-intro">
            Al navegar este sitio o utilizar sus funcionalidades, aceptas el
            tratamiento de datos conforme a esta politica, en la medida que sea
            necesario para la prestacion del servicio.
          </p>

          {PRIVACY_SECTIONS.map((section) => (
            <section key={section.title} className="legal-section">
              <h2>{section.title}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}

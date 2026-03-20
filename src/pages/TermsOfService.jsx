const TERMS_SECTIONS = [
  {
    title: "1. Alcance del servicio",
    paragraphs: [
      "Este sitio permite conocer servicios disponibles, consultar informacion general, gestionar turnos, acceder al perfil del usuario y, en determinados casos, realizar pagos o senas vinculadas a una reserva.",
      "La disponibilidad, duracion, precios, condiciones de cada servicio y profesionales asignados pueden variar segun la configuracion operativa vigente.",
    ],
  },
  {
    title: "2. Uso adecuado de la plataforma",
    paragraphs: [
      "Te comprometes a utilizar la plataforma de forma licita, responsable y sin interferir en su funcionamiento. No esta permitido cargar datos falsos, reservar turnos de manera abusiva ni intentar vulnerar la seguridad del sistema.",
      "Cada usuario es responsable de la veracidad de la informacion que aporta para reservar, pagar o gestionar su cuenta.",
    ],
  },
  {
    title: "3. Reservas, cambios y cancelaciones",
    paragraphs: [
      "Las reservas quedan sujetas a disponibilidad real de agenda y a la correcta confirmacion del proceso correspondiente. En algunos servicios puede requerirse una seña o pago parcial para asegurar el turno.",
      "Los cambios, reprogramaciones o cancelaciones pueden depender de la anticipacion con la que se soliciten y de las condiciones especificas informadas durante la reserva.",
    ],
  },
  {
    title: "4. Pagos y senas",
    paragraphs: [
      "Cuando la plataforma ofrezca pagos online, estos podran procesarse mediante terceros especializados. La aprobación, observacion o rechazo de una operacion depende tanto de las validaciones internas como de la pasarela de pago utilizada.",
      "Las senas abonadas se imputan a la reserva correspondiente segun las condiciones indicadas al momento de confirmar el turno.",
    ],
  },
  {
    title: "5. Propiedad intelectual y contenidos",
    paragraphs: [
      "El diseno del sitio, su identidad visual, textos, imagenes, marcas, estructura y contenidos asociados forman parte del entorno del servicio y no pueden reproducirse, copiarse o reutilizarse sin autorizacion previa cuando corresponda.",
    ],
  },
  {
    title: "6. Limitacion de responsabilidad",
    paragraphs: [
      "Hacemos esfuerzos razonables para mantener la plataforma disponible y actualizada, pero no garantizamos ausencia absoluta de errores, interrupciones temporales o demoras ajenas a nuestro control.",
      "El uso del sitio se realiza bajo tu propia responsabilidad, dentro de los limites permitidos por la normativa aplicable.",
    ],
  },
  {
    title: "7. Modificaciones",
    paragraphs: [
      "Podemos actualizar estos terminos para reflejar cambios operativos, comerciales, tecnicos o legales. La continuacion en el uso del sitio luego de publicada una version nueva implicara la aceptacion de los cambios vigentes.",
    ],
  },
];

export default function TermsOfService() {
  return (
    <section className="legal-page">
      <div className="legal-page-shell">
        <header className="legal-page-hero">
          <span className="legal-page-kicker">Documento legal</span>
          <h1>Terminos de servicio</h1>
          <p>
            Define las condiciones generales para navegar el sitio, reservar
            turnos, usar funcionalidades de cuenta y operar dentro de la
            plataforma digital.
          </p>
          <div className="legal-page-meta">
            <span>Ultima actualizacion: 17/03/2026</span>
            <span>Condiciones generales de uso del servicio</span>
          </div>
        </header>

        <div className="legal-page-card">
          <p className="legal-page-intro">
            El acceso y uso de esta plataforma implica la aceptacion de estas
            condiciones. Si no estas de acuerdo con ellas, debes abstenerte de
            utilizar el servicio.
          </p>

          {TERMS_SECTIONS.map((section) => (
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

import { Link } from "react-router-dom";

export default function LegalLinks({ className = "", onNavigate = null }) {
  const rootClassName = ["legal-links", className].filter(Boolean).join(" ");

  function handleClick() {
    if (typeof onNavigate === "function") {
      onNavigate();
    }
  }

  return (
    <nav className={rootClassName} aria-label="Enlaces legales">
      <Link
        className="legal-links-anchor"
        to="/politica-de-privacidad"
        onClick={handleClick}
      >
        Politica de privacidad
      </Link>
      <span className="legal-links-separator" aria-hidden="true">
        ·
      </span>
      <Link
        className="legal-links-anchor"
        to="/terminos-de-servicio"
        onClick={handleClick}
      >
        Terminos de servicio
      </Link>
    </nav>
  );
}

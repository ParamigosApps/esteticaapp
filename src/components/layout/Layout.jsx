// -----------------------------------------------------
// src/components/layout/Layout.jsx — VERSIÓN FINAL
// -----------------------------------------------------
import { Outlet } from "react-router-dom";

export default function Layout() {
  return (
    <>
      {/* CONTENIDO PRINCIPAL */}
      <main className="mt-3">
        <Outlet />
      </main>
    </>
  );
}

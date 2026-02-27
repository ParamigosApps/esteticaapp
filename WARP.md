# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Development commands

Project is a React single-page app built with Vite (using `rolldown-vite`). All commands below assume `npm`, but any npm-compatible client works.

- Install dependencies
  - `npm install`
- Run dev server with HMR
  - `npm run dev`
- Production build
  - `npm run build`
- Preview built app locally
  - `npm run preview`
- Lint the entire project
  - `npm run lint`

Tests are not currently configured (there is no `test` script in `package.json`). If a test runner is added, update this section with the concrete commands (including how to run a single test file or test name).

## High-level architecture

### Entry point and global providers

- `src/main.jsx` is the browser entry and is the canonical source of truth for **provider ordering**. It:
  - Imports global styles (`styles/index.css`, `styles/theme.css`, Bootstrap CSS/JS, SweetAlert theme CSS).
  - Wraps `<App />` inside a nested tree of providers, in this exact order:
    1. `FirebaseProvider` (`FirebaseContext.jsx`)
    2. `AuthProvider` (`AuthContext.jsx`)
    3. `ThemeProvider` (`ThemeContext.jsx`)
    4. `CarritoProvider` (`CarritoContext.jsx`)
    5. `CatalogoProvider` (`CatalogoContext.jsx`)
    6. `PedidosProvider` (`PedidosContext.jsx`)
    7. `QrProvider` (`QrContext.jsx`)
    8. `EntradasProvider` (`EntradasContext.jsx`)
- This order is intentional and documented in comments as the “versión final” setup. When refactoring providers, assume downstream contexts may depend on upstream ones and avoid reordering unless you fully trace those dependencies.

- `src/App.jsx` owns **routing and global sidecars**:
  - Configures `BrowserRouter` and `Routes`.
  - Mounts `NotificacionesListener` and a global `ToastContainer`.
  - Public routes (wrapped in `Layout`) include at least:
    - `/` → `Home` (main customer menu / catalog surface).
    - `/historial` → `HistorialEntradas` (ticket history).
  - Access route:
    - `/acceso` → `LoginEmpleado` (employee/admin login screen).
  - Admin routes are protected with `<AdminRoute modulo="…" />` wrappers and map to feature areas:
    - `/admin` (dashboard), `/admin/crear-evento`, `/admin/editar-evento/:eventoId` (events), `/admin/productos`, `/admin/qr-entradas`, `/admin/qr-caja`, `/admin/empleados`, `/admin/config`.

### Authentication, employees, and permissions

Authentication and authorization are split into two layers:

- **FirebaseContext (`src/context/FirebaseContext.jsx`)**
  - Works directly with `auth` and `db` from `Firebase.js`.
  - Tracks the low-level Firebase user plus an `empleadoData` document from `empleados` collection.
  - Maintains a boolean `isAdmin` based on:
    - Firestore employee record (`nivel` and `manual` flags), plus
    - A fallback list of hard-coded admin emails.
  - Exposes phone/SMS login via `RecaptchaVerifier` and `signInWithPhoneNumber`, plus Google/Facebook login and logout.

- **AuthContext (`src/context/AuthContext.jsx`)**
  - Higher-level app auth, combining:
    - End-user accounts in `usuarios` collection.
    - A separate **manual admin** login system (`loginAdminManual`) for employees / back-office, backed either by a special master user or matching docs in `empleados` collection.
  - Persists manual admin sessions in `localStorage` under `session_admin` and maps them to a numeric `rolUsuario`.
  - Loads a Firestore config doc `configuracion/permisos`, expected to contain keys like `nivel1` … `nivel4`, each being an array of **module names** or `*`.
  - Provides login flows (Google, Facebook, phone with verification code) and writes/merges user documents into `usuarios`.

- **Route guards**
  - `components/admin/AdminRoute.jsx` is the central guard for admin routes.
    - Reads `adminUser`, `rolUsuario`, and `permisos` from `AuthContext`.
    - Derives a key `nivel${rolUsuario}` and looks up an array of permitted modules.
    - Grants access when that array contains `*` or when it includes the `modulo` prop passed by the route (e.g. `eventos`, `productos`, `qr`, `caja`, `empleados`, `config`, `dashboard`).
    - On missing permissions configuration, logs an error and forces logout.
  - `components/admin/AdminRouteEmpleado.jsx` is an alternative guard built on `FirebaseContext`, checking `empleadoData.permiso` against one or more allowed values and allowing `Nivel4` as a super-permission.

Any change to roles or permission names must stay consistent across:
- Firestore doc `configuracion/permisos`.
- The `modulo` strings used in `App.jsx` and `AdminPage.jsx`.
- The checks in `AdminRoute` and any other permission-aware components.

### Catalog, shopping cart, orders, and payments

Commerce flows are driven by a set of coupled contexts and services:

- **CatalogoContext (`src/context/CatalogoContext.jsx`)**
  - Loads products from `productos` collection in Firestore and wraps them in a `Producto` class with normalized fields (`imgSrc`, `nombre`, `descripcion`, `precio`, `categoria`, `destacado`, `stock`).
  - Tracks visible category, derived category list, and whether the catalog is expanded.
  - `abrirProductoDetalle` uses SweetAlert2 with a custom HTML template to render product details and a quantity picker; on confirmation it calls `useCarrito().agregarProducto` and optionally opens the cart.

- **CarritoContext (`src/context/CarritoContext.jsx`)**
  - Stores cart items in React state and syncs them to `localStorage` under `carrito`.
  - Normalizes prices (handles string prices with currency formatting) and computes totals.
  - Enforces **stock limits per product** when adding or incrementing.
  - Uses SweetAlert2 and `toastify-js` for UX feedback when modifying the cart.
  - `finalizarCompra` orchestrates the purchase flow:
    - Requires a logged-in user (via `useFirebase` / `useAuth`); otherwise closes the cart, prompts, and opens the global login.
    - Validates real-time stock via `services/stockService.js`.
    - Enforces a maximum of 3 pending orders per user via `services/comprasService.js`.
    - Shows a SweetAlert summary with order line items and total, then lets the user choose between:
      - **Pago en caja**: creates a pending order (`crearPedido`), then opens a QR modal (`mostrarQrCompraReact` from `components/qr/ModalQrCompra.jsx`) for in-person payment.
      - **Mercado Pago**: creates a paid order (`crearPedido` marked `pagado: true`), then calls `crearPreferenciaCompra` (`services/mercadopago.js`) and redirects to its `initPoint`.
    - On completion, clears the cart and local storage.

- **PedidosContext (`src/context/PedidosContext.jsx`)**
  - Subscribes in real-time to the `compras` collection filtered by the current Firebase user.
  - Categorizes orders by status: `pendiente`, `pagado`, `retirado`.
  - Manages **automatic expiration** of pending orders:
    - Schedules a `setTimeout` per pending order based on its creation time + 15 minutes.
    - On expiration, calls `devolverStock` (returns quantities to `productos` collection) and deletes the order doc.
    - Shows a small toast-style message via `mostrarMensaje` from `utils/utils.js`.
  - Exposes `abrirPendientes`, which toggles the UI state and scrolls to the on-page `#container-pedidos` element. The cart uses this after hitting pending-order limits.

- **QR contexts**
  - `QrContext` (`src/context/QrContext.jsx`): global modal for **ticket QRs (entradas)**.
    - `mostrarQrReact` sets `qrData` and toggles a full-screen overlay.
    - On open, uses `services/generarQrService.js` to render a QR into a DOM node and displays metadata (event name, date, location, price).
  - `QrCompraContext` (`src/context/QrCompraContext.jsx`): similar overlay for **purchase QRs**.
    - Uses `qrcodejs2-fix` directly to generate a QR from `Compra:{ticketId}`.

Navbar and layout components integrate this flow:
- `components/Navbar.jsx` shows total cart quantity using `CarritoContext` and opens `CarritoOverlay`.
- `components/layout/Layout.jsx` composes `Header`, route content via `Outlet`, and `CarritoOverlay` at the end of the DOM to ensure overlay behavior is consistent across pages.

### Tickets and events (Entradas)

Ticketing has its own context plus a set of pure logic modules under `src/logic/entradas/` and Swal-based UI services:

- **EntradasContext (`src/context/EntradasContext.jsx`)**
  - Loads `eventos` from Firestore, sorts them chronologically, and exposes them to the UI.
  - Tracks:
    - `misEntradas` (user’s tickets from `entradas` collection).
    - `entradasPendientes` (pending ticket requests from `entradasPendientes`).
    - `entradasUsadas` / `historialEntradas` (used tickets from `entradas` / `entradasUsadas`).
  - Uses Firestore listeners to keep pending entries in sync in real-time.
  - Core method `pedirEntrada(evento)` drives the end-to-end ticket request flow:
    - Ensures the user is logged in; otherwise shows a Swal and triggers the global login.
    - Calls `calcularCuposEvento` from `logic/entradas/entradasEventos.js` to compute per-user limits, lot inventory, and remaining quotas.
    - For events **with lots (lotes)**:
      - Shows a lot selection UI via `abrirSeleccionLote` (`services/entradasSwal.js`).
      - Depending on the selected lot’s price:
        - Routes to free-ticket helpers (`pedirEntradaFreeConLote`) or
        - Payment helpers (`manejarTransferencia` / `manejarMercadoPago` from `entradasPago.js`).
    - For events **without lots**:
      - Branches between free tickets (`pedirEntradaFreeSinLote`) and paid tickets via `manejarTransferencia` / `manejarMercadoPago` with a virtual “Entrada general” lot.
    - Throughout, uses `abrirResumenLote` (also from `entradasSwal.js`) to show a confirmation summary with calculated remaining quotas and prices.
    - For free flows, shows the resulting QR via `useQr().mostrarQrReact` and reloads the user’s entries.

This decoupling makes it possible to enhance ticketing rules (limits, pricing, lot logic) in `logic/entradas/*` without touching React components, as long as the shapes consumed by `EntradasContext` and the Swal service functions stay consistent.

### Admin panel and back-office flows

- **AdminPage (`src/pages/AdminPage.jsx`)** is the main admin dashboard container.
  - Uses `useAuth` to obtain `user`, `rolUsuario`, and `permisos`, and calculates access to each module via a shared `acceso(mod)` helper.
  - Renders a sidebar with buttons for logical sections (events, tickets, purchases, dashboard, products, employees, QR validators, configuration).
  - Maintains `seccion` in state and switches between admin subcomponents:
    - `CrearEvento`, `ListaEventos`, `EditarEvento`.
    - `EntradasAdmin` (manage pending tickets).
    - `ComprasAdmin` (manage pending purchases).
    - `DashboardVentas`, `AdminProductos`, `AdminEmpleados`, `AdminConfiguracion`.
  - Subscribes to a helper in `services/entradasAdmin.js` (`escucharCantidadEntradasPendientes`) to update a real-time badge on the “Entradas” sidebar button.

- **QR validator and caja**
  - `components/qr/LectorQr.jsx` (and supporting modules in `components/qr/` and `components/validador/`) implement QR scanning for entries and caja (bar payments), using `modoInicial="entradas"` or `"caja"` depending on route.
  - These components sit behind `AdminRoute` with `modulo="qr"` or `modulo="caja"`, so permission changes must be coordinated.

### Services and shared utilities

- The `src/services/` directory centralizes side-effectful operations and backend integrations, including but not limited to:
  - Firestore CRUD for events, products, stock, and admin dashboards (`eventosAdmin.js`, `productosAdmin.js`, `stockService.js`, `entradasAdmin.js`, etc.).
  - Order and purchase handling (`comprasService.js`, `cajaService.js`, `pedidosAdmin.js`, `pedidosExpiracion.js`).
  - Ticket QR generation and validation (`generarQrService.js`, `lectorQr.js`, `mpEntradas.js`).
  - Mercado Pago interactions (`mercadopago.js`, `mpEntradas.js`).
- The `src/logic/` directory (currently focused on `logic/entradas/`) contains more domain-focused, less UI-aware helpers used by contexts and services.
- `src/utils/` holds cross-cutting helpers such as `utils.js` and SweetAlert utilities (`swalUtils.js`).

When adding new flows, prefer to:
- Put Firestore/MercadoPago calls and data transformations into `services/*` or `logic/*`.
- Keep React components responsible for orchestration and rendering, not data access.

## Key invariants for future changes

- **Provider tree order** in `src/main.jsx` is relied upon by multiple contexts. Do not move providers above/below each other without verifying all usages of their hooks (`useFirebase`, `useAuth`, `usePedidos`, `useCarrito`, `useCatalogo`, `useQr`, `useEntradas`, etc.).
- **Permissions contract** between Firestore and code:
  - `AuthContext` and `AdminRoute` expect a `configuracion/permisos` document keyed by `nivel{rol}` with arrays of module strings or `*`.
  - Route guards pass `modulo` strings that must match those arrays.
  - Changing these names in only one place will silently lock users out of modules.
- **Cart and stock integrity**:
  - Cart mutation and checkout flows assume `stock` is the single source of truth in `productos`. Any new purchase flow or admin mutation should use the existing stock helpers (`stockService.js`, `devolverStock`) or mimic their semantics.
- **Timers and order expiration** in `PedidosContext` rely on Firestore timestamps or ISO date strings; if schemas change, update both the query logic and the expiration scheduler.
- **QR generation** components manipulate the DOM directly using external QR libraries. If you refactor modals or containers, keep:
  - A stable container ref for QR rendering.
  - The text format fed into QR generation (e.g. `Compra:{ticketId}`, ticket IDs) consistent with whatever scanners or backends consume those codes.

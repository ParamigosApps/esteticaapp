// --------------------------------------------------------------
// src/main.jsx — ORDEN LIMPIO PARA ESTÉTICA
// --------------------------------------------------------------
import React from "react";
import ReactDOM from "react-dom/client";

import "./styles/index.css";
import "./styles/theme.css";

// Bootstrap
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap/dist/js/bootstrap.bundle.min.js";

// SweetAlert theme
import "./styles/swal/SwalTheme.css";

// App
import App from "./App.jsx";

// Providers
import { FirebaseProvider } from "./context/FirebaseContext.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";

import { BrowserRouter } from "react-router-dom";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <FirebaseProvider>
      <BrowserRouter>
        <AuthProvider>
          <ThemeProvider>
            <App />
          </ThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </FirebaseProvider>
  </React.StrictMode>,
);

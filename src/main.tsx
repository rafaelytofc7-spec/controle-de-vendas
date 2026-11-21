import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import "./styles.css";

const base = import.meta.env.BASE_URL;
const basename = base === "./" ? undefined : base.replace(/\/$/, "");

if (base !== "./") {
  void import("virtual:pwa-register")
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch(() => { /* PWA plugin ausente no build Android */ });
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);

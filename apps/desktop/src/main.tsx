import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { suppressBrowserChrome } from "./app/browserChrome";
import { loadThumbDir } from "./services/library/client";
import { startPlaybackBridge } from "./services/playback/client";
import { loadPrefs } from "./services/prefs";
import "./styles/index.css";

suppressBrowserChrome();
void startPlaybackBridge();

// Theme and thumbnail folder load before first paint to avoid a flash.
void Promise.all([loadPrefs(), loadThumbDir()]).finally(() =>
  createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
  ),
);

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

/** Lifts the starting logo (index.html) once the app has painted, after its short animation. */
function liftSplash() {
  const boot = document.getElementById("boot");
  if (!boot) return;
  const wait = Math.max(0, 900 - performance.now());
  setTimeout(() => {
    boot.classList.add("out");
    setTimeout(() => boot.remove(), 360);
  }, wait);
}

// Theme and thumbnail folder load before first paint to avoid a flash.
void Promise.all([loadPrefs(), loadThumbDir()]).finally(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  requestAnimationFrame(() => requestAnimationFrame(liftSplash));
});

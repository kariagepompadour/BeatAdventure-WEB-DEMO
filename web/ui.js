// Copyright (c) 2026 Kariage POMPADOUR Entertainment Corporation. MIT License.
"use strict";
(function () {
  const root = document.documentElement;
  const buttons = [...document.querySelectorAll("[data-setlang]")];
  window.refreshPauseLabel = function () {
    const button = document.getElementById("bStop");
    if (!button) return;
    const paused = button.getAttribute("aria-pressed") === "true";
    button.textContent = root.dataset.lang === "ja" ? (paused ? "画面を再開" : "画面を停止") : (paused ? "Resume screen" : "Stop screen");
  };
  function setLanguage(lang) {
    const chosen = lang === "ja" ? "ja" : "en";
    root.dataset.lang = chosen;
    root.lang = chosen;
    for (const button of buttons) button.classList.toggle("act", button.dataset.setlang === chosen);
    try { localStorage.setItem("beatAdventureLang", chosen); } catch (_) {}
    window.refreshPauseLabel();
    if (window.refreshAudioStatus) window.refreshAudioStatus();
  }
  for (const button of buttons) button.addEventListener("click", () => setLanguage(button.dataset.setlang));
  let saved;
  try { saved = localStorage.getItem("beatAdventureLang"); } catch (_) {}
  const browserJa = typeof navigator !== "undefined" && (navigator.language || "").toLowerCase().startsWith("ja");
  setLanguage(saved || (browserJa ? "ja" : "en"));
})();

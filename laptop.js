import { t, onLangChange } from "./i18n.js";

const overlay = document.getElementById("laptop-overlay");
const exitBtn = document.getElementById("laptop-exit");

exitBtn.textContent = t("laptopExit");
onLangChange(() => {
  exitBtn.textContent = t("laptopExit");
});

let onExit = null;

function close() {
  overlay.classList.add("hidden");
  const cb = onExit;
  onExit = null;
  if (cb) cb();
}

exitBtn.addEventListener("click", close);
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !overlay.classList.contains("hidden")) close();
});

export function openLaptop(onExitCallback, { animate = true } = {}) {
  onExit = onExitCallback;
  if (!animate) {
    // Skip the zoom-in transition for the auto-shown landing view — only
    // clicking the laptop later (after having seen the room) should animate.
    overlay.classList.add("no-anim");
    overlay.classList.remove("hidden");
    void overlay.offsetWidth; // flush the "no-anim" style before re-enabling
    requestAnimationFrame(() => overlay.classList.remove("no-anim"));
    return;
  }
  overlay.classList.remove("hidden");
}

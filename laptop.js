const overlay = document.getElementById("laptop-overlay");
const exitBtn = document.getElementById("laptop-exit");

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

export function openLaptop(onExitCallback) {
  onExit = onExitCallback;
  overlay.classList.remove("hidden");
}

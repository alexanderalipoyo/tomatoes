/* Use a visual hint before first paint; server preferences remain authoritative. */
(function (root) {
  const system = root.matchMedia("(prefers-color-scheme: dark)");
  const cacheKey = "tomatoes-color-mode-v1";
  let colorMode = "system";
  try {
    const cached = root.localStorage.getItem(cacheKey);
    if (["light", "dark", "system"].includes(cached)) colorMode = cached;
  } catch {
    /* Appearance still works when browser storage is unavailable. */
  }
  function update() {
    const theme =
      colorMode === "system" ? (system.matches ? "dark" : "light") : colorMode;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.colorMode = colorMode;
    document.documentElement.style.colorScheme = theme;
  }
  function apply(mode) {
    colorMode = ["light", "dark", "system"].includes(mode) ? mode : "system";
    try {
      root.localStorage.setItem(cacheKey, colorMode);
    } catch {
      /* A cache failure must never prevent a confirmed server preference. */
    }
    update();
  }
  system.addEventListener("change", update);
  root.Appearance = { apply };
  update();
})(globalThis);

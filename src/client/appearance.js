/* Apply system appearance until the user's server preferences are available. */
(function (root) {
  const system = root.matchMedia("(prefers-color-scheme: dark)");
  let colorMode = "system";
  function update() {
    const theme =
      colorMode === "system" ? (system.matches ? "dark" : "light") : colorMode;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.colorMode = colorMode;
    document.documentElement.style.colorScheme = theme;
  }
  function apply(mode) {
    colorMode = ["light", "dark", "system"].includes(mode) ? mode : "system";
    update();
  }
  system.addEventListener("change", update);
  root.Appearance = { apply };
  update();
})(globalThis);

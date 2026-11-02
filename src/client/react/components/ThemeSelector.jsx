import { useState } from "react";
export function ThemeSelector({ mode, ready, save, notify }) {
  const [pending, setPending] = useState(false);
  const [selected, setSelected] = useState(mode);
  return (
    <select
      className="topbar-theme-select"
      aria-label="Color theme"
      title="Color theme saved to your user preferences"
      value={selected}
      disabled={!ready || pending}
      aria-busy={pending}
      onChange={async (event) => {
        const next = event.target.value;
        setPending(true);
        try {
          const saved = await save(next);
          setSelected(saved);
          notify("Theme saved to your user preferences.", "success");
        } catch (error) {
          notify(error.message, "error");
        } finally {
          setPending(false);
        }
      }}
    >
      <option value="light">Light</option>
      <option value="dark">Dark</option>
      <option value="system">System</option>
    </select>
  );
}

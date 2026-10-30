import { runtimeScripts } from "./runtime-scripts";
let started;
export function startFeatureControllers() {
  if (started) return started;
  started = (async () => {
    for (const source of runtimeScripts) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = source;
        script.async = false;
        const cleanup = () =>
          window.removeEventListener("error", initializationError);
        const initializationError = (event) => {
          if (
            !event.filename ||
            new URL(event.filename, location.href).pathname !== source
          )
            return;
          cleanup();
          reject(
            new Error(
              `Could not initialize ${source}. Reload or check the deployment build.`,
            ),
          );
        };
        window.addEventListener("error", initializationError);
        script.onload = () => {
          cleanup();
          resolve();
        };
        script.onerror = () => {
          cleanup();
          reject(
            new Error(
              `Could not load ${source}. Reload or check the deployment build.`,
            ),
          );
        };
        document.head.append(script);
      });
    }
  })();
  return started;
}

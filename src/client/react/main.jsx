import { Component } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { ApplicationShell } from "./ApplicationShell";
import { AuthPage } from "./components/AuthPage";
import { startFeatureControllers } from "./runtime";
import { dashboardBridge } from "./report-bridge";
const authRoots = new WeakMap();
let authKey = 0;
function renderAuth(screen, props) {
  let root = authRoots.get(screen);
  if (!root) {
    root = createRoot(screen);
    authRoots.set(screen, root);
  }
  flushSync(() => root.render(<AuthPage key={++authKey} {...props} />));
}
function StartupError({ message }) {
  return (
    <main className="startup-error">
      <h1>Tomatoes could not start</h1>
      <p role="alert">{message}</p>
      <button className="button primary" onClick={() => location.reload()}>
        Reload Tomatoes
      </button>
    </main>
  );
}
class ErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <StartupError message="The interface could not render. Reload the page or check the latest deployment." />
    ) : (
      this.props.children
    );
  }
}
window.TomatoesReact = { renderAuth, ...dashboardBridge };
const root = createRoot(document.getElementById("root"));
// Commit the stable shell before compatibility controllers query their host elements.
flushSync(() =>
  root.render(
    <ErrorBoundary>
      <ApplicationShell />
    </ErrorBoundary>,
  ),
);
startFeatureControllers().catch((error) => {
  document.body.classList.remove("auth-checking", "auth-mode");
  root.render(<StartupError message={error.message} />);
});

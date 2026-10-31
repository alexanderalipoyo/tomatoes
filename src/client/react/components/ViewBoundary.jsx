import { Component } from "react";
export class ViewBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <article className="settings-card">
        <h2>This view could not render</h2>
        <p role="alert">
          Reload Tomatoes to try again, or open another page from navigation.
        </p>
        <button className="button primary" onClick={() => location.reload()}>
          Reload Tomatoes
        </button>
      </article>
    ) : (
      this.props.children
    );
  }
}

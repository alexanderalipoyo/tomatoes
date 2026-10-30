import { useEffect, useRef, useState } from "react";
export function AuthPage({ route, message, delivery, onSubmit }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(message || "");
  const [feedback, setFeedback] = useState(null);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  const reset = route === "reset-password";
  const forgot = route === "forgot-password";
  async function submit(event) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    if (reset && fields.get("password") !== fields.get("confirm")) {
      setError("Passwords do not match.");
      form.elements.confirm.focus();
      return;
    }
    setPending(true);
    setError("");
    setFeedback(null);
    try {
      const result = await onSubmit(fields);
      if (alive.current) {
        setFeedback(result || null);
        if (reset || !forgot) form.reset();
      }
    } catch (reason) {
      if (alive.current) setError(reason.message || "Please try again.");
    } finally {
      if (alive.current) setPending(false);
    }
  }
  return (
    <section className="auth-card" aria-labelledby="auth-title">
      <a className="auth-brand" href="#login">
        <img src="/assets/tomatoes-logo.svg" alt="" width="40" height="40" />
        <span>
          tomatoes<small>TEST REPORTING</small>
        </span>
      </a>
      <h1 id="auth-title">
        {reset
          ? "Set a new password"
          : forgot
            ? "Forgot your password?"
            : "Welcome to Tomatoes"}
      </h1>
      <p>
        {reset
          ? "Choose a strong password to secure your account."
          : forgot
            ? delivery === "local"
              ? "Enter your account email to request a reset link in the local recovery inbox."
              : "Enter your account email to request a password-reset email."
            : "Sign in to your workspace to explore your test results."}
      </p>
      <form id="auth-form" onSubmit={submit} aria-busy={pending}>
        <fieldset disabled={pending} className="auth-fields">
          {reset ? (
            <>
              <label>
                New password
                <input
                  type="password"
                  name="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={256}
                  required
                  aria-describedby="auth-password-help"
                />
              </label>
              <p className="auth-help" id="auth-password-help">
                Use 12–256 characters.
              </p>
              <label>
                Confirm password
                <input
                  type="password"
                  name="confirm"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={256}
                  required
                />
              </label>
            </>
          ) : (
            <>
              <label>
                {forgot ? "Account email" : "Email or username"}
                <input
                  type={forgot ? "email" : "text"}
                  name="email"
                  autoComplete="username"
                  maxLength={254}
                  required
                  placeholder="you@example.com"
                />
              </label>
              {!forgot && (
                <label>
                  Password
                  <input
                    type="password"
                    name="password"
                    autoComplete="current-password"
                    maxLength={256}
                    required
                  />
                </label>
              )}
            </>
          )}
          <p id="auth-error" role="alert">
            {error}
          </p>
          <div id="auth-feedback" role="status">
            {feedback?.message}
            {feedback?.delivery === "local" && (
              <div className="auth-recovery-help">
                <strong>Open the private recovery inbox</strong>
                <p>
                  On this computer, run the following from the Tomatoes folder,
                  replacing YOUR_EMAIL with your account email. Open the link it
                  displays.
                </p>
                <code>node scripts/password-recovery.js YOUR_EMAIL</code>
                <p>
                  No email is sent. Only someone with access to this computer
                  can retrieve the link.
                </p>
              </div>
            )}
          </div>
          <button className="button primary" type="submit" disabled={pending}>
            {pending
              ? forgot
                ? "Preparing link…"
                : reset
                  ? "Updating password…"
                  : "Signing in…"
              : reset
                ? "Reset password"
                : forgot
                  ? "Request reset link"
                  : "Sign in"}
          </button>
        </fieldset>
      </form>
      <a
        className="auth-link"
        href={forgot || reset ? "#login" : "#forgot-password"}
      >
        {forgot || reset ? "Back to sign in" : "Forgot password?"}
      </a>
      {reset && (
        <a className="auth-link" href="#forgot-password">
          Request a new reset link
        </a>
      )}
      <p className="auth-footer">Your reports. Your workspace.</p>
    </section>
  );
}

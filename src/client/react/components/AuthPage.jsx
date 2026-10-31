import { useEffect, useRef, useState } from "react";
import { AuthArtwork } from "./AuthArtwork";
function AuthIcon({ name, ...props }) {
  const paths = {
    mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="m3 7 9 6 9-6" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="3" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    hidden: (
      <>
        <path d="m3 3 18 18M9.9 5.2A12 12 0 0 1 12 5c6 0 10 7 10 7a19 19 0 0 1-3.2 3.9M6.5 6.5A22 22 0 0 0 2 12s4 7 10 7c1.8 0 3.4-.6 4.8-1.4M10 10a3 3 0 0 0 4 4" />
      </>
    ),
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    back: <path d="M19 12H5m5-5-5 5 5 5" />,
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name] || paths.lock}
    </svg>
  );
}
function PasswordField({
  name,
  label,
  autoComplete,
  minLength,
  forgotLink,
  help,
}) {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const id = `auth-${name}`;
  const caps = (event) =>
    setCapsLock(Boolean(event.getModifierState?.("CapsLock")));
  return (
    <div className="auth-field">
      <div className="auth-label-row">
        <label htmlFor={id}>{label}</label>
        {forgotLink && (
          <a className="auth-forgot" href="#forgot-password">
            Forgot password?
          </a>
        )}
      </div>
      <div className="auth-input-wrap">
        <AuthIcon name="lock" />
        <input
          id={id}
          type={visible ? "text" : "password"}
          name={name}
          autoComplete={autoComplete}
          minLength={minLength}
          maxLength={256}
          required
          placeholder={
            name === "confirm"
              ? "Re-enter your password"
              : "Enter your password"
          }
          aria-describedby={
            [help ? "auth-password-help" : "", capsLock ? `${id}-caps` : ""]
              .filter(Boolean)
              .join(" ") || undefined
          }
          onKeyDown={caps}
          onKeyUp={caps}
          onBlur={() => setCapsLock(false)}
        />
        <button
          className="auth-password-toggle"
          type="button"
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          aria-pressed={visible}
          aria-controls={id}
          onClick={() => setVisible((value) => !value)}
        >
          <AuthIcon name={visible ? "hidden" : "eye"} />
        </button>
      </div>
      {capsLock && (
        <p className="auth-caps" id={`${id}-caps`} role="status">
          Caps Lock is on.
        </p>
      )}
      {help && (
        <p className="auth-help" id="auth-password-help">
          Use 12–256 characters.
        </p>
      )}
    </div>
  );
}
export function AuthPage({ route, message, delivery, onSubmit }) {
  const successNotice = /^(Password updated|Signed out)/.test(message || "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(successNotice ? "" : message || "");
  const [feedback, setFeedback] = useState(successNotice ? { message } : null);
  const alive = useRef(true),
    busy = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const reset = route === "reset-password",
    forgot = route === "forgot-password";
  async function submit(event) {
    event.preventDefault();
    if (busy.current) return;
    const form = event.currentTarget,
      fields = new FormData(form);
    if (reset && fields.get("password") !== fields.get("confirm")) {
      setError("Passwords do not match.");
      form.elements.confirm.focus();
      return;
    }
    busy.current = true;
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
      fields.delete("password");
      fields.delete("confirm");
      form
        .querySelectorAll(
          'input[type="password"], input[name="password"], input[name="confirm"]',
        )
        .forEach((input) => {
          input.value = "";
        });
      busy.current = false;
      if (alive.current) setPending(false);
    }
  }
  return (
    <div className="auth-layout">
      <AuthArtwork />
      <div className="auth-panel">
        <div className="auth-panel-heading">
          <span>YOUR WORKSPACE</span>
          <AuthIcon name="lock" />
        </div>
        <section className="auth-card" aria-labelledby="auth-title">
          <a className="auth-brand auth-mobile-brand" href="#login">
            <img
              src="/assets/tomatoes-logo.svg"
              width="38"
              height="38"
              alt=""
            />
            <span>
              tomatoes<small>TEST REPORTING</small>
            </span>
          </a>
          {(forgot || reset) && (
            <a className="auth-back" href="#login">
              <AuthIcon name="back" />
              Back to sign in
            </a>
          )}
          <div className="auth-form-heading">
            <span className="auth-form-kicker">
              {reset
                ? "A FRESH START"
                : forgot
                  ? "LET’S GET YOU BACK IN"
                  : "GOOD TO SEE YOU AGAIN"}
            </span>
            <h1 id="auth-title">
              {reset
                ? "Set a new password"
                : forgot
                  ? "Forgot your password?"
                  : "Welcome back."}
            </h1>
            <p>
              {reset
                ? "A new password. The same familiar workspace."
                : forgot
                  ? delivery === "local"
                    ? "Enter your account email and we’ll prepare a link in your local recovery inbox."
                    : "Enter your account email and we’ll help you reset your password."
                  : "Sign in to pick up where your last run left off."}
            </p>
          </div>
          <form id="auth-form" onSubmit={submit} aria-busy={pending}>
            <fieldset disabled={pending} className="auth-fields">
              <legend className="visually-hidden">
                {reset
                  ? "Set your password"
                  : forgot
                    ? "Password recovery"
                    : "Sign in to Tomatoes"}
              </legend>
              {reset ? (
                <>
                  <PasswordField
                    name="password"
                    label="New password"
                    autoComplete="new-password"
                    minLength={12}
                    help
                  />
                  <PasswordField
                    name="confirm"
                    label="Confirm password"
                    autoComplete="new-password"
                    minLength={12}
                  />
                </>
              ) : (
                <>
                  <div className="auth-field">
                    <label htmlFor="auth-email">
                      {forgot ? "Account email" : "Email or username"}
                    </label>
                    <div className="auth-input-wrap">
                      <AuthIcon name="mail" />
                      <input
                        id="auth-email"
                        type={forgot ? "email" : "text"}
                        name="email"
                        autoComplete="username"
                        autoCapitalize="none"
                        spellCheck={false}
                        maxLength={254}
                        required
                        placeholder="you@example.com"
                      />
                    </div>
                  </div>
                  {!forgot && (
                    <PasswordField
                      name="password"
                      label="Password"
                      autoComplete="current-password"
                      forgotLink
                    />
                  )}
                </>
              )}
              {error && (
                <div
                  id="auth-error"
                  className="auth-message auth-message-error"
                  role="alert"
                >
                  <span className="auth-message-mark" aria-hidden="true">
                    !
                  </span>
                  <span>{error}</span>
                </div>
              )}
              {feedback?.message && (
                <div
                  id="auth-feedback"
                  className="auth-message auth-message-success"
                  role="status"
                >
                  <div>
                    {feedback.message}
                    {feedback.delivery === "local" && (
                      <details className="auth-recovery-help">
                        <summary>Open local recovery instructions</summary>
                        <p>
                          On this computer, run the following from the Tomatoes
                          folder, replacing YOUR_EMAIL with your account email.
                          Open the link it displays.
                        </p>
                        <code>
                          node scripts/password-recovery.js YOUR_EMAIL
                        </code>
                        <p>
                          No email is sent. Only someone with access to this
                          computer can retrieve the link.
                        </p>
                      </details>
                    )}
                  </div>
                </div>
              )}
              <button
                className="button primary auth-submit"
                type="submit"
                disabled={pending}
              >
                {pending ? (
                  <>
                    <span className="auth-button-spinner" aria-hidden="true" />
                    {forgot
                      ? "Preparing your link…"
                      : reset
                        ? "Updating password…"
                        : "Signing you in…"}
                  </>
                ) : (
                  <>
                    {reset
                      ? "Reset password"
                      : forgot
                        ? "Send reset link"
                        : "Sign in"}
                    <AuthIcon name="arrow" />
                  </>
                )}
              </button>
            </fieldset>
          </form>
          {reset ? (
            <a className="auth-secondary-link" href="#forgot-password">
              Need another link? Request a new one
            </a>
          ) : (
            !forgot && (
              <p className="auth-access-help">
                Need access? <span>Ask your workspace administrator.</span>
              </p>
            )
          )}
        </section>
        <p className="auth-panel-footer">
          <span className="auth-footer-dot" />
          Your reports. Your workspace.
          <span className="auth-footer-credit">
            Made by{" "}
            <a
              className="creator-link"
              href="https://github.com/alexanderalipoyo"
              target="_blank"
              rel="noopener noreferrer"
            >
              Alex Ali
            </a>
          </span>
        </p>
      </div>
    </div>
  );
}

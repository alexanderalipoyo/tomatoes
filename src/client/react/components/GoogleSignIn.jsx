import { useEffect, useRef, useState } from "react";
let sdk;
function loadGoogle() {
  if (window.google?.accounts?.id)
    return Promise.resolve(window.google.accounts.id);
  if (!sdk)
    sdk = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      const fail = () => {
        clearTimeout(timer);
        script.remove();
        sdk = null;
        reject(
          new Error(
            "Could not load Google sign-in. Check your connection or content blocker.",
          ),
        );
      };
      const timer = setTimeout(fail, 15000);
      script.onload = () => {
        clearTimeout(timer);
        if (window.google?.accounts?.id) resolve(window.google.accounts.id);
        else fail();
      };
      script.onerror = fail;
      document.head.append(script);
    });
  return sdk;
}
export function GoogleSignIn({ enabled, mode, onChallenge, onCredential }) {
  const host = useRef(null),
    busy = useRef(false);
  const [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [ready, setReady] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setError("");
    setReady(false);
    (async () => {
      const challenge = await onChallenge(mode);
      const google = await loadGoogle();
      if (!active) return;
      google.initialize({
        client_id: enabled.clientId,
        nonce: challenge.nonce,
        auto_select: false,
        callback: async (response) => {
          if (!active || busy.current) return;
          busy.current = true;
          setPending(true);
          setError("");
          try {
            await onCredential(response.credential);
          } catch (reason) {
            if (active)
              setError(
                reason.message || "Google sign-in failed. Please try again.",
              );
          } finally {
            busy.current = false;
            if (active) setPending(false);
          }
        },
      });
      host.current.replaceChildren();
      google.renderButton(host.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: mode === "signup" ? "signup_with" : "continue_with",
        shape: "rectangular",
        width: Math.min(360, host.current.clientWidth || 300),
      });
      setReady(true);
    })().catch((reason) => {
      if (active) setError(reason.message);
    });
    return () => {
      active = false;
    };
  }, [enabled, mode, retry]);
  if (!enabled)
    return (
      <p className="auth-access-help">
        Google sign-in needs administrator setup.
      </p>
    );
  return (
    <div className="auth-google" aria-busy={pending}>
      <div
        ref={host}
        inert={pending || !!error}
        className="auth-google-button"
      />
      {!ready && !error && <p role="status">Loading Google sign-in...</p>}
      {pending && <p role="status">Verifying your Google account...</p>}
      {error && (
        <div className="auth-message auth-message-error" role="alert">
          <p>{error}</p>
          <button
            className="button"
            type="button"
            onClick={() => setRetry((value) => value + 1)}
          >
            Try Google again
          </button>
        </div>
      )}
      <p className="auth-google-help">
        Use a verified Gmail account. Your Gmail password stays with Google.
      </p>
    </div>
  );
}
export function PendingAccess({ user, onRefresh, onSignOut }) {
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  const busy = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function action(callback, checking = false) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setMessage("");
    try {
      await callback();
      if (alive.current && checking)
        setMessage(
          "No organization membership yet. Ask an administrator to add your Gmail address in Users.",
        );
    } catch (error) {
      if (alive.current) setMessage(error.message);
    } finally {
      busy.current = false;
      if (alive.current) setPending(false);
    }
  }
  return (
    <main className="startup-error auth-pending">
      <img
        src="/assets/tomatoes-logo.svg"
        width="48"
        height="48"
        alt="Tomatoes"
      />
      <h1>Your account is ready</h1>
      <p>
        Signed in as <strong>{user.fullName || user.username}</strong>.
      </p>
      <p>
        Ask an organization administrator to add <strong>{user.email}</strong>{" "}
        through Users / Add user / Add an existing account. You will then see
        only your assigned organizations and projects.
      </p>
      <p role="status">{message}</p>
      <div className="settings-buttons">
        <button
          className="button primary"
          disabled={pending}
          onClick={() => action(onRefresh, true)}
        >
          Check access
        </button>
        <button
          className="button"
          disabled={pending}
          onClick={() => action(onSignOut)}
        >
          Sign out
        </button>
      </div>
    </main>
  );
}

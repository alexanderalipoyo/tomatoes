import { useRef, useState } from "react";
export function OrganizationList({ organizations, currentId, onSwitch }) {
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  return organizations
    .filter((organization) => organization.id !== currentId)
    .map((organization) => (
      <button
        className="workspace-menu-organization"
        type="button"
        key={organization.id}
        disabled={pending}
        onClick={async () => {
          if (busy.current) return;
          busy.current = true;
          setPending(true);
          try {
            await onSwitch(organization.id);
          } finally {
            busy.current = false;
            setPending(false);
          }
        }}
      >
        <span className="workspace-menu-avatar small" aria-hidden="true">
          {organization.logo ? (
            <img src={organization.logo} alt="" />
          ) : (
            organization.name.slice(0, 2).toUpperCase()
          )}
        </span>
        <strong>{organization.name}</strong>
      </button>
    ));
}
export function OrganizationCreateForm({ onCreate, onSwitch, onToast }) {
  const [name, setName] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [created, setCreated] = useState(null);
  const busy = useRef(false);
  async function submit(event) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const organization = await onCreate(name.trim());
      setCreated(organization);
      onToast("Organization created successfully.", "success");
    } catch (reason) {
      setError(reason.message);
      onToast(reason.message, "error");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <section className="project-editor-form">
      <div className="eyebrow">YOUR ORGANIZATIONS</div>
      <h2 id="detail-title">Add organization</h2>
      {created ? (
        <>
          <p role="status">
            <strong>{created.name}</strong> is ready. You are its administrator.
            Your existing organization and projects remain available in the
            organization menu.
          </p>
          <button
            className="button primary"
            disabled={pending}
            onClick={async () => {
              if (busy.current) return;
              busy.current = true;
              setPending(true);
              try {
                await onSwitch(created.id);
              } finally {
                busy.current = false;
                setPending(false);
              }
            }}
          >
            Open organization
          </button>
        </>
      ) : (
        <form onSubmit={submit}>
          <p>
            Create a separate space for projects and users. You will keep your
            current organization access.
          </p>
          <fieldset disabled={pending}>
            <label htmlFor="new-organization-name">Organization name</label>
            <input
              id="new-organization-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              required
              autoFocus
            />
          </fieldset>
          <p role="alert">{error}</p>
          <div className="project-editor-actions">
            <button
              className="button primary"
              disabled={pending || !name.trim()}
            >
              {pending ? "Creating..." : "Create organization"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

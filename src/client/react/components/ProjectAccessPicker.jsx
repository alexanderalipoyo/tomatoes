import { useState } from "react";
export function ProjectAccessPicker({
  projects,
  selected = [],
  readOnly = false,
}) {
  const [all, setAll] = useState(selected.includes("*"));
  const [chosen, setChosen] = useState(
    () => new Set(selected.filter((id) => id !== "*")),
  );
  const [query, setQuery] = useState("");
  const rows = projects.filter((item) =>
    `${item.name} ${item.id}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const toggle = (id) =>
    setChosen((before) => {
      const next = new Set(before);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  return (
    <fieldset className="project-access-picker" disabled={readOnly}>
      <legend>Project access</legend>
      <p className="project-access-description">
        Choose one or more projects in this organization.
      </p>
      <div className="project-access-modes">
        <label>
          <input
            type="radio"
            name="projectAccessMode"
            value="specific"
            checked={!all}
            onChange={() => setAll(false)}
          />
          <span>
            Specific projects<small>Access only the selected projects.</small>
          </span>
        </label>
        <label>
          <input
            type="radio"
            name="projectAccessMode"
            value="all"
            checked={all}
            onChange={() => setAll(true)}
          />
          <span>
            All projects<small>Includes projects created in the future.</small>
          </span>
        </label>
      </div>
      {all ? (
        <>
          <input type="hidden" name="projects" value="*" />
          <p className="project-access-all-note">
            This user can access every project in the current organization.
          </p>
        </>
      ) : (
        <>
          {[...chosen].map((id) => (
            <input key={id} type="hidden" name="projects" value={id} />
          ))}
          <div className="project-access-tools">
            <input
              type="search"
              aria-label="Search project access"
              placeholder="Search projects"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.preventDefault();
              }}
            />
            <span role="status">{chosen.size} selected</span>
          </div>
          <div className="project-access-list">
            {rows.map((project) => (
              <label
                key={project.id}
                className={chosen.has(project.id) ? "is-selected" : ""}
              >
                <input
                  type="checkbox"
                  checked={chosen.has(project.id)}
                  onChange={() => toggle(project.id)}
                  aria-label={project.name}
                />
                <span>
                  <strong>{project.name}</strong>
                  <small>{project.id}</small>
                </span>
              </label>
            ))}
            {!rows.length && (
              <p>
                {projects.length
                  ? "No projects match your search."
                  : "No projects yet. Create a project before assigning access."}
              </p>
            )}
          </div>
          <div className="project-access-actions">
            <button
              type="button"
              disabled={!rows.length}
              onClick={() =>
                setChosen(
                  (before) =>
                    new Set([...before, ...rows.map((item) => item.id)]),
                )
              }
            >
              Select all shown
            </button>
            <button
              type="button"
              disabled={!rows.some((item) => chosen.has(item.id))}
              onClick={() =>
                setChosen(
                  (before) =>
                    new Set(
                      [...before].filter(
                        (id) => !rows.some((item) => item.id === id),
                      ),
                    ),
                )
              }
            >
              Clear shown
            </button>
          </div>
          {!chosen.size && (
            <p className="project-access-required">
              Select at least one project, or choose All projects.
            </p>
          )}
        </>
      )}
    </fieldset>
  );
}

export function Icon({ name }) {
  const paths = {
    close: (
      <>
        <path d="m6 6 12 12M6 18 18 6" />
      </>
    ),
    integration: (
      <>
        <path d="m9 3 3 3-6 6-3-3m12 12-3-3 6-6 3 3M8 16l-4 4m12-12 4-4M8 12l4 4m0-8 4 4" />
      </>
    ),
    profile: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="9" r="3" />
        <path d="M6 19v-2a6 6 0 0 1 12 0v2" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2" />
      </>
    ),
    branch: (
      <>
        <path d="M6 3v12a6 6 0 0 0 12 0V9M14 5l4 4 4-4" />
        <circle cx="6" cy="5" r="2" />
      </>
    ),
    chart: (
      <>
        <path d="M4 3v17h17M8 15v-4m5 4V6m5 9v-6" />
      </>
    ),
    settings: (
      <>
        <path d="m9 3-1 3-3 1-2 4 2 3v4l4 3 3-1 3 1 4-3v-4l2-3-2-4-3-1-1-3Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    folder: (
      <>
        <path d="M3 7V5h6l2 2h10v12H3Z" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M5 8a8 8 0 0 1 13-3l2 3M4 16l2 3a8 8 0 0 0 13-3" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14M5 12h14" />
      </>
    ),
    search: (
      <>
        <circle cx="10" cy="10" r="6" />
        <path d="m15 15 5 5" />
      </>
    ),
    runs: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="m9 8 7 4-7 4Z" />
      </>
    ),
    check: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    failure: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m9 9 6 6m0-6-6 6" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 6v6l4 2" />
      </>
    ),
    flake: <path d="m12 2-2 7H4l5 5-2 8 7-9h6l-5-4 2-7Z" />,
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.runs}
    </svg>
  );
}

export function Icon({ name }) {
  const paths = {
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

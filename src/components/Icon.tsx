/** The handful of line icons the app uses (24px grid, stroke = currentColor). */
const PATHS = {
  play: <polygon points="7 4 20 12 7 20 7 4" />,
  cube: (
    <>
      <path d="M12 2.5 3.5 7v10l8.5 4.5 8.5-4.5V7z" />
      <path d="m3.5 7 8.5 4.5L20.5 7M12 11.5v10" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  // After Lucide's "gavel" (ISC licence): head, handle, and the two strike lines.
  gavel: (
    <>
      <path d="m14.5 12.5-8 8a2.12 2.12 0 1 1-3-3l8-8" />
      <path d="m16 16 6-6" />
      <path d="m8 8 6-6" />
      <path d="m9 7 8 8" />
      <path d="m21 11-8-8" />
    </>
  ),
  star: <polygon points="12 2.5 14.9 8.8 21.5 9.4 16.5 13.9 18 20.5 12 17 6 20.5 7.5 13.9 2.5 9.4 9.1 8.8" />,
  back: <path d="M15 18 9 12l6-6" />,
  chevron: <path d="m9 18 6-6-6-6" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  filter: <path d="M4 6h16M7 12h10M10 18h4" />,
  check: <path d="M5 12.5 10 17 19 7" />,
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5M12 7v5l3 2" />
    </>
  ),
  sparkle: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />,
  columns: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16M15 4v16" />
    </>
  ),
  cards: (
    <>
      <rect x="7" y="3" width="12" height="16" rx="2" />
      <path d="M5 7v12a2 2 0 0 0 2 2h9" />
    </>
  ),
  list: <path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 1.5-2M4 12l1 1 1.5-2M4 18l1 1 1.5-2" />,
  summary: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}

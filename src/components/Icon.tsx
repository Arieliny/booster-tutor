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
  // Scales of justice, after Lucide's "scale" (ISC licence). Ari picked it for the Judge.
  scales: (
    <>
      <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
      <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
      <path d="M7 21h10M12 3v18M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
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
  undo: <path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />,
  dice: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="M8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01" strokeWidth={2.6} strokeLinecap="round" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  // Who goes first.
  flag: <path d="M5 21V4M5 4h11l-2 3.5 2 3.5H5" />,
  heart: <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.1a4.3 4.3 0 0 1 7.5 2.7C19.5 15.4 12 20 12 20z" />,
  // Commander damage.
  sword: <path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2" />,
  // Counter symbols for the life counter.
  // The Phyrexian symbol (as on Phyrexian mana), Magic's usual mark for poison.
  phyrexian: (
    <>
      <circle cx="12" cy="12" r="5.5" />
      <path d="M12 2.5v19" />
    </>
  ),
  droplet: <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />,
  bolt: <path d="M13 2.5 4.5 14H11l-1 7.5L19.5 10H13z" />,
  rad: (
    <>
      <path d="M10.5 9.4 7.75 4.64a8.5 8.5 0 0 1 8.5 0L13.5 9.4a3 3 0 0 0-3 0z" />
      <path d="M15 12h5.5a8.5 8.5 0 0 1-4.25 7.36L13.5 14.6A3 3 0 0 0 15 12z" />
      <path d="m10.5 14.6-2.75 4.76A8.5 8.5 0 0 1 3.5 12H9a3 3 0 0 0 1.5 2.6z" />
    </>
  ),
  coins: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="2.5" />
      <path d="M5 6v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6M5 10v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4M5 14v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4" />
    </>
  ),
  storm: (
    <>
      <path d="M7 16a4.5 4.5 0 0 1-.5-9 5.5 5.5 0 0 1 10.6 1.5A3.75 3.75 0 0 1 17 16" />
      <path d="m12.5 12-2.5 4h3l-2 4.5" />
    </>
  ),
  gauge: (
    <>
      <path d="M4.5 18a8.5 8.5 0 1 1 15 0" />
      <path d="m12 14 4-5" />
      <circle cx="12" cy="14" r="1.2" />
    </>
  ),
  ticket: (
    <>
      <path d="M3.5 7h17v3a2 2 0 0 0 0 4v3h-17v-3a2 2 0 0 0 0-4z" />
      <path d="M14.5 7.5v9" strokeDasharray="1.6 2" />
    </>
  ),
  crown: <path d="M3.5 8 7.5 12 12 5l4.5 7 4-4-1.8 10H5.3zM5.3 20.5h13.4" />,
  door: (
    <>
      <path d="M5 21V8a7 7 0 0 1 14 0v13M3 21h18" />
      <path d="M14.5 13.5h.01" strokeWidth={2.6} strokeLinecap="round" />
    </>
  ),
  // The back of a Magic card: the card, its oval, and the five mana orbs. Card search in the life counter.
  cardBack: (
    <>
      <rect x="5" y="2.5" width="14" height="19" rx="2" />
      <ellipse cx="12" cy="12" rx="4.6" ry="6.6" />
      <path d="M12 11.1h.01M14.3 12.8h.01M13.4 15.4h.01M10.6 15.4h.01M9.7 12.8h.01" strokeWidth={2.2} />
    </>
  ),
  exit: <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M9 16l-4-4 4-4M5 12h11" />,
  refresh: <path d="M20 11a8 8 0 0 0-14.9-3.5M4 4v4h4M4 13a8 8 0 0 0 14.9 3.5M20 20v-4h-4" />,
  more: <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth={2.8} strokeLinecap="round" />,
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

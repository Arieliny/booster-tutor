import type { Section } from "../lib/routes";
import { Footer } from "./Footer";
import { Icon, type IconName } from "./Icon";

const SECTION_ICON: Record<Section, IconName> = {
  play: "play",
  myCube: "cube",
  lookup: "search",
  grades: "star",
};

export interface NavItem {
  id: Section;
  label: string;
}

/**
 * The frame around every screen: a slim top bar (page title, status, account),
 * the nav as a bottom bar on a phone and a sidebar on a laptop. With only one
 * section to show (a guest with a single feature), there's no nav at all.
 */
export function AppShell({
  nav,
  active,
  onNavigate,
  title,
  right,
  children,
}: {
  nav: NavItem[];
  active: Section | null;
  onNavigate: (s: Section) => void;
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const showNav = nav.length > 1;

  return (
    <div className="min-h-screen md:flex print:block print:min-h-0">
      {showNav && (
        <aside className="sticky top-0 hidden h-screen w-52 shrink-0 flex-col border-r border-(--color-border) bg-(--color-bg-elev) md:flex print:hidden">
          <div className="px-5 pt-5 pb-4">
            <div className="text-lg font-semibold text-(--color-text)">Booster Tutor</div>
          </div>
          <nav aria-label="Main" className="flex flex-col gap-0.5 px-2">
            {nav.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => onNavigate(n.id)}
                aria-current={active === n.id ? "page" : undefined}
                className={
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm " +
                  (active === n.id
                    ? "bg-(--color-accent)/15 font-medium text-(--color-accent-bright)"
                    : "text-(--color-text-dim) hover:bg-white/5 hover:text-(--color-text)")
                }
              >
                <Icon name={SECTION_ICON[n.id]} />
                {n.label}
              </button>
            ))}
          </nav>
        </aside>
      )}

      <div className={"flex min-w-0 flex-1 flex-col " + (showNav ? "pb-16 md:pb-0" : "") + " print:pb-0"}>
        <header className="sticky top-0 z-30 border-b border-(--color-border) bg-(--color-bg)/95 backdrop-blur print:hidden">
          <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-4 sm:px-6">
            <h1 className="min-w-0 flex-1 truncate text-lg font-semibold text-(--color-text)">{title}</h1>
            {right}
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 print:max-w-none print:p-0">{children}</main>
        <Footer />
      </div>

      {showNav && (
        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-40 flex border-t border-(--color-border) bg-(--color-bg-elev) pb-[env(safe-area-inset-bottom)] md:hidden print:hidden"
        >
          {nav.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => onNavigate(n.id)}
              aria-current={active === n.id ? "page" : undefined}
              className={
                "flex flex-1 flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] " +
                (active === n.id ? "text-(--color-accent-bright)" : "text-(--color-text-dim)")
              }
            >
              <Icon name={SECTION_ICON[n.id]} className="h-6 w-6" />
              {n.label}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

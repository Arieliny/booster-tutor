import { useState } from "react";
import { Sheet } from "./Sheet";

const link = "underline hover:text-(--color-accent)";

/** The full Fan Content Policy notice and Scryfall attribution. */
function AboutNotice() {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-(--color-text-dim)">
      <p>
        <strong className="text-(--color-text)">Booster Tutor</strong> is unofficial Fan Content permitted under the{" "}
        <a href="https://company.wizards.com/en/legal/fancontentpolicy" target="_blank" rel="noopener noreferrer" className={link}>
          Wizards of the Coast Fan Content Policy
        </a>
        . Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of
        the Coast LLC.
      </p>
      <p>
        Magic: The Gathering, its names, mana symbols, set symbols, and card images are property of Wizards of the Coast LLC.
        This is a free, non-commercial fan tool for resolving the <em>Booster Tutor</em> card in casual cube play. No claim of
        ownership is made over any Wizards of the Coast intellectual property.
      </p>
      <p>
        Card data and images via{" "}
        <a href="https://scryfall.com" target="_blank" rel="noopener noreferrer" className={link}>
          Scryfall
        </a>
        . Scryfall is not affiliated with this tool. Card images are displayed unmodified per Scryfall's image guidelines.
      </p>
      <p>
        Life counter coin art (dragon head and tail) by Delapouite from{" "}
        <a href="https://game-icons.net" target="_blank" rel="noopener noreferrer" className={link}>
          game-icons.net
        </a>
        , licensed{" "}
        <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener noreferrer" className={link}>
          CC BY 3.0
        </a>
        .
      </p>
    </div>
  );
}

export function AboutSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="About Booster Tutor" onClose={onClose}>
      <AboutNotice />
    </Sheet>
  );
}

/** One line at the bottom of every page; the full notice opens in About. */
export function Footer() {
  const [open, setOpen] = useState(false);
  return (
    <footer className="mx-auto w-full max-w-7xl px-4 pt-6 pb-4 text-center text-xs text-(--color-text-dim) sm:px-6 print:hidden">
      Unofficial Fan Content, not approved/endorsed by Wizards of the Coast ·{" "}
      <button type="button" onClick={() => setOpen(true)} className={link}>
        About
      </button>
      {open && <AboutSheet onClose={() => setOpen(false)} />}
    </footer>
  );
}

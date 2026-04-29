export function Footer() {
  return (
    <footer className="mx-auto mt-12 max-w-7xl border-t border-(--color-border) p-4 text-center text-xs leading-relaxed text-(--color-text-dim) sm:p-6 lg:p-8">
      <p className="mb-2">
        <strong className="text-(--color-text)">Booster Tutor</strong> is unofficial
        Fan Content permitted under the{" "}
        <a
          href="https://company.wizards.com/en/legal/fancontentpolicy"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-(--color-accent)"
        >
          Wizards of the Coast Fan Content Policy
        </a>
        . Not approved/endorsed by Wizards. Portions of the materials used are
        property of Wizards of the Coast. ©Wizards of the Coast LLC.
      </p>
      <p className="mb-2">
        Magic: The Gathering, its names, mana symbols, set symbols, and card
        images are property of Wizards of the Coast LLC. This is a free,
        non-commercial fan tool for resolving the <em>Booster Tutor</em> card
        in casual cube play. No claim of ownership is made over any Wizards of
        the Coast intellectual property.
      </p>
      <p>
        Card data and images via{" "}
        <a
          href="https://scryfall.com"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-(--color-accent)"
        >
          Scryfall
        </a>
        . Scryfall is not affiliated with this tool. Card images are displayed
        unmodified per Scryfall's image guidelines.
      </p>
    </footer>
  );
}

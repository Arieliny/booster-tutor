import { useCardDb } from "../lib/card-db";
import { CardDbPanel } from "./CardLookup";
import { Sheet } from "./Sheet";

/** Settings (owner): the offline card database for now. */
export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const cardDb = useCardDb();
  return (
    <Sheet title="Settings" onClose={onClose}>
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-(--color-text)">Card database</h3>
        <p className="text-sm text-(--color-text-dim)">
          Every Magic card's text on this device, so Look up finds any card by name or rules text with no connection. Without
          it, cards outside your cubes come from Scryfall.
        </p>
        <CardDbPanel db={cardDb} />
      </section>
    </Sheet>
  );
}

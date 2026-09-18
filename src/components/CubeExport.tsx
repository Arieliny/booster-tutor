import type { Cube } from "../types";
import {
  PANCAKE_PACK_SIZE,
  downloadText,
  pancakeBoostersPerPlayer,
  pancakeCardsUsed,
  safeFilename,
  toCubeList,
  toPancakeFile,
} from "../lib/cube-export";
import { Modal } from "./Modal";

interface Props {
  cube: Cube;
  onClose: () => void;
}

/**
 * Download a cube as plain text — either a bare list, or a Draftmancer custom
 * card list preconfigured for a two-player pancake draft.
 *
 * Exporting is read-only, so it stays available whether or not editing is
 * unlocked.
 */
export function CubeExport({ cube, onClose }: Props) {
  const base = safeFilename(cube.name);
  const boosters = pancakeBoostersPerPlayer(cube.cards.length);
  const used = pancakeCardsUsed(boosters);
  const short = cube.cards.length < used;

  return (
    <Modal onClose={onClose}>
      <h2 className="mb-1 text-lg font-medium text-(--color-text)">
        Export {cube.name}
      </h2>
      <p className="mb-4 text-sm text-(--color-text-dim)">
        {cube.cards.length} cards, one per line as{" "}
        <code className="text-(--color-text)">1 Name (SET) 123</code> — exact
        printings included.
      </p>

      <div className="space-y-3">
        <div className="rounded-lg border border-(--color-border) bg-black/30 p-4">
          <div className="mb-1 text-sm font-medium text-(--color-text)">
            Cube list
          </div>
          <p className="mb-3 text-xs text-(--color-text-dim)">
            A plain list. Upload to Draftmancer as a custom card list, or use it
            with CubeCobra, Cockatrice or MTGO.
          </p>
          <button
            type="button"
            onClick={() => downloadText(`${base}.txt`, toCubeList(cube))}
            className="rounded bg-(--color-accent) px-4 py-2 text-sm font-medium text-black hover:bg-(--color-accent-bright)"
          >
            Download {base}.txt
          </button>
        </div>

        <div className="rounded-lg border border-(--color-border) bg-black/30 p-4">
          <div className="mb-1 text-sm font-medium text-(--color-text)">
            Pancake draft (2 players)
          </div>
          <p className="mb-2 text-xs text-(--color-text-dim)">
            The same list plus a Draftmancer <code>[Settings]</code> block that
            sets the format up for you: {PANCAKE_PACK_SIZE}-card packs,{" "}
            {boosters} packs each, and per pack — pick 1, pass, pick 2 burn 2,
            pass back, pick 2 burn 4.
          </p>
          <p className="mb-3 text-xs text-(--color-text-dim)">
            Uses {used} of {cube.cards.length} cards, drawn at random.
            {short && " Your cube is smaller than the usual 198, so the pack count is reduced to fit."}
          </p>
          <button
            type="button"
            onClick={() =>
              downloadText(`${base}-pancake.txt`, toPancakeFile(cube))
            }
            className="rounded bg-(--color-accent) px-4 py-2 text-sm font-medium text-black hover:bg-(--color-accent-bright)"
          >
            Download {base}-pancake.txt
          </button>
        </div>
      </div>

      <p className="mt-3 text-xs text-(--color-text-dim)">
        In Draftmancer: <span className="text-(--color-text)">Upload a Custom
        Card List…</span> then start a draft. The pancake file carries its own
        settings, so just set the session to 2 players.
      </p>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-(--color-border) px-4 py-2 text-sm text-(--color-text-dim) hover:bg-white/5"
        >
          Done
        </button>
      </div>
    </Modal>
  );
}

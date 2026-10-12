import { useEffect, useEffectEvent } from "react";

/** The entry of a popup that just closed, until its removal goes through. */
let releasing: string | null = null;

/**
 * For popups and sheets: the phone's Back button (or gesture) closes the popup
 * instead of leaving the page. Call it inside the popup component, which is
 * only mounted while open.
 *
 * Opening adds a history entry on the same URL; Back pops it and closes the
 * popup. Closing any other way (✕, tapping outside) removes that entry again,
 * so entries never pile up.
 */
export function useBackToClose(onClose: () => void): void {
  const close = useEffectEvent(onClose);

  useEffect(() => {
    const current = (window.history.state as { overlay?: string } | null)?.overlay;
    let marker: string;
    if (releasing && current === releasing) {
      // A popup that remounts straight away (React's dev double mount, or one
      // popup replacing another) takes over the entry instead of adding one.
      marker = releasing;
      releasing = null;
    } else {
      marker = Math.random().toString(36).slice(2);
      window.history.pushState({ ...(window.history.state ?? {}), overlay: marker }, "");
    }

    let poppedByBack = false;
    const onPop = () => {
      poppedByBack = true;
      close();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (poppedByBack) return;
      releasing = marker;
      setTimeout(() => {
        if (releasing !== marker) return; // taken over
        releasing = null;
        if ((window.history.state as { overlay?: string } | null)?.overlay === marker) window.history.back();
      }, 0);
    };
  }, []);
}

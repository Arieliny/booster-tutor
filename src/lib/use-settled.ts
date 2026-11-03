import { useEffect, useState } from "react";

/** `value` once it has stopped changing for `ms` (e.g. a search box once typing pauses). */
export function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return settled;
}

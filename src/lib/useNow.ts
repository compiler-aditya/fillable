import { useEffect, useState } from "react";

/** A clock that ticks once a minute, so "3m ago" stays honest on a long-open tab. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

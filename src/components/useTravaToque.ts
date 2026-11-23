import { useCallback, useRef, useState } from "react";

/** Synchronous re-entry lock. State alone is too late for a second tap in the same tick. */
export function useTravaToque() {
  const travado = useRef(false);
  const [ocupado, setOcupado] = useState(false);

  const comecar = useCallback(() => {
    if (travado.current) return false;
    travado.current = true;
    setOcupado(true);
    return true;
  }, []);

  const soltar = useCallback(() => {
    travado.current = false;
    setOcupado(false);
  }, []);

  return { comecar, soltar, ocupado };
}

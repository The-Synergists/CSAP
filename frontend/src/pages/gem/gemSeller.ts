// The simulated marketplace identifies a seller by PAN, remembered in this browser only.

import { useCallback, useEffect, useState } from 'react';

const KEY = 'gem.sellerPan';

const read = () => {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
};

const EVENT = 'gem-seller-changed';

export function rememberSeller(pan: string) {
  try {
    localStorage.setItem(KEY, pan);
  } catch {
    /* storage unavailable: the seller simply signs in again */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useSellerPan(): [string, (pan: string) => void] {
  const [pan, setPan] = useState(read);
  useEffect(() => {
    const sync = () => setPan(read());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  const set = useCallback((p: string) => rememberSeller(p), []);
  return [pan, set];
}

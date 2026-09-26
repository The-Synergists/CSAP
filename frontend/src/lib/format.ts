const IST = 'Asia/Kolkata';

export const formatINR = (amount: number): string =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);

/** ₹1.50 Cr / ₹85.00 L — the way values are written on Indian tender documents. */
export const formatCrore = (amount: number): string =>
  amount >= 1e7 ? `₹${(amount / 1e7).toFixed(2)} Cr` : `₹${(amount / 1e5).toFixed(2)} L`;

export const formatCr = (amountCr: number): string => `₹${amountCr.toFixed(2)} Cr`;

/** 05 Sep 2026 — accepts ISO dates or datetimes. */
export const formatDate = (iso: string): string =>
  new Date(iso.length === 10 ? `${iso}T00:00:00+05:30` : iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: IST,
  });

/** 05 Sep 2026, 10:12 (IST). */
export const formatDateTime = (iso: string): string => {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: IST });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: IST });
  return `${date}, ${time}`;
};

export const toTenderSlug = (tenderId: string): string => tenderId.replace(/\//g, '-');

export const tenderPath = (tenderId: string, tab?: string): string =>
  `/tenders/${toTenderSlug(tenderId)}${tab ? `/${tab}` : ''}`;

export const bidPath = (bidId: string, tab?: string): string => `/bids/${bidId}${tab ? `/${tab}` : ''}`;

export const plural = (n: number, word: string, pluralWord = `${word}s`): string =>
  `${n} ${n === 1 ? word : pluralWord}`;

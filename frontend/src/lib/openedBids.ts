// Bids the signed-in officer has opened (kept in this browser), so My Reviews can list the reviews
// the officer has started rather than every bid in the system.

const key = (userId: string) => `csap.openedBids.${userId}`;

export const openedBids = (userId?: string): Record<string, string> => {
  if (!userId) return {};
  try {
    return JSON.parse(localStorage.getItem(key(userId)) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
};

export const markBidOpened = (userId: string | undefined, bidId: string) => {
  if (!userId) return;
  try {
    const all = openedBids(userId);
    all[bidId] = new Date().toISOString();
    localStorage.setItem(key(userId), JSON.stringify(all));
    window.dispatchEvent(new Event('csap:opened-bids'));
  } catch {
    /* storage unavailable: My Reviews then shows only decided bids */
  }
};

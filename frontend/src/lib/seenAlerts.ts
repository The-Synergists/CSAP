// Which alerts the officer has already seen (kept in this browser), so the bell counts only new ones.
// An alert's signature changes when its content changes, so a new problem on the same bid is new again.

import type { Alert } from '@shared/domain/selectors';

const key = (userId: string) => `csap.seenAlerts.${userId}`;
export const alertSignature = (a: Alert) => `${a.bidId}|${a.items.map((i) => i.title).join('|')}`;

export const seenAlerts = (userId?: string): Set<string> => {
  if (!userId) return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(key(userId)) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
};

export const markAlertsSeen = (userId: string | undefined, alerts: Alert[]) => {
  if (!userId) return;
  try {
    localStorage.setItem(key(userId), JSON.stringify(alerts.map(alertSignature)));
    window.dispatchEvent(new Event('csap:alerts-seen'));
  } catch {
    /* storage unavailable: the bell keeps counting open alerts */
  }
};

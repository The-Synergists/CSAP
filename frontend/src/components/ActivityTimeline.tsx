import React from 'react';
import { Link } from 'react-router-dom';
import type { AuditEvent } from '@shared/domain/types';
import { bidPath, formatDateTime } from '../lib/format';

const ACTOR_STYLE: Record<AuditEvent['actorType'], { dot: string; label: string }> = {
  OFFICER: { dot: 'bg-blue-700', label: 'Officer' },
  SYSTEM: { dot: 'bg-slate-400', label: 'System' },
  BIDDER: { dot: 'bg-emerald-600', label: 'Bidder' },
};

/** Chronological event list. Newest first unless `ascending`. */
export const ActivityTimeline: React.FC<{ events: AuditEvent[]; showBid?: boolean; ascending?: boolean }> = ({
  events,
  showBid = false,
  ascending = false,
}) => {
  const sorted = [...events].sort((a, b) => (ascending ? a.timestamp.localeCompare(b.timestamp) : b.timestamp.localeCompare(a.timestamp)));
  if (!sorted.length) return <p className="py-6 text-center text-xs text-slate-500">No activity recorded.</p>;
  return (
    <ol className="relative space-y-4 border-l border-slate-200 pl-5">
      {sorted.map((e) => (
        <li key={e.id} className="relative">
          <span aria-hidden className={`absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white ${ACTOR_STYLE[e.actorType].dot}`} />
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="text-xs font-medium text-slate-900">{e.summary}</p>
            <time dateTime={e.timestamp} className="font-mono text-xs text-slate-500">
              {formatDateTime(e.timestamp)}
            </time>
          </div>
          <p className="mt-0.5 text-xs text-slate-600">{e.details}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {e.actor} · {ACTOR_STYLE[e.actorType].label}
            {showBid && e.bidId && (
              <>
                {' · '}
                <Link to={bidPath(e.bidId)} className="font-mono text-blue-700 hover:underline">
                  {e.bidId}
                </Link>
              </>
            )}
          </p>
        </li>
      ))}
    </ol>
  );
};

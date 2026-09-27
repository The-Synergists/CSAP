import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { BidView } from '@shared/domain/selectors';
import { BidStatusBadge, EmdBadge, RiskBadge } from '../ui/Badge';
import { buttonClass } from '../ui/styles';
import { bidPath } from '../../lib/format';

/**
 * The one bid table used by the tender Bids tab and the Bidders page, so columns and
 * actions are identical wherever bids are listed. Rows are keyboard-accessible links.
 */
export const BidTable: React.FC<{ views: BidView[]; showTender?: boolean; actionLabel?: string }> = ({
  views,
  showTender = false,
  actionLabel = 'Open bid',
}) => {
  const navigate = useNavigate();
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[860px] text-left text-xs text-slate-700">
        <thead className="border-b border-slate-200 bg-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
          <tr>
            <th scope="col" className="px-4 py-3">Bidder</th>
            {showTender && <th scope="col" className="px-4 py-3">Tender</th>}
            <th scope="col" className="px-4 py-3 text-right">Compliance</th>
            <th scope="col" className="px-4 py-3">Risk</th>
            <th scope="col" className="px-4 py-3">EMD</th>
            <th scope="col" className="px-4 py-3 text-center">Docs</th>
            <th scope="col" className="px-4 py-3">Primary issue</th>
            <th scope="col" className="px-4 py-3">Status</th>
            <th scope="col" className="px-4 py-2.5"><span className="sr-only">Action</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {views.map((v) => (
            <tr key={v.bid.id} onClick={() => navigate(bidPath(v.bid.id))} className="cursor-pointer align-top hover:bg-slate-50">
              <td className="px-4 py-3">
                <div className="font-medium text-slate-900">{v.bidder.companyName}</div>
                <div className="font-mono text-xs text-slate-500">{v.bid.id} · {v.bidder.gstin}</div>
              </td>
              {showTender && <td className="px-4 py-3 font-mono text-xs text-slate-600">{v.tender.id}</td>}
              {v.checks.length === 0 ? (
                // Automatic verification still running: no score or risk yet.
                <td colSpan={2} className="px-4 py-3 text-right text-xs italic text-slate-500">Verifying…</td>
              ) : (
                <>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">{v.bid.complianceScore}</td>
                  <td className="px-4 py-3"><RiskBadge level={v.bid.riskLevel} score={v.bid.riskScore} /></td>
                </>
              )}
              <td className="px-4 py-3"><EmdBadge result={v.emd?.result} /></td>
              <td className={`px-4 py-3 text-center font-mono ${v.documents.length < v.documentsRequired ? 'font-semibold text-rose-700' : 'text-slate-700'}`}>
                {v.documents.length}/{v.documentsRequired}
              </td>
              <td className="max-w-[260px] px-4 py-3 text-xs text-slate-600">
                {v.openFindings[0]?.title ?? v.findings[0]?.title ?? <span className="text-slate-400">None</span>}
                {v.counts.exceptions > 1 && <span className="text-slate-400"> · +{v.counts.exceptions - 1} more</span>}
              </td>
              <td className="px-4 py-3"><BidStatusBadge status={v.bid.status} /></td>
              <td className="px-4 py-3 text-right">
                <a
                  href={bidPath(v.bid.id)}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    navigate(bidPath(v.bid.id));
                  }}
                  className={buttonClass('secondary', 'sm')}
                  aria-label={`${actionLabel}: ${v.bidder.companyName}`}
                >
                  {actionLabel} <ArrowRight className="h-3.5 w-3.5" />
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

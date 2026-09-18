import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { useProcurement } from '../../context/ProcurementContext';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { RiskBadge } from '../../components/ui/RiskBadge';

export const MyReviewsPage: React.FC = () => {
  const navigate = useNavigate();
  const { bids, selectBid, metrics } = useProcurement();
  const pendingBids = bids.filter((b) => !b.officerDecision);

  const handleReview = (bidId: string) => {
    selectBid(bidId);
    navigate(`/bids/${bidId}`);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Pending Officer Reviews
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Bids where AI automated checks are complete and formal Officer Sign-off is pending
          </p>
        </div>
        <span className="text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300 px-2.5 py-1 rounded">
          {metrics.pendingReviews} Action Items
        </span>
      </div>

      {pendingBids.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-md p-10 text-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-800">No pending reviews.</p>
          <p className="text-xs text-slate-500 mt-1">
            Every bid has a formal officer decision recorded against it.
          </p>
        </div>
      ) : (
      <div className="bg-white border border-slate-200 rounded-md shadow-2xs overflow-hidden">
        <div className="divide-y divide-slate-200">
          {pendingBids.map((bidder) => (
            <div
              key={bidder.id}
              onClick={() => handleReview(bidder.id)}
              className="p-4 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-xs text-slate-900">{bidder.companyName}</span>
                  <span className="font-mono text-[11px] text-slate-400">({bidder.id})</span>
                  <StatusBadge status={bidder.status} size="sm" />
                  <RiskBadge level={bidder.riskLevel} score={bidder.riskScore} />
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  Primary Finding: <span className="font-medium text-slate-800">{bidder.primaryConcern}</span>
                </p>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Tender: <span className="font-mono text-blue-700">{bidder.tenderId}</span> • Compliance Score: {bidder.overallComplianceScore}%
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleReview(bidder.id);
                }}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold self-start sm:self-center flex items-center gap-1.5 shadow-xs transition-colors"
              >
                <span>Execute Review</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  );
};

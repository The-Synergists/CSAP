import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Users,
  CheckCircle2,
  Clock,
  AlertOctagon,
  Percent,
  ArrowRight,
  ShieldAlert,
  CreditCard,
  ExternalLink,
} from 'lucide-react';
import { useProcurement } from '../../context/ProcurementContext';
import { MetricCard } from '../../components/ui/MetricCard';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { RiskBadge } from '../../components/ui/RiskBadge';
import { toTenderSlug, type Bid } from '../../types';
import { getActiveAlerts } from '../../utils/alerts';

function emdBadge(bid: Bid): { label: string; className: string } {
  const emd = bid.emd;
  if (!emd) return { label: 'Pending', className: 'bg-slate-100 text-slate-600 border-slate-200' };
  if (emd.verificationResult === 'EXEMPTION_CONFIRMED') {
    return { label: 'Exempted', className: 'bg-blue-50 text-blue-700 border-blue-200' };
  }
  if (emd.verificationResult === 'EMD_AMOUNT_MISMATCH' || emd.verificationResult === 'INVALID_INSTRUMENT') {
    return { label: 'Mismatch', className: 'bg-rose-100 text-rose-800 border-rose-300' };
  }
  if (emd.instrumentType === 'BANK_GUARANTEE') {
    return { label: `${emd.submittedAmountFormatted} BG`, className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  }
  return { label: `${emd.submittedAmountFormatted} Paid`, className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
}

function emdSubtext(bid: Bid): string {
  const emd = bid.emd;
  if (!emd) return 'Verification pending';
  if (emd.verificationResult === 'EXEMPTION_CONFIRMED') return 'MSME Exemption • Udyam Confirmed';
  if (emd.verificationResult === 'EMD_AMOUNT_MISMATCH') {
    const shortfall = emd.requiredAmount - emd.submittedAmount;
    return `₹${shortfall.toLocaleString('en-IN')} Shortfall in ${emd.instrumentType.replace(/_/g, '/')}`;
  }
  if (emd.instrumentType === 'BANK_GUARANTEE') return `Bank Guarantee • ${emd.bankName} SFMS Verified`;
  return `Online ${emd.instrumentType.replace(/_/g, '/')} Payment • ${emd.bankName} Reconciled`;
}

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { metrics, tenders, bids, selectTender, selectBid } = useProcurement();
  const alerts = getActiveAlerts(bids).slice(0, 3);
  const pendingBids = bids.filter((b) => !b.officerDecision);

  const handleSelectTender = (tenderId: string) => {
    selectTender(tenderId);
    navigate(`/tenders/${toTenderSlug(tenderId)}`);
  };

  const handleSelectBidder = (bidId: string, tenderId: string, tab?: string) => {
    selectBid(bidId, tenderId);
    if (tab) {
      navigate(`/bids/${bidId}/${tab}`);
    } else {
      navigate(`/bids/${bidId}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Context Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Procurement Verification Dashboard
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Chennai Petroleum Corporation Limited — Commercial & Contracts Division
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/tenders')}
            className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded flex items-center gap-1.5 transition-colors"
          >
            <span>View All Tenders</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 6 Key Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard
          label="Active Tenders"
          value={metrics.activeTenders}
          subtext="In verification phase"
          icon={<FileText className="w-4 h-4 text-slate-400" />}
        />
        <MetricCard
          label="Bids Under Verification"
          value={metrics.bidsUnderVerification}
          subtext="Total submissions"
          icon={<Users className="w-4 h-4 text-slate-400" />}
        />
        <MetricCard
          label="Fully Compliant"
          value={metrics.fullyCompliant}
          subtext="All criteria cleared"
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
          variant="success"
        />
        <MetricCard
          label="Pending Reviews"
          value={metrics.pendingReviews}
          subtext="Officer sign-off required"
          icon={<Clock className="w-4 h-4 text-amber-500" />}
          variant="warning"
        />
        <MetricCard
          label="High Risk"
          value={metrics.highRisk}
          subtext="Deficits or discrepancies"
          icon={<AlertOctagon className="w-4 h-4 text-rose-500" />}
          variant="danger"
        />
        <MetricCard
          label="Avg Compliance"
          value={`${metrics.averageCompliance}%`}
          subtext="Across active bids"
          icon={<Percent className="w-4 h-4 text-blue-500" />}
          variant="info"
        />
      </div>

      {/* Primary Section: Recent Tenders Table */}
      <div className="bg-white border border-slate-200 rounded-md shadow-2xs overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-500" />
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Recent Tenders Under Scrutiny
            </h2>
          </div>
          <span className="text-xs text-slate-500">Showing {tenders.length} active cases</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-4">Tender ID & Title</th>
                <th className="py-2.5 px-4 text-center">Bids Received</th>
                <th className="py-2.5 px-4 text-center">Avg Compliance</th>
                <th className="py-2.5 px-4">Risk Profile</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {tenders.map((tender) => (
                <tr
                  key={tender.id}
                  className="hover:bg-blue-50/40 transition-colors cursor-pointer"
                  onClick={() => handleSelectTender(tender.id)}
                >
                  <td className="py-3 px-4">
                    <div className="font-mono text-[11px] text-blue-700 font-bold">{tender.id}</div>
                    <div className="font-medium text-slate-900 text-xs mt-0.5">{tender.title}</div>
                    <div className="text-[11px] text-slate-400">{tender.division}</div>
                  </td>
                  <td className="py-3 px-4 text-center font-medium text-slate-800">
                    {tender.bidsReceivedCount} bids
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="font-semibold text-slate-900">{tender.averageCompliance}%</span>
                  </td>
                  <td className="py-3 px-4">
                    <RiskBadge
                      level={tender.highRiskCount > 0 ? (tender.highRiskCount > 1 ? 'HIGH' : 'MEDIUM') : 'LOW'}
                      score={tender.highRiskCount > 0 ? tender.highRiskCount * 25 : 10}
                    />
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={tender.status} size="sm" />
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectTender(tender.id);
                      }}
                      className="px-2.5 py-1 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                    >
                      Open Case
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4 Compact Panels: Pending Officer Reviews, Critical Alerts, Recently Verified Bids, EMD Issues */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Panel 1: Pending Officer Reviews */}
        <div className="bg-white border border-slate-200 rounded-md p-4 shadow-2xs">
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Pending Officer Reviews (Human Decision Required)
              </h3>
            </div>
            <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
              {metrics.pendingReviews} Awaiting
            </span>
          </div>

          <div className="space-y-2">
            {pendingBids.map((bidder) => (
              <div
                key={bidder.id}
                onClick={() => handleSelectBidder(bidder.id, bidder.tenderId)}
                className="p-2.5 rounded border border-slate-200 hover:border-blue-400 hover:bg-slate-50 transition-colors cursor-pointer flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-semibold text-slate-900">{bidder.companyName}</div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    {bidder.id} • {bidder.tenderId}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <RiskBadge level={bidder.riskLevel} score={bidder.riskScore} />
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Panel 2: Critical Alerts */}
        <div className="bg-white border border-slate-200 rounded-md p-4 shadow-2xs">
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-500" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Critical Alerts & Discrepancies
              </h3>
            </div>
            <span className="text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
              {alerts.length} {alerts.length === 1 ? 'Flag' : 'Flags'}
            </span>
          </div>

          {alerts.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-2">No open alerts. All findings have an officer decision recorded.</p>
          ) : (
            <div className="space-y-2 text-xs">
              {alerts.map((alert) => {
                const isHigh = alert.severity === 'HIGH';
                return (
                  <div
                    key={alert.id}
                    onClick={() => handleSelectBidder(alert.bidId, alert.tenderId, alert.actionTab)}
                    className={`p-2.5 rounded border transition-colors cursor-pointer ${
                      isHigh ? 'border-rose-200 bg-rose-50/50 hover:bg-rose-50' : 'border-amber-200 bg-amber-50/50 hover:bg-amber-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`font-semibold ${isHigh ? 'text-rose-900' : 'text-amber-900'}`}>
                        {alert.title}
                      </span>
                      <span className={`font-mono text-[11px] font-bold ${isHigh ? 'text-rose-700' : 'text-amber-700'}`}>
                        {alert.bidId}
                      </span>
                    </div>
                    <p className={`text-[11px] mt-1 ${isHigh ? 'text-rose-700' : 'text-amber-700'}`}>
                      {alert.companyName} — {alert.description}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Panel 3: Recently Verified Bids */}
        <div className="bg-white border border-slate-200 rounded-md p-4 shadow-2xs">
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Recently Verified Bids
              </h3>
            </div>
            <span className="text-[11px] text-slate-500 font-mono">Authoritative Records</span>
          </div>

          <div className="space-y-2">
            {bids.map((bidder) => (
              <div
                key={bidder.id}
                onClick={() => handleSelectBidder(bidder.id, bidder.tenderId)}
                className="p-2 rounded border border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-semibold text-slate-800">{bidder.companyName}</span>
                  <div className="text-[11px] text-slate-400 font-mono">
                    Score: {bidder.overallComplianceScore}% • {bidder.riskLevel} Risk • {bidder.id}
                  </div>
                </div>
                <StatusBadge status={bidder.status} size="sm" />
              </div>
            ))}
          </div>
        </div>

        {/* Panel 4: EMD Issues */}
        <div className="bg-white border border-slate-200 rounded-md p-4 shadow-2xs">
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-blue-500" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                EMD & Bank Guarantee Status
              </h3>
            </div>
            <span className="text-[11px] text-slate-500">Treasury Reconciled</span>
          </div>

          <div className="space-y-2 text-xs">
            {bids.slice(0, 4).map((bidder) => {
              const badge = emdBadge(bidder);
              const isMismatch = bidder.emd?.verificationResult === 'EMD_AMOUNT_MISMATCH';
              return (
                <div
                  key={bidder.id}
                  onClick={() => handleSelectBidder(bidder.id, bidder.tenderId, 'emd')}
                  className={`p-2.5 rounded border transition-colors cursor-pointer flex items-center justify-between ${
                    isMismatch
                      ? 'border-rose-200 bg-rose-50/40 hover:bg-rose-100/50'
                      : 'border-slate-200 bg-slate-50 hover:bg-emerald-50/50 hover:border-emerald-300'
                  }`}
                >
                  <div>
                    <div className={`font-semibold ${isMismatch ? 'text-rose-900' : 'text-slate-800'}`}>
                      {bidder.companyName} ({bidder.id})
                    </div>
                    <div className={`text-[11px] ${isMismatch ? 'text-rose-700' : 'text-slate-500'}`}>
                      {emdSubtext(bidder)}
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${badge.className}`}>
                    {badge.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

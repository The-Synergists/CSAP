import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  FileText,
  Calendar,
  Users,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Search,
  ArrowRight,
  ShieldCheck,
  Clock,
  ChevronRight,
} from 'lucide-react';
import { useProcurement } from '../../context/ProcurementContext';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { RiskBadge } from '../../components/ui/RiskBadge';
import { findTenderByIdOrSlug, toTenderSlug } from '../../types';

export const TenderWorkspacePage: React.FC = () => {
  const { tenderId, tab, '*': splat } = useParams<{ tenderId?: string; tab?: string; '*'?: string }>();
  const navigate = useNavigate();
  const { tenders, bids, selectBid, setActiveTenderId } = useProcurement();

  const [activeTab, setActiveTab] = useState<'overview' | 'requirements' | 'bids' | 'activity'>('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [riskFilter, setRiskFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortField, setSortField] = useState<'compliance' | 'risk' | 'documents'>('compliance');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Handle slashes or slugs in tenderId
  const rawIdentifier = tenderId || splat;
  const currentTender = findTenderByIdOrSlug(tenders, rawIdentifier) || tenders[0];
  const tenderBidders = bids.filter((b) => b.tenderId === currentTender.id);

  // Sync tab with URL
  React.useEffect(() => {
    if (tab && ['overview', 'requirements', 'bids', 'activity'].includes(tab)) {
      setActiveTab(tab as any);
    }
  }, [tab]);

  // Keep active tender id in sync
  React.useEffect(() => {
    if (currentTender?.id) {
      setActiveTenderId(currentTender.id);
    }
  }, [currentTender?.id, setActiveTenderId]);

  const handleTabChange = (newTab: 'overview' | 'requirements' | 'bids' | 'activity') => {
    setActiveTab(newTab);
    navigate(`/tenders/${toTenderSlug(currentTender.id)}/${newTab}`);
  };

  // Filtering & Sorting Bids
  const filteredBidders = tenderBidders
    .filter((bidder) => {
      const matchesSearch =
        bidder.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        bidder.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        bidder.gstin.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRisk = riskFilter === 'ALL' || bidder.riskLevel === riskFilter;
      const matchesStatus = statusFilter === 'ALL' || bidder.status === statusFilter;
      return matchesSearch && matchesRisk && matchesStatus;
    })
    .sort((a, b) => {
      let comparison = 0;
      if (sortField === 'compliance') {
        comparison = a.overallComplianceScore - b.overallComplianceScore;
      } else if (sortField === 'risk') {
        comparison = a.riskScore - b.riskScore;
      } else if (sortField === 'documents') {
        comparison = a.documentsCount.submitted - b.documentsCount.submitted;
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });

  const handleSelectBidder = (bidId: string) => {
    selectBid(bidId, currentTender.id);
    navigate(`/bids/${bidId}`);
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Back */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate('/tenders')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-blue-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Tenders</span>
        </button>

        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <span>Tenders</span>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="font-mono text-slate-700 font-semibold">{currentTender.id}</span>
        </div>
      </div>

      {/* Tender Workspace Header */}
      <div className="bg-white border border-slate-200 rounded-md p-5 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="font-mono font-bold text-xs bg-blue-50 text-blue-800 border border-blue-200 px-2.5 py-1 rounded">
                Tender ID: {currentTender.id}
              </span>
              <StatusBadge status={currentTender.status} />
              <span className="text-xs text-slate-500 font-medium">
                Division: {currentTender.division}
              </span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 mt-2">
              {currentTender.title}
            </h1>
            <p className="text-xs text-slate-500 mt-1 max-w-3xl leading-relaxed">
              {currentTender.description}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleTabChange('bids')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold flex items-center gap-2 shadow-xs transition-colors"
            >
              <Users className="w-4 h-4" />
              <span>Review Submitted Bids ({tenderBidders.length})</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 mt-6 -mb-5">
          <button
            type="button"
            onClick={() => handleTabChange('overview')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'overview'
                ? 'border-blue-600 text-blue-700 bg-blue-50/40'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Overview</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('requirements')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'requirements'
                ? 'border-blue-600 text-blue-700 bg-blue-50/40'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Requirements ({currentTender.requirements.length})</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('bids')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'bids'
                ? 'border-blue-600 text-blue-700 bg-blue-50/40'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Bids ({tenderBidders.length})</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('activity')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'activity'
                ? 'border-blue-600 text-blue-700 bg-blue-50/40'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Activity Log</span>
          </button>
        </div>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Main details */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white border border-slate-200 rounded-md p-5 shadow-2xs">
              <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4 pb-2 border-b border-slate-200">
                Tender Metadata & Evaluation Parameters
              </h2>
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <dt className="text-slate-400 font-medium">Tender Status</dt>
                  <dd className="mt-1 font-semibold text-slate-800">
                    <StatusBadge status={currentTender.status} size="sm" />
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400 font-medium">Bids Received</dt>
                  <dd className="mt-1 font-semibold text-slate-900 text-sm">
                    {currentTender.bidsReceivedCount} Submissions
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400 font-medium">Estimated Value</dt>
                  <dd className="mt-1 font-semibold text-slate-900 text-sm">
                    {currentTender.estimatedValueFormatted}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400 font-medium">EMD Requirement</dt>
                  <dd className="mt-1 font-semibold text-blue-700 text-sm">
                    {currentTender.emdAmountFormatted}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400 font-medium">Category</dt>
                  <dd className="mt-1 font-semibold text-slate-800">
                    {currentTender.category}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400 font-medium">Officer In-Charge</dt>
                  <dd className="mt-1 font-semibold text-slate-800">
                    {currentTender.officerInCharge}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Quick summary of submitted bids */}
            <div className="bg-white border border-slate-200 rounded-md p-5 shadow-2xs">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Bids Ready for Officer Review
                </h3>
                <button
                  type="button"
                  onClick={() => handleTabChange('bids')}
                  className="text-xs text-blue-700 hover:underline font-semibold"
                >
                  View Full Bid Table →
                </button>
              </div>

              <div className="divide-y divide-slate-100">
                {tenderBidders.map((bidder) => (
                  <div
                    key={bidder.id}
                    className="py-3 flex items-center justify-between hover:bg-slate-50 rounded px-2 transition-colors cursor-pointer"
                    onClick={() => handleSelectBidder(bidder.id)}
                  >
                    <div>
                      <div className="font-semibold text-xs text-slate-900">{bidder.companyName}</div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        EMD: {bidder.emd.verificationResult.replace(/_/g, ' ')} • Docs: {bidder.documentsCount.submitted}/{bidder.documentsCount.required}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono font-bold text-slate-700">
                        {bidder.overallComplianceScore}%
                      </span>
                      <RiskBadge level={bidder.riskLevel} />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectBidder(bidder.id);
                        }}
                        className="px-2 py-1 text-xs bg-slate-100 hover:bg-blue-600 hover:text-white rounded font-medium text-slate-700 transition-colors"
                      >
                        Review
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar: Important Dates & Statutory Criteria */}
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-md p-5 shadow-2xs">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 pb-2 border-b border-slate-200 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-blue-600" />
                Important Dates
              </h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between pb-2 border-b border-slate-100">
                  <span className="text-slate-500">Notice Inviting Tender (NIT):</span>
                  <span className="font-semibold text-slate-900">{currentTender.publishDate}</span>
                </div>
                <div className="flex justify-between pb-2 border-b border-slate-100">
                  <span className="text-slate-500">Bid Submission Deadline:</span>
                  <span className="font-semibold text-slate-900">{currentTender.deadlineDate}</span>
                </div>
                <div className="flex justify-between pb-2 border-b border-slate-100">
                  <span className="text-slate-500">Technical Bid Opening:</span>
                  <span className="font-semibold text-blue-700">{currentTender.technicalOpeningDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Validity of Bids:</span>
                  <span className="font-semibold text-slate-900">90 Days post-bid</span>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-md p-5 shadow-2xs">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 pb-2 border-b border-slate-200 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Mandatory Thresholds
              </h3>
              <ul className="space-y-2 text-xs text-slate-700">
                <li className="flex items-center justify-between">
                  <span>Minimum Turnover:</span>
                  <span className="font-mono font-semibold">₹5.00 Cr</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>EMD Deposit:</span>
                  <span className="font-mono font-semibold">₹2,00,000</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>Make in India Local Content:</span>
                  <span className="font-mono font-semibold">≥ 50%</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>OEM Auth Form Validity:</span>
                  <span className="font-mono font-semibold">≥ 90 Days</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: REQUIREMENTS */}
      {activeTab === 'requirements' && (
        <div className="bg-white border border-slate-200 rounded-md shadow-2xs overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Mandatory Tender Verification Rules & Thresholds
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                EMD Exemption: As per Ministry of MSME / CPCL rules
              </p>
            </div>
            <span className="text-xs font-semibold bg-blue-100 text-blue-800 px-2.5 py-1 rounded">
              {currentTender.requirements.length} Rules Configured
            </span>
          </div>

          {currentTender.requirements.length === 0 ? (
            <div className="text-center py-10 text-xs text-slate-500">
              <p className="font-semibold text-slate-700">Requirements not yet configured for this tender.</p>
              <p className="text-slate-400 mt-1">
                Clause-level requirements have not been configured for this tender yet.
              </p>
            </div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4">Rule Code</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Requirement Title</th>
                  <th className="py-3 px-4">Evaluation Criterion</th>
                  <th className="py-3 px-4">Benchmark Value</th>
                  <th className="py-3 px-4 text-center">Mandatory</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {currentTender.requirements.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono font-bold text-slate-600">
                      {req.id}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-[11px] font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                        {req.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {req.title}
                    </td>
                    <td className="py-3 px-4 text-slate-600 max-w-md">
                      {req.criterion}
                    </td>
                    <td className="py-3 px-4 font-mono font-medium text-blue-700">
                      {req.benchmarkValue}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {req.mandatory ? (
                        <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                          Yes
                        </span>
                      ) : (
                        <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          Optional
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}

      {/* TAB 3: BIDS TABLE */}
      {activeTab === 'bids' && (
        <div className="space-y-4">
          {/* Controls: Search, Risk filter, Status filter, Sorting */}
          <div className="bg-white p-3 rounded-md border border-slate-200 flex flex-wrap gap-3 items-center justify-between shadow-2xs">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search bidder by name, ID, GSTIN..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:bg-white"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <span className="font-medium">Risk:</span>
                <select
                  value={riskFilter}
                  onChange={(e) => setRiskFilter(e.target.value)}
                  className="text-xs bg-slate-50 border border-slate-300 rounded px-2 py-1"
                >
                  <option value="ALL">All Risks</option>
                  <option value="LOW">Low Risk</option>
                  <option value="MEDIUM">Medium Risk</option>
                  <option value="HIGH">High Risk</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <span className="font-medium">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="text-xs bg-slate-50 border border-slate-300 rounded px-2 py-1"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="UNDER_REVIEW">Under Review</option>
                  <option value="RECOMMENDED_ACCEPT">Recommended Accept</option>
                  <option value="CLARIFICATION_SEEKED">Clarification Sought</option>
                  <option value="DISQUALIFIED">Disqualified</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <span className="font-medium">Sort by:</span>
                <select
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value as any)}
                  className="text-xs bg-slate-50 border border-slate-300 rounded px-2 py-1"
                >
                  <option value="compliance">Compliance Score</option>
                  <option value="risk">Risk Score</option>
                  <option value="documents">Documents Count</option>
                </select>
                <button
                  type="button"
                  onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-xs font-semibold text-slate-700"
                >
                  {sortOrder === 'desc' ? 'High → Low' : 'Low → High'}
                </button>
              </div>
            </div>
          </div>

          {/* Enterprise Bids Table */}
          <div className="bg-white border border-slate-200 rounded-md shadow-2xs overflow-hidden">
            {tenderBidders.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-500">
                <p className="font-semibold text-slate-700">No bids submitted for this tender yet.</p>
                <p className="text-slate-400 mt-1">
                  Bidder submissions will appear here once received for this tender.
                </p>
              </div>
            ) : filteredBidders.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-500">
                <p className="font-semibold text-slate-700">No bids match the current search or filters.</p>
                <p className="text-slate-400 mt-1">Try clearing the search term or resetting the filters above.</p>
              </div>
            ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Bidder Company</th>
                    <th className="py-3 px-4 text-center">Compliance</th>
                    <th className="py-3 px-4">Risk Profile</th>
                    <th className="py-3 px-4">EMD Status</th>
                    <th className="py-3 px-4 text-center">Documents</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredBidders.map((bidder) => {
                    const emdDisplay =
                      bidder.emd.verificationResult === 'EMD_VERIFIED' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Verified
                        </span>
                      ) : bidder.emd.verificationResult === 'EXEMPTION_CONFIRMED' ? (
                        <span className="inline-flex items-center gap-1 text-blue-700 font-semibold">
                          <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                          Exempted (MSME)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-700 font-semibold">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                          Mismatch (Deficit)
                        </span>
                      );

                    return (
                      <tr
                        key={bidder.id}
                        className="hover:bg-blue-50/40 transition-colors cursor-pointer"
                        onClick={() => handleSelectBidder(bidder.id)}
                      >
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-900 text-xs">{bidder.companyName}</div>
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                            ID: {bidder.id} • GSTIN: {bidder.gstin}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`font-mono font-bold text-xs ${
                              bidder.overallComplianceScore >= 90
                                ? 'text-emerald-700'
                                : bidder.overallComplianceScore >= 80
                                ? 'text-amber-700'
                                : 'text-rose-700'
                            }`}
                          >
                            {bidder.overallComplianceScore}%
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <RiskBadge level={bidder.riskLevel} score={bidder.riskScore} />
                        </td>
                        <td className="py-3.5 px-4">{emdDisplay}</td>
                        <td className="py-3.5 px-4 text-center font-mono font-medium">
                          <span
                            className={
                              bidder.documentsCount.submitted === bidder.documentsCount.required
                                ? 'text-emerald-700'
                                : 'text-amber-700'
                            }
                          >
                            {bidder.documentsCount.submitted} / {bidder.documentsCount.required}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <StatusBadge status={bidder.status} size="sm" />
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectBidder(bidder.id);
                            }}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold inline-flex items-center gap-1 transition-colors"
                          >
                            <span>Review Bid</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: ACTIVITY LOG */}
      {activeTab === 'activity' && (
        <div className="bg-white border border-slate-200 rounded-md p-5 shadow-2xs">
          <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4 pb-2 border-b border-slate-200">
            Tender Lifecycle & Scrutiny Log
          </h2>
          <div className="space-y-4">
            <div className="flex items-start gap-3 text-xs">
              <div className="w-2 h-2 rounded-full bg-blue-600 mt-1 shrink-0"></div>
              <div>
                <span className="font-semibold text-slate-800">{currentTender.publishDate}</span>
                <p className="text-slate-600">Notice Inviting Tender (NIT) published on GeM portal.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 text-xs">
              <div className="w-2 h-2 rounded-full bg-blue-600 mt-1 shrink-0"></div>
              <div>
                <span className="font-semibold text-slate-800">{currentTender.deadlineDate}</span>
                <p className="text-slate-600">
                  Bid submission closed. {tenderBidders.length} {tenderBidders.length === 1 ? 'bid' : 'bids'} received.
                </p>
              </div>
            </div>

            {tenderBidders.length === 0 ? (
              <p className="text-xs text-slate-400 italic pl-5">
                No bid activity recorded yet for this tender.
              </p>
            ) : (
              tenderBidders
                .flatMap((b) => b.auditTrail.map((ev) => ({ ...ev, bidderName: b.companyName, bidId: b.id })))
                .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                .map((ev) => (
                  <div key={`${ev.bidId}-${ev.id}`} className="flex items-start gap-3 text-xs">
                    <div
                      className={`w-2 h-2 rounded-full mt-1 shrink-0 ${
                        ev.actionType === 'OFFICER_ACTION'
                          ? 'bg-blue-600'
                          : ev.actionType === 'SYSTEM_AI'
                          ? 'bg-indigo-600'
                          : 'bg-emerald-600'
                      }`}
                    ></div>
                    <div>
                      <span className="font-semibold text-slate-800">{ev.timestamp}</span>
                      <p className="text-slate-600">
                        {ev.details}{' '}
                        <span className="font-mono text-slate-400">
                          ({ev.bidderName} • {ev.bidId})
                        </span>
                      </p>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

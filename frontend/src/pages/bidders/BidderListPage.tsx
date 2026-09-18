import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, ArrowRight } from 'lucide-react';
import { useProcurement } from '../../context/ProcurementContext';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { RiskBadge } from '../../components/ui/RiskBadge';

export const BidderListPage: React.FC = () => {
  const navigate = useNavigate();
  const { bids, selectBid } = useProcurement();
  const [searchTerm, setSearchTerm] = useState('');
  const [riskFilter, setRiskFilter] = useState('ALL');

  const filteredBidders = bids.filter((b) => {
    const matchesSearch =
      b.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.gstin.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRisk = riskFilter === 'ALL' || b.riskLevel === riskFilter;
    return matchesSearch && matchesRisk;
  });

  const handleOpenBidder = (bidId: string) => {
    selectBid(bidId);
    navigate(`/bids/${bidId}`);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Registered Bidders Directory
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Cross-tender bidder profiles, compliance history, and verification standings
          </p>
        </div>
        <span className="text-xs font-mono text-slate-600 bg-slate-100 px-2.5 py-1 rounded border border-slate-200">
          Total Bidders: {bids.length}
        </span>
      </div>

      {/* Filter and Search */}
      <div className="bg-white p-3 rounded-md border border-slate-200 flex flex-col sm:flex-row gap-3 items-center justify-between shadow-2xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by company name, vendor code, GSTIN..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-xs text-slate-500 font-medium">Risk Filter:</span>
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-300 rounded px-2 py-1.5 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-600"
          >
            <option value="ALL">All Risk Profiles</option>
            <option value="LOW">Low Risk</option>
            <option value="MEDIUM">Medium Risk</option>
            <option value="HIGH">High Risk</option>
          </select>
        </div>
      </div>

      {/* Bidder Table */}
      <div className="bg-white border border-slate-200 rounded-md shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Bidder Company</th>
                <th className="py-3 px-4">Tender Reference</th>
                <th className="py-3 px-4 text-center">Compliance</th>
                <th className="py-3 px-4">Risk Level</th>
                <th className="py-3 px-4">EMD Instrument</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredBidders.map((bidder) => (
                <tr
                  key={bidder.id}
                  className="hover:bg-blue-50/50 transition-colors cursor-pointer"
                  onClick={() => handleOpenBidder(bidder.id)}
                >
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-slate-900 text-xs">{bidder.companyName}</div>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                      {bidder.id} • PAN: {bidder.pan}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 font-mono font-medium text-blue-700">
                    {bidder.tenderId}
                  </td>
                  <td className="py-3.5 px-4 text-center font-bold font-mono">
                    {bidder.overallComplianceScore}%
                  </td>
                  <td className="py-3.5 px-4">
                    <RiskBadge level={bidder.riskLevel} score={bidder.riskScore} />
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="font-medium text-slate-700">
                      {bidder.emd.verificationResult.replace(/_/g, ' ')}
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
                        handleOpenBidder(bidder.id);
                      }}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold inline-flex items-center gap-1 transition-colors"
                    >
                      <span>Inspect Bidder</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, ArrowRight, Calendar } from 'lucide-react';
import { useProcurement } from '../../context/ProcurementContext';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { toTenderSlug } from '../../types';

export const TenderListPage: React.FC = () => {
  const navigate = useNavigate();
  const { tenders, setActiveTenderId } = useProcurement();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const filteredTenders = tenders.filter((tender) => {
    const matchesSearch =
      tender.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tender.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tender.division.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || tender.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleOpenTender = (tenderId: string) => {
    setActiveTenderId(tenderId);
    navigate(`/tenders/${toTenderSlug(tenderId)}`);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            CPCL Procurement Tenders
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage, verify, and monitor public procurement bids across all refinery divisions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-mono bg-slate-100 px-2.5 py-1 rounded border border-slate-200">
            Total Active Cases: {tenders.length}
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3 rounded-md border border-slate-200 flex flex-col sm:flex-row gap-3 items-center justify-between shadow-2xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by tender ID, title, division..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:bg-white"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-xs text-slate-500 font-medium">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-300 rounded px-2 py-1.5 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-600"
          >
            <option value="ALL">All Statuses</option>
            <option value="UNDER_EVALUATION">Under Evaluation</option>
            <option value="TECHNICAL_SCRUTINY">Technical Scrutiny</option>
            <option value="AWARDED">Completed / Awarded</option>
          </select>
        </div>
      </div>

      {/* Tenders Table */}
      <div className="bg-white border border-slate-200 rounded-md shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Tender ID</th>
                <th className="py-3 px-4">Title & Scope</th>
                <th className="py-3 px-4 text-right">Est. Value</th>
                <th className="py-3 px-4 text-right">EMD Req.</th>
                <th className="py-3 px-4 text-center">Bids</th>
                <th className="py-3 px-4">Closing Date</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredTenders.map((tender) => (
                <tr
                  key={tender.id}
                  className="hover:bg-blue-50/50 transition-colors cursor-pointer"
                  onClick={() => handleOpenTender(tender.id)}
                >
                  <td className="py-3.5 px-4 font-mono font-bold text-blue-700 whitespace-nowrap">
                    {tender.id}
                  </td>
                  <td className="py-3.5 px-4 max-w-sm">
                    <div className="font-semibold text-slate-900 text-xs">{tender.title}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5 truncate">{tender.division}</div>
                  </td>
                  <td className="py-3.5 px-4 text-right font-semibold text-slate-900 whitespace-nowrap">
                    {tender.estimatedValueFormatted}
                  </td>
                  <td className="py-3.5 px-4 text-right font-medium text-slate-700 whitespace-nowrap">
                    {tender.emdAmountFormatted}
                  </td>
                  <td className="py-3.5 px-4 text-center whitespace-nowrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800">
                      {tender.bidsReceivedCount}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {tender.deadlineDate}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <StatusBadge status={tender.status} size="sm" />
                  </td>
                  <td className="py-3.5 px-4 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenTender(tender.id);
                      }}
                      className="px-3 py-1 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded inline-flex items-center gap-1 transition-colors"
                    >
                      <span>Open Workspace</span>
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

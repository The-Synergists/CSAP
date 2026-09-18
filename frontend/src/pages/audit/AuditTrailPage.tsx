import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  History,
  Search,
  Filter,
  Download,
  Bot,
  UserCheck,
  FileCheck,
  UploadCloud,
  CheckCircle2,
} from 'lucide-react';
import { useProcurement } from '../../context/ProcurementContext';
import type { AuditEvent } from '../../types';

export const AuditTrailPage: React.FC = () => {
  const { bidders, bids, activeTender } = useProcurement();
  const [searchParams, setSearchParams] = useSearchParams();
  const paramBidId = searchParams.get('bidId') || searchParams.get('bidderId') || 'ALL';

  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [bidderFilter, setBidderFilter] = useState<string>(paramBidId);
  const [exported, setExported] = useState(false);

  useEffect(() => {
    const qBid = searchParams.get('bidId') || searchParams.get('bidderId');
    if (qBid) {
      setBidderFilter(qBid);
    }
  }, [searchParams]);

  // Synchronize dynamic audit logs across all normalized bids
  const allLogs: (AuditEvent & { tenderId: string; bidderName: string; bidderId: string })[] = (bids || bidders).flatMap((b) =>
    (b.auditTrail || []).map((ev) => ({
      ...ev,
      tenderId: b.tenderId || activeTender?.id || 'UNASSIGNED',
      bidderName: b.companyName,
      bidderId: b.id,
      hash: ev.hash || `REF-${b.id}-${ev.id}`,
    }))
  );

  const filteredLogs = allLogs.filter((log) => {
    const matchesSearch =
      log.summary.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.actor.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.bidderName.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesAction = actionFilter === 'ALL' || log.actionType === actionFilter;
    const matchesBidder = bidderFilter === 'ALL' || log.bidderId === bidderFilter;

    return matchesSearch && matchesAction && matchesBidder;
  });

  const handleBidderFilterChange = (newBidder: string) => {
    setBidderFilter(newBidder);
    if (newBidder === 'ALL') {
      searchParams.delete('bidId');
      searchParams.delete('bidderId');
      setSearchParams(searchParams);
    } else {
      setSearchParams({ bidId: newBidder });
    }
  };

  const handleExport = () => {
    setExported(true);
    setTimeout(() => setExported(false), 3000);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-blue-600" />
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Procurement Audit Trail
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Chronological log of AI verification steps, bidder submissions, and officer determinations
          </p>
        </div>

        <div className="flex items-center gap-2">
          {exported && (
            <span className="text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300 px-3 py-1 rounded flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Audit log export generated
            </span>
          )}
          <button
            type="button"
            onClick={handleExport}
            className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded flex items-center gap-1.5 transition-colors shadow-2xs"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export Audit Log</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3 rounded-md border border-slate-200 flex flex-wrap gap-3 items-center justify-between shadow-2xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by keyword, actor, company, clause..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:bg-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-medium">Action Type:</span>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-300 rounded px-2 py-1 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-600"
            >
              <option value="ALL">All Action Types</option>
              <option value="OFFICER_ACTION">Officer Decisions</option>
              <option value="SYSTEM_AI">AI Verifications</option>
              <option value="DOCUMENT_OCR">Document OCR</option>
              <option value="BIDDER_SUBMISSION">Bidder Submissions</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="font-medium">Bidder:</span>
            <select
              value={bidderFilter}
              onChange={(e) => handleBidderFilterChange(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-300 rounded px-2 py-1 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-600"
            >
              <option value="ALL">All Bidders</option>
              {bidders.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.companyName} ({b.id})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Timeline List */}
      <div className="bg-white border border-slate-200 rounded-md p-5 shadow-2xs">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-5">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Audit Records ({filteredLogs.length} Events)
          </span>
          <span className="text-xs text-slate-500 font-mono">
            {activeTender ? `Active Tender: ${activeTender.id}` : 'Showing: All Tenders'}
          </span>
        </div>

        <div className="space-y-5 relative before:absolute before:inset-0 before:left-4 before:h-full before:w-0.5 before:bg-slate-200">
          {filteredLogs.map((log) => {
            const isOfficer = log.actionType === 'OFFICER_ACTION';
            const isAI = log.actionType === 'SYSTEM_AI';
            const isOCR = log.actionType === 'DOCUMENT_OCR';

            const badgeBg = isOfficer
              ? 'bg-blue-600 text-white ring-4 ring-blue-100'
              : isAI
              ? 'bg-indigo-600 text-white ring-4 ring-indigo-100'
              : isOCR
              ? 'bg-emerald-600 text-white ring-4 ring-emerald-100'
              : 'bg-slate-700 text-white ring-4 ring-slate-100';

            const cardBorder = isOfficer
              ? 'border-blue-300 bg-blue-50/20'
              : isAI
              ? 'border-indigo-200 bg-indigo-50/20'
              : 'border-slate-200 bg-white';

            return (
              <div key={log.id} className="relative flex items-start gap-4 pl-1">
                {/* Step indicator circle */}
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 z-10 ${badgeBg}`}
                >
                  {isOfficer ? (
                    <UserCheck className="w-4 h-4" />
                  ) : isAI ? (
                    <Bot className="w-4 h-4" />
                  ) : isOCR ? (
                    <FileCheck className="w-4 h-4" />
                  ) : (
                    <UploadCloud className="w-4 h-4" />
                  )}
                </div>

                {/* Audit Card */}
                <div className={`flex-1 p-3.5 rounded-md border text-xs shadow-2xs ${cardBorder}`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-1 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">{log.summary}</span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.2 rounded uppercase ${
                          isOfficer
                            ? 'bg-blue-100 text-blue-800'
                            : isAI
                            ? 'bg-indigo-100 text-indigo-800'
                            : isOCR
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        {log.actionType.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <span className="font-mono text-slate-500 text-[11px] whitespace-nowrap">
                      {log.timestamp}
                    </span>
                  </div>

                  <p className="text-slate-700 mt-2 leading-relaxed">{log.details}</p>

                  <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                    <div className="flex items-center gap-3">
                      <span>
                        Actor: <strong className="text-slate-800">{log.actor}</strong> ({log.actorRole})
                      </span>
                      <span>•</span>
                      <span>
                        Bidder: <strong className="text-slate-800">{log.bidderName}</strong>
                      </span>
                    </div>

                    {log.hash && (
                      <div className="font-mono text-[10px] bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-slate-600">
                        {log.hash}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

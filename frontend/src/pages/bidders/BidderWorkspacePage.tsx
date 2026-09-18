import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronRight,
  AlertTriangle,
  FileText,
  CreditCard,
  Percent,
  AlertOctagon,
  Eye,
  Clock,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Bot,
  Building,
  UserCheck,
  Clock3,
  ShieldCheck,
  Loader2,
  X,
} from 'lucide-react';
import { useProcurement } from '../../context/ProcurementContext';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { RiskBadge } from '../../components/ui/RiskBadge';
import type { BidderDocument, OfficerDecisionType, VerificationStatus } from '../../types';
import { findBidById, toTenderSlug } from '../../types';

/** Renders a single verification-summary pill, driven entirely by the bid's actual data. */
const VerificationPill: React.FC<{ status: VerificationStatus }> = ({ status }) => {
  switch (status) {
    case 'VERIFIED':
    case 'EXEMPTED':
      return (
        <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          {status === 'EXEMPTED' ? 'Exempted' : 'Verified'}
        </span>
      );
    case 'MANUAL_REVIEW':
      return (
        <span className="inline-flex items-center gap-1 text-amber-700 font-bold">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
          Manual Review
        </span>
      );
    case 'MISMATCH':
      return (
        <span className="inline-flex items-center gap-1 text-rose-800 font-bold">
          <XCircle className="w-3.5 h-3.5 text-rose-600" />
          Mismatch
        </span>
      );
    case 'PENDING':
    default:
      return (
        <span className="inline-flex items-center gap-1 text-slate-500 font-bold">
          <Clock3 className="w-3.5 h-3.5 text-slate-400" />
          Pending
        </span>
      );
  }
};

const verificationTileClass = (status: VerificationStatus): string => {
  if (status === 'MISMATCH') return 'bg-rose-50 border-rose-300 hover:bg-rose-100/60';
  if (status === 'MANUAL_REVIEW') return 'bg-amber-50 border-amber-300 hover:bg-amber-100/60';
  return 'bg-slate-50 border-slate-200 hover:bg-slate-100/70';
};

/** Parses the "Key: Value | Key2: Value2" OCR snippet format into rows for the document preview. */
const parseSnippetFields = (snippet?: string): { label: string; value: string }[] => {
  if (!snippet) return [];
  return snippet
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const idx = part.indexOf(':');
      if (idx === -1) return { label: '', value: part };
      return { label: part.slice(0, idx).trim(), value: part.slice(idx + 1).trim() };
    });
};

export const BidderWorkspacePage: React.FC = () => {
  const { bidId, bidderId, tab } = useParams<{ bidId?: string; bidderId?: string; tab?: string }>();
  const navigate = useNavigate();
  const {
    bids,
    tenders,
    activeTender,
    setActiveBidId,
    setActiveTenderId,
    verificationProgress,
    startAiVerification,
    submitOfficerDecision,
    currentUser,
  } = useProcurement();

  const [activeTab, setActiveTab] = useState<
    'overview' | 'documents' | 'emd' | 'compliance' | 'risk' | 'evidence' | 'activity'
  >('overview');

  // Decision Modal State
  const [decisionModalOpen, setDecisionModalOpen] = useState(false);
  const [selectedDecision, setSelectedDecision] = useState<OfficerDecisionType>('APPROVE');
  const [officerRemarks, setOfficerRemarks] = useState('');
  const [justificationReason, setJustificationReason] = useState('');
  const [decisionSubmitted, setDecisionSubmitted] = useState(false);

  // Document Viewer State
  const [viewingDocument, setViewingDocument] = useState<BidderDocument | null>(null);

  // Verification Complete Summary — shown briefly once the pipeline finishes a run
  const [completionSummary, setCompletionSummary] = useState<{ verified: number; flagged: number } | null>(null);
  const wasRunningRef = useRef(false);

  const targetId = bidId || bidderId;
  const currentBidder = findBidById(bids, targetId) || bids[0];
  const associatedTender = tenders.find((t) => t.id === currentBidder.tenderId) || activeTender;

  // Keep active bid and tender context synchronized
  useEffect(() => {
    if (currentBidder?.id) {
      setActiveBidId(currentBidder.id);
      if (currentBidder.tenderId) {
        setActiveTenderId(currentBidder.tenderId);
      }
    }
  }, [currentBidder?.id, currentBidder?.tenderId, setActiveBidId, setActiveTenderId]);

  const handleOpenDecisionModal = () => {
    // Pre-fill the officer's working draft from this bid's own AI recommendation record —
    // the same data shown on the Overview tab — rather than per-bid hardcoded copy.
    // The officer is expected to review and edit before confirming (human-in-the-loop).
    setSelectedDecision(currentBidder.aiRecommendation.suggestedAction);
    setOfficerRemarks(currentBidder.aiRecommendation.details);
    setJustificationReason(currentBidder.primaryConcern || currentBidder.aiRecommendation.summary);
    setDecisionModalOpen(true);
  };

  useEffect(() => {
    if (tab) {
      if (tab === 'decision') {
        handleOpenDecisionModal();
      } else if (tab === 'recommendation') {
        setActiveTab('overview');
      } else if (tab === 'verification') {
        setActiveTab('overview');
      } else if (tab === 'audit') {
        setActiveTab('activity');
      } else if (['overview', 'documents', 'emd', 'compliance', 'risk', 'evidence', 'activity'].includes(tab)) {
        setActiveTab(tab as any);
      }
    }
  }, [tab, currentBidder.id]);

  const handleTabChange = (newTab: 'overview' | 'documents' | 'emd' | 'compliance' | 'risk' | 'evidence' | 'activity') => {
    setActiveTab(newTab);
    navigate(`/bids/${currentBidder.id}/${newTab}`);
  };

  // Detect the isRunning -> !isRunning edge to surface a clear "run finished" summary,
  // instead of the progress panel silently vanishing.
  useEffect(() => {
    const wasRunning = wasRunningRef.current;
    wasRunningRef.current = verificationProgress.isRunning;
    if (wasRunning && !verificationProgress.isRunning) {
      const verified = verificationProgress.steps.filter((s) => s.status === 'completed').length;
      const flagged = verificationProgress.steps.filter((s) => s.status === 'flagged').length;
      setCompletionSummary({ verified, flagged });
      const dismissTimer = window.setTimeout(() => setCompletionSummary(null), 8000);
      return () => window.clearTimeout(dismissTimer);
    }
  }, [verificationProgress.isRunning, verificationProgress.steps]);

  const handleRunAiVerification = () => {
    setCompletionSummary(null);
    startAiVerification(currentBidder.id);
  };

  const handleConfirmDecision = (e: React.FormEvent) => {
    e.preventDefault();
    submitOfficerDecision({
      tenderId: currentBidder.tenderId,
      bidderId: currentBidder.id,
      bidId: currentBidder.id,
      decision: selectedDecision,
      officerName: currentUser.name,
      officerDesignation: currentUser.designation,
      timestamp: new Date().toLocaleString('en-IN'),
      remarks: officerRemarks,
      justificationReason,
      dscSigned: false,
    });
    setDecisionModalOpen(false);
    setDecisionSubmitted(true);
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate(`/tenders/${toTenderSlug(currentBidder.tenderId)}`)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-blue-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Tender Workspace</span>
        </button>

        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <span
            onClick={() => navigate('/tenders')}
            className="cursor-pointer hover:text-slate-700 transition-colors"
          >
            Tenders
          </span>
          <ChevronRight className="w-3 h-3" />
          <span
            onClick={() => navigate(`/tenders/${toTenderSlug(currentBidder.tenderId)}`)}
            className="font-mono text-slate-600 font-medium cursor-pointer hover:text-blue-700 transition-colors"
          >
            {currentBidder.tenderId}
          </span>
          <span className="hidden sm:inline text-slate-400 font-normal">({associatedTender?.title})</span>
          <ChevronRight className="w-3 h-3" />
          <span className="font-semibold text-slate-900">{currentBidder.companyName}</span>
        </div>
      </div>

      {decisionSubmitted && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-md text-emerald-900 text-xs flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">
              Officer decision recorded and added to the audit trail.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setDecisionSubmitted(false)}
            className="text-xs font-bold text-emerald-700 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Top Workspace Header */}
      <div className="bg-white border border-slate-200 rounded-md p-5 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-mono font-bold text-xs bg-slate-100 text-slate-800 border border-slate-300 px-2 py-0.5 rounded">
                Bidder ID: {currentBidder.id}
              </span>
              <span className="font-mono text-xs text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                Vendor Code: {currentBidder.vendorCode}
              </span>
              <StatusBadge status={currentBidder.status} />
              <RiskBadge level={currentBidder.riskLevel} score={currentBidder.riskScore} />
            </div>

            <h1 className="text-xl font-bold text-slate-900 mt-2">
              {currentBidder.companyName}
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
              <span>GSTIN: <strong className="font-mono text-slate-700">{currentBidder.gstin}</strong></span>
              <span>•</span>
              <span>PAN: <strong className="font-mono text-slate-700">{currentBidder.pan}</strong></span>
              <span>•</span>
              <span>MSME: <strong className="font-mono text-slate-700">{currentBidder.udyamNumber}</strong></span>
            </div>
          </div>

          {/* Action Buttons: Run AI Verification & Officer Decision */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleRunAiVerification}
              disabled={verificationProgress.isRunning}
              className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 text-indigo-600 ${verificationProgress.isRunning ? 'animate-spin' : ''}`} />
              <span>{verificationProgress.isRunning ? 'Analyzing Bid...' : 'Run AI Verification'}</span>
            </button>

            <button
              type="button"
              onClick={handleOpenDecisionModal}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <UserCheck className="w-4 h-4" />
              <span>Officer Decision & Sign-off</span>
            </button>
          </div>
        </div>

        {/* Verification Progress: minimal government-portal scanning panel (while running) */}
        {verificationProgress.isRunning && (
          <div className="mt-4 bg-white border border-slate-200 rounded overflow-hidden">
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-xs font-semibold text-slate-700">
                  Connecting to Government Verification Portals
                </span>
              </div>
              <span className="font-mono text-[11px] text-slate-400">
                {verificationProgress.currentStep} / {verificationProgress.steps.length}
              </span>
            </div>

            <div className="h-1 bg-slate-100">
              <div
                className="h-full bg-blue-600 transition-all duration-500 ease-out"
                style={{
                  width: `${(verificationProgress.currentStep / verificationProgress.steps.length) * 100}%`,
                }}
              />
            </div>

            <div className="divide-y divide-slate-100">
              {verificationProgress.steps.map((step) => (
                <div key={step.name} className="flex items-center justify-between px-3.5 py-2 text-xs">
                  <div className="flex items-center gap-2.5">
                    {step.status === 'completed' && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    )}
                    {step.status === 'flagged' && (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    )}
                    {step.status === 'in-progress' && (
                      <Loader2 className="w-3.5 h-3.5 text-blue-600 shrink-0 animate-spin" />
                    )}
                    {step.status === 'pending' && (
                      <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-200 shrink-0" />
                    )}
                    <span className={step.status === 'pending' ? 'text-slate-400' : 'text-slate-700 font-medium'}>
                      {step.name}
                    </span>
                  </div>
                  <span
                    className={`font-mono text-[10px] uppercase font-semibold tracking-wide ${
                      step.status === 'completed'
                        ? 'text-emerald-600'
                        : step.status === 'flagged'
                        ? 'text-amber-600'
                        : step.status === 'in-progress'
                        ? 'text-blue-600'
                        : 'text-slate-300'
                    }`}
                  >
                    {step.status === 'completed'
                      ? 'Verified'
                      : step.status === 'flagged'
                      ? 'Flagged'
                      : step.status === 'in-progress'
                      ? 'Scanning...'
                      : 'Queued'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Verification Complete Summary — replaces the panel once a run finishes */}
        {!verificationProgress.isRunning && completionSummary && (
          <div className="mt-4 flex items-center justify-between gap-3 px-3.5 py-2.5 bg-emerald-50 border border-emerald-200 rounded text-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="font-semibold text-emerald-900">
                Verification complete — {completionSummary.verified} of {completionSummary.verified + completionSummary.flagged} checks passed
                {completionSummary.flagged > 0 && (
                  <span className="text-amber-700"> · {completionSummary.flagged} flagged for review</span>
                )}
                .
              </span>
            </div>
            <button
              type="button"
              onClick={() => setCompletionSummary(null)}
              className="text-emerald-700 hover:underline font-semibold shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* 4 Top KPI Highlights */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-200">
          <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
            <div className="text-[11px] text-slate-500 font-semibold uppercase">Overall Compliance</div>
            <div className="text-xl font-bold text-slate-900 mt-0.5">
              {currentBidder.overallComplianceScore} / 100
            </div>
          </div>

          <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
            <div className="text-[11px] text-slate-500 font-semibold uppercase">Risk Evaluation</div>
            <div className="mt-1">
              <RiskBadge level={currentBidder.riskLevel} score={currentBidder.riskScore} />
            </div>
          </div>

          <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
            <div className="text-[11px] text-slate-500 font-semibold uppercase">Documents Uploaded</div>
            <div className="text-xl font-bold text-slate-900 mt-0.5">
              {currentBidder.documentsCount.submitted} / {currentBidder.documentsCount.required}
            </div>
          </div>

          <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
            <div className="text-[11px] text-slate-500 font-semibold uppercase">Review Status</div>
            <div className="mt-1">
              <StatusBadge status={currentBidder.status} size="sm" />
            </div>
          </div>
        </div>

        {/* Tabs: Overview, Documents, EMD, Compliance, Risk, Evidence, Activity */}
        <div className="flex border-b border-slate-200 mt-6 -mb-5 overflow-x-auto">
          <button
            type="button"
            onClick={() => handleTabChange('overview')}
            className={`px-3.5 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'overview'
                ? 'border-blue-600 text-blue-700 bg-blue-50/40'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building className="w-3.5 h-3.5" />
            <span>Overview</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('documents')}
            className={`px-3.5 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'documents'
                ? 'border-blue-600 text-blue-700 bg-blue-50/40'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Documents ({currentBidder.documents.length})</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('emd')}
            className={`px-3.5 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'emd'
                ? 'border-blue-600 text-blue-700 bg-blue-50/40'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>EMD Verification</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('compliance')}
            className={`px-3.5 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'compliance'
                ? 'border-blue-600 text-blue-700 bg-blue-50/40'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Percent className="w-3.5 h-3.5" />
            <span>Compliance ({currentBidder.overallComplianceScore}%)</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('risk')}
            className={`px-3.5 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'risk'
                ? 'border-blue-600 text-blue-700 bg-blue-50/40'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <AlertOctagon className="w-3.5 h-3.5" />
            <span>Risk Analysis ({currentBidder.riskLevel})</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('evidence')}
            className={`px-3.5 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'evidence'
                ? 'border-blue-600 text-blue-700 bg-blue-50/40'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Evidence ({currentBidder.evidenceItems.length})</span>
            {currentBidder.evidenceItems.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('activity')}
            className={`px-3.5 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'activity'
                ? 'border-blue-600 text-blue-700 bg-blue-50/40'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Audit Activity</span>
          </button>
        </div>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          {/* Quick Verification Status Checklist — driven entirely by verificationsSummary data */}
          <div className="bg-white border border-slate-200 rounded-md p-5 shadow-2xs">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200">
              <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Verification Status Summary
              </h2>
              <span className="text-xs text-slate-500">Fast Scan for Procurement Officers</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-3 text-xs">
              {(
                [
                  { key: 'gst', label: 'GST' },
                  { key: 'pan', label: 'PAN' },
                  { key: 'udyam', label: 'Udyam' },
                  { key: 'incomeTax', label: 'Income Tax' },
                  { key: 'epfoEsic', label: 'EPFO / ESIC' },
                  { key: 'makeInIndia', label: 'Make in India' },
                  { key: 'oemAuthorization', label: 'OEM Auth' },
                  { key: 'emd', label: 'EMD' },
                  { key: 'blacklisting', label: 'Blacklisting' },
                ] as { key: keyof typeof currentBidder.verificationsSummary; label: string }[]
              ).map(({ key, label }) => {
                const status = currentBidder.verificationsSummary[key];
                const targetTab =
                  key === 'emd' ? 'emd' : status !== 'VERIFIED' && status !== 'EXEMPTED' ? 'evidence' : 'documents';
                return (
                  <div
                    key={key}
                    onClick={() => handleTabChange(targetTab)}
                    className={`p-3 border rounded text-center cursor-pointer transition-colors ${verificationTileClass(status)}`}
                  >
                    <div className="text-slate-500 font-semibold mb-1">{label}</div>
                    <VerificationPill status={status} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* AI Recommendation Summary Box */}
          <div className="bg-indigo-50/70 border border-indigo-200 rounded-md p-5 shadow-2xs">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-indigo-700" />
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-900">
                    AI Recommendation
                  </span>
                  <span className="text-[10px] bg-indigo-200 text-indigo-800 px-2 py-0.5 rounded font-mono font-semibold">
                    Confidence: {currentBidder.aiRecommendation.confidence}%
                  </span>
                </div>
                <p className="text-xs font-semibold text-indigo-950 leading-relaxed">
                  "{currentBidder.aiRecommendation.summary}"
                </p>
                <p className="text-xs text-indigo-900/80 leading-relaxed max-w-4xl">
                  {currentBidder.aiRecommendation.details}
                </p>
              </div>

              <button
                type="button"
                onClick={handleOpenDecisionModal}
                className="shrink-0 px-3.5 py-2 bg-indigo-700 hover:bg-indigo-800 text-white rounded text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5"
              >
                <span>Proceed to Officer Review</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Pros and Cons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-3 border-t border-indigo-200/60 text-xs">
              <div>
                <span className="font-bold text-emerald-800 uppercase tracking-wider text-[11px]">
                  Positive Compliance Factors
                </span>
                <ul className="mt-1 space-y-1">
                  {currentBidder.aiRecommendation.pros.map((p) => (
                    <li key={p} className="flex items-start gap-1.5 text-slate-700">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <span className="font-bold text-amber-800 uppercase tracking-wider text-[11px]">
                  Potential Areas of Concern
                </span>
                <ul className="mt-1 space-y-1">
                  {currentBidder.aiRecommendation.cons.length > 0 ? (
                    currentBidder.aiRecommendation.cons.map((c) => (
                      <li key={c} className="flex items-start gap-1.5 text-slate-700">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <span>{c}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-slate-500 italic">No adverse concerns detected.</li>
                  )}
                </ul>
              </div>
            </div>
          </div>

          {/* Bidder Corporate Profile */}
          <div className="bg-white border border-slate-200 rounded-md p-5 shadow-2xs">
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4 pb-2 border-b border-slate-200">
              Bidder Commercial & Statutory Identity
            </h2>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <dt className="text-slate-400 font-medium">Incorporation Date</dt>
                <dd className="mt-1 font-semibold text-slate-800">{currentBidder.incorporationDate}</dd>
              </div>
              <div>
                <dt className="text-slate-400 font-medium">Make in India Local Content</dt>
                <dd className="mt-1 font-semibold text-slate-900">
                  {currentBidder.makeInIndiaPercentage}% (Class-I Supplier)
                </dd>
              </div>
              <div>
                <dt className="text-slate-400 font-medium">Average Annual Turnover</dt>
                <dd className="mt-1 font-semibold text-blue-700">
                  {currentBidder.turnoverLast3Years.join(' • ')}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400 font-medium">Registered Address</dt>
                <dd className="mt-1 text-slate-700 truncate">{currentBidder.registeredAddress}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}

      {/* TAB 2: DOCUMENTS */}
      {activeTab === 'documents' && (
        <div className="bg-white border border-slate-200 rounded-md shadow-2xs overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Submitted Tender Documents & Automated OCR Extraction
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Total {currentBidder.documents.length} files scanned and cross-verified against tender clauses
              </p>
            </div>
            <span className="text-xs font-mono font-semibold bg-blue-50 text-blue-800 border border-blue-200 px-2.5 py-1 rounded">
              {currentBidder.documents.length} / {currentBidder.documentsCount.required} Submitted
            </span>
          </div>

          <div className="divide-y divide-slate-200">
            {currentBidder.documents.map((doc) => (
              <div key={doc.id} className="p-4 hover:bg-slate-50/80 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-slate-900">{doc.name}</span>
                      <span className="text-[11px] font-mono text-slate-400">({doc.fileName} • {doc.fileSize})</span>
                      <StatusBadge status={doc.verificationStatus} size="sm" />
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      Target Clause: <span className="font-medium text-slate-700">{doc.tenderClauseReference}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-center">
                    <button
                      type="button"
                      onClick={() => setViewingDocument(doc)}
                      title="View document"
                      aria-label={`View ${doc.name}`}
                      className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-xs font-semibold flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5 text-slate-500" />
                      <span>View</span>
                    </button>

                    {doc.hasDiscrepancy && (
                      <button
                        type="button"
                        onClick={() => handleTabChange('evidence')}
                        className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded text-xs font-semibold flex items-center gap-1"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                        <span>Inspect Discrepancy Evidence</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* OCR snippet box */}
                <div className="mt-2.5 p-2.5 bg-slate-50 rounded border border-slate-200 text-xs">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mb-1">
                    <span>OCR Extraction Snippet:</span>
                    <span className="text-emerald-700 font-semibold">OCR Status: {doc.ocrStatus}</span>
                  </div>
                  <p className="font-mono text-slate-800 text-[11px] bg-white p-2 rounded border border-slate-200">
                    {doc.extractedSnippet}
                  </p>
                  <p className="text-[11px] text-slate-600 mt-1 font-medium">
                    {doc.statusMessage}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: EMD VERIFICATION */}
      {activeTab === 'emd' && (
        <div className="bg-white border border-slate-200 rounded-md p-5 shadow-2xs space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Earnest Money Deposit (EMD) Instrument Scrutiny
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Automated reconciliation with CPCL Core Banking and SFMS portal
              </p>
            </div>
            <StatusBadge status={currentBidder.emd.verificationResult} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Left: Requirements vs Submitted */}
            <div className="p-4 bg-slate-50 rounded border border-slate-200 space-y-3 text-xs">
              <h3 className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                Payment Reconciliation Parameters
              </h3>
              <div className="flex justify-between py-1.5 border-b border-slate-200">
                <span className="text-slate-500">Tender Required EMD:</span>
                <span className="font-bold font-mono text-slate-900">
                  {currentBidder.emd.requiredAmountFormatted}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-200">
                <span className="text-slate-500">Submitted EMD Amount:</span>
                <span
                  className={`font-bold font-mono ${
                    currentBidder.emd.submittedAmount < currentBidder.emd.requiredAmount &&
                    currentBidder.emd.instrumentType !== 'MSME_EXEMPTION'
                      ? 'text-rose-700'
                      : 'text-emerald-700'
                  }`}
                >
                  {currentBidder.emd.submittedAmountFormatted}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-200">
                <span className="text-slate-500">Instrument Type:</span>
                <span className="font-semibold text-slate-800">
                  {currentBidder.emd.instrumentType.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-200">
                <span className="text-slate-500">Transaction / BG Ref No:</span>
                <span className="font-mono font-semibold text-blue-700">
                  {currentBidder.emd.transactionOrBgNo}
                </span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-slate-500">Issuing Bank:</span>
                <span className="font-semibold text-slate-800">{currentBidder.emd.bankName}</span>
              </div>
            </div>

            {/* Right: Officer note & audit verdict */}
            <div className="p-4 bg-slate-50 rounded border border-slate-200 space-y-3 text-xs">
              <h3 className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                Reconciliation Verdict & Audit Note
              </h3>
              <div className="p-3 bg-white rounded border border-slate-200">
                <div className="font-semibold text-slate-900 mb-1">
                  Treasury Integration Status:
                </div>
                <p className="text-slate-600 leading-relaxed">
                  {currentBidder.emd.officerNote}
                </p>
              </div>

              <div className="p-3 bg-white rounded border border-slate-200">
                <div className="font-semibold text-slate-900 mb-1">
                  Entity Match:
                </div>
                <p className="text-slate-600">
                  Beneficiary Name and Remitter GSTIN cross-checked with CPCL Vendor Master.
                  {currentBidder.emd.bidderMatch ? (
                    <span className="text-emerald-700 font-semibold block mt-1">
                      ✓ Remitter matches registered corporate identity.
                    </span>
                  ) : (
                    <span className="text-rose-700 font-semibold block mt-1">
                      ⚠ Remitter name mismatch detected.
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: COMPLIANCE */}
      {activeTab === 'compliance' && (
        <div className="bg-white border border-slate-200 rounded-md shadow-2xs overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Clause-by-Clause Compliance Breakdown
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Calculated Score: {currentBidder.overallComplianceScore} / 100
              </p>
            </div>
            <span className="text-sm font-bold font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded">
              {currentBidder.overallComplianceScore}% Score
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4">Clause ID</th>
                  <th className="py-3 px-4">Requirement</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Verification Note</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {currentBidder.complianceItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono font-bold text-slate-600">{item.id}</td>
                    <td className="py-3 px-4 font-semibold text-slate-900">{item.requirementName}</td>
                    <td className="py-3 px-4">
                      <span className="text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                        {item.category}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={item.status} size="sm" />
                    </td>
                    <td className="py-3 px-4 text-slate-600 max-w-sm">{item.notes}</td>
                    <td className="py-3 px-4 text-right">
                      {item.evidenceId && (
                        <button
                          type="button"
                          onClick={() => handleTabChange('evidence')}
                          className="px-2 py-1 text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded inline-flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View Evidence</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: RISK */}
      {activeTab === 'risk' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-md p-5 shadow-2xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Multi-Factor Risk Assessment Model
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Calculated Risk Score: {currentBidder.riskScore} / 100 ({currentBidder.riskLevel} Risk Profile)
                </p>
              </div>
              <RiskBadge level={currentBidder.riskLevel} score={currentBidder.riskScore} />
            </div>

            <div className="mt-4 p-3 bg-slate-50 rounded border border-slate-200 text-xs">
              <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                Primary Scrutiny Concern:
              </span>
              <p className="text-slate-800 font-medium mt-1">
                {currentBidder.primaryConcern}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              {currentBidder.riskFactors.map((factor) => (
                <div key={factor.id} className="p-3.5 rounded border border-slate-200 bg-white space-y-1 text-xs shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">{factor.title}</span>
                    <RiskBadge level={factor.level} />
                  </div>
                  <div className="text-[11px] text-slate-500 uppercase font-semibold">
                    Category: {factor.category}
                  </div>
                  <p className="text-slate-600 mt-1 leading-relaxed">{factor.description}</p>
                  {factor.evidenceId && (
                    <button
                      type="button"
                      onClick={() => handleTabChange('evidence')}
                      className="text-blue-700 hover:underline font-semibold text-xs inline-flex items-center gap-1 mt-2"
                    >
                      <span>Inspect linked finding</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: EVIDENCE (Critical Feature) */}
      {activeTab === 'evidence' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-md p-5 shadow-2xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Audit Evidence & Clause Discrepancy Inspector
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  AI findings must be backed by verifiable document snippets and tender requirements
                </p>
              </div>
              <span className="text-xs font-mono bg-amber-50 text-amber-800 border border-amber-300 px-2.5 py-1 rounded font-semibold">
                {currentBidder.evidenceItems.length} Discrepancy Findings
              </span>
            </div>

            {currentBidder.evidenceItems.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-500">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="font-semibold text-slate-800">No discrepancies or non-compliance evidence found.</p>
                <p className="text-slate-400 mt-1">All submitted documents and instruments satisfy tender benchmarks.</p>
              </div>
            ) : (
              <div className="space-y-4 mt-4">
                {currentBidder.evidenceItems.map((ev) => (
                  <div key={ev.id} className="p-4 rounded border border-amber-300 bg-amber-50/40 space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <span className="font-bold text-slate-900 text-sm">{ev.requirementTitle}</span>
                      </div>
                      <span className="font-mono text-[11px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded font-semibold border border-amber-300">
                        {ev.findingType.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Tender requirement */}
                      <div className="p-3 bg-white rounded border border-slate-200">
                        <div className="text-[11px] uppercase font-bold text-slate-500 mb-1">
                          Tender Requirement Rule:
                        </div>
                        <p className="text-slate-800 font-medium leading-relaxed">
                          {ev.tenderClauseRequirement}
                        </p>
                      </div>

                      {/* Submitted document evidence */}
                      <div className="p-3 bg-white rounded border border-amber-200">
                        <div className="text-[11px] uppercase font-bold text-amber-700 mb-1">
                          Submitted Document Finding ({ev.submittedDocumentName}):
                        </div>
                        <p className="font-mono text-slate-800 bg-amber-50/60 p-2 rounded border border-amber-200 text-[11px]">
                          {ev.documentSnippet}
                        </p>
                        <div className="text-[10px] text-slate-400 mt-1">
                          Source: {ev.source} • Verified: {ev.verificationTimestamp}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-amber-200 text-xs">
                      <span className="text-amber-900 font-semibold">
                        AI Finding: {ev.aiFinding}
                      </span>
                      <button
                        type="button"
                        onClick={handleOpenDecisionModal}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold text-xs"
                      >
                        Seek Officer Clarification
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 7: ACTIVITY LOG */}
      {activeTab === 'activity' && (
        <div className="bg-white border border-slate-200 rounded-md p-5 shadow-2xs">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 mb-4">
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Chronological Verification & Scrutiny Timeline
            </h2>
            <button
              type="button"
              onClick={() => navigate(`/audit?bidId=${currentBidder.id}`)}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
            >
              <span>View Full System Audit Ledger</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-4">
            {currentBidder.auditTrail.map((log) => (
              <div key={log.id} className="flex items-start gap-3 text-xs">
                <div
                  className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${
                    log.actionType === 'OFFICER_ACTION'
                      ? 'bg-blue-600'
                      : log.actionType === 'SYSTEM_AI'
                      ? 'bg-indigo-600'
                      : 'bg-slate-400'
                  }`}
                ></div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">{log.summary}</span>
                    <span className="font-mono text-[11px] text-slate-400">{log.timestamp}</span>
                  </div>
                  <p className="text-slate-600 mt-0.5">{log.details}</p>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Actor: <span className="font-medium text-slate-600">{log.actor} ({log.actorRole})</span>
                    {log.hash && <span className="ml-2 font-mono">[{log.hash}]</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DOCUMENT VIEWER MODAL */}
      {viewingDocument && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-300 rounded-lg max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 sticky top-0 bg-white">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-900 truncate">{viewingDocument.name}</h3>
                  <div className="text-[11px] font-mono text-slate-400 truncate">
                    {viewingDocument.fileName} • {viewingDocument.fileSize}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingDocument(null)}
                aria-label="Close document viewer"
                className="text-slate-400 hover:text-slate-700 p-1 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 text-xs space-y-4">
              {/* Document Preview — a formatted rendering of the scanned document's extracted fields */}
              <div>
                <div className="text-[11px] uppercase font-bold text-slate-500 mb-1">Document Preview</div>
                <div className="relative border border-slate-300 rounded-md bg-white p-4 pt-3 shadow-sm">
                  <div
                    className={`absolute top-0 left-0 right-0 h-1 rounded-t-md ${
                      viewingDocument.verificationStatus === 'MISMATCH'
                        ? 'bg-rose-500'
                        : viewingDocument.verificationStatus === 'MANUAL_REVIEW'
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                  />

                  <div className="flex items-start justify-between gap-3 pb-2 mb-2 border-b border-dashed border-slate-200">
                    <div>
                      <div className="text-[13px] font-bold text-slate-900 uppercase tracking-wide">
                        {viewingDocument.name}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{viewingDocument.type}</div>
                    </div>
                    <div
                      className={`shrink-0 w-11 h-11 rounded-full border-2 flex items-center justify-center rotate-[-8deg] ${
                        viewingDocument.verificationStatus === 'MISMATCH'
                          ? 'border-rose-400 text-rose-500'
                          : viewingDocument.verificationStatus === 'MANUAL_REVIEW'
                          ? 'border-amber-400 text-amber-500'
                          : 'border-emerald-400 text-emerald-500'
                      }`}
                      title="Verification stamp"
                    >
                      {viewingDocument.verificationStatus === 'MISMATCH' ? (
                        <XCircle className="w-5 h-5" />
                      ) : viewingDocument.verificationStatus === 'MANUAL_REVIEW' ? (
                        <AlertTriangle className="w-5 h-5" />
                      ) : (
                        <ShieldCheck className="w-5 h-5" />
                      )}
                    </div>
                  </div>

                  {parseSnippetFields(viewingDocument.extractedSnippet).length > 0 ? (
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                      {parseSnippetFields(viewingDocument.extractedSnippet).map((field, idx) => (
                        <div key={idx} className="text-[11px] py-0.5">
                          <dt className="text-slate-400 uppercase text-[10px] font-semibold tracking-wide">
                            {field.label || 'Detail'}
                          </dt>
                          <dd className="font-mono font-semibold text-slate-800 mt-0.5 break-words">
                            {field.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="text-[11px] text-slate-400 italic">No extracted fields available for preview.</p>
                  )}

                  <div className="mt-3 pt-2 border-t border-dashed border-slate-200 flex items-center justify-between text-[10px] text-slate-400">
                    <span>Ref: {viewingDocument.fileName}</span>
                    <span>Scanned {viewingDocument.uploadTimestamp}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase">Verification</div>
                  <div className="mt-1">
                    <StatusBadge status={viewingDocument.verificationStatus} size="sm" />
                  </div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase">OCR Status</div>
                  <div className="mt-1 font-semibold text-slate-800">{viewingDocument.ocrStatus}</div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase">Uploaded</div>
                  <div className="mt-1 font-semibold text-slate-800 truncate">{viewingDocument.uploadTimestamp}</div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase">Clause Ref.</div>
                  <div className="mt-1 font-semibold text-slate-800 truncate">
                    {viewingDocument.tenderClauseReference || '—'}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-[11px] uppercase font-bold text-slate-500 mb-1">
                  Raw OCR Text
                </div>
                <p className="font-mono text-slate-800 text-[11px] bg-slate-50 p-3 rounded border border-slate-200 whitespace-pre-wrap">
                  {viewingDocument.extractedSnippet || 'No extracted text available for this document.'}
                </p>
              </div>

              <div className="p-3 bg-slate-50 rounded border border-slate-200 text-slate-600">
                {viewingDocument.statusMessage}
              </div>

              {viewingDocument.hasDiscrepancy && (
                <button
                  type="button"
                  onClick={() => {
                    setViewingDocument(null);
                    handleTabChange('evidence');
                  }}
                  className="w-full px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded font-semibold flex items-center justify-center gap-1.5"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Inspect Discrepancy Evidence</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* OFFICER DECISION MODAL */}
      {decisionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-300 rounded-lg max-w-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Officer Decision
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDecisionModalOpen(false)}
                aria-label="Close"
                className="text-slate-400 hover:text-slate-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="bg-amber-50 border border-amber-200 p-3 rounded text-xs text-amber-900">
              <strong>Note:</strong> The determination and reason below are pre-filled from the recommended
              action as a starting point — review and edit them before confirming.
            </div>

            <form onSubmit={handleConfirmDecision} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1 uppercase tracking-wider text-[11px]">
                  Formal Determination
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedDecision('APPROVE')}
                    className={`p-2 rounded border text-left font-semibold ${
                      selectedDecision === 'APPROVE'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    ✓ Recommend Accept
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedDecision('REQUEST_CLARIFICATION')}
                    className={`p-2 rounded border text-left font-semibold ${
                      selectedDecision === 'REQUEST_CLARIFICATION'
                        ? 'border-purple-500 bg-purple-50 text-purple-800'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    ⚠ Request Clarification
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedDecision('COMMITTEE_REVIEW')}
                    className={`p-2 rounded border text-left font-semibold ${
                      selectedDecision === 'COMMITTEE_REVIEW'
                        ? 'border-blue-500 bg-blue-50 text-blue-800'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    📋 Refer to Committee
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedDecision('REJECT')}
                    className={`p-2 rounded border text-left font-semibold ${
                      selectedDecision === 'REJECT'
                        ? 'border-rose-500 bg-rose-50 text-rose-800'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    ✕ Summary Disqualification
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1 uppercase tracking-wider text-[11px]">
                  Reason / Statutory Rule Reference
                </label>
                <input
                  type="text"
                  value={justificationReason}
                  onChange={(e) => setJustificationReason(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1 uppercase tracking-wider text-[11px]">
                  Officer Remarks
                </label>
                <textarea
                  rows={3}
                  value={officerRemarks}
                  onChange={(e) => setOfficerRemarks(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded flex items-center justify-between text-[11px]">
                <div>
                  <span className="font-semibold text-slate-800">Recorded By: </span>
                  <span className="text-slate-600">{currentUser.name} ({currentUser.designation})</span>
                </div>
                <span className="text-slate-500">Will be added to the audit trail</span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setDecisionModalOpen(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded text-slate-700 hover:bg-slate-50 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold shadow-xs"
                >
                  Confirm Decision
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Gavel, RefreshCw } from 'lucide-react';
import { getBidView } from '@shared/domain/selectors';
import type { BidDocument } from '@shared/domain/types';
import { useApp } from '../../state/appContext';
import { BidStatusBadge, RiskBadge } from '../../components/ui/Badge';
import { Button, Card, CountPill, PageHeader, Stat, Tabs } from '../../components/ui/primitives';
import { EMD_RESULT } from '../../domain/labels';
import { bidPath, formatDateTime, tenderPath } from '../../lib/format';
import { NotFoundPage } from '../common/NotFoundPage';
import { NextStep } from './NextStep';
import { VerificationPanel } from './VerificationPanel';
import { DocumentViewer } from './DocumentViewer';
import { OverviewTab } from './tabs/OverviewTab';
import { DocumentsTab } from './tabs/DocumentsTab';
import { EmdTab } from './tabs/EmdTab';
import { ComplianceTab } from './tabs/ComplianceTab';
import { RiskTab } from './tabs/RiskTab';
import { EvidenceTab } from './tabs/EvidenceTab';
import { DecisionTab } from './tabs/DecisionTab';
import { ActivityTab } from './tabs/ActivityTab';
import { PanVerificationTab } from './tabs/PanVerificationTab';
import { PortalVerificationTab } from './tabs/PortalVerificationTab';
import { BID_TAB_ALIASES as ALIASES, BID_TABS, type BidTab, type TabProps } from './bidTabs';


export const BidWorkspacePage: React.FC = () => {
  const { bidId, tab } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { db, verificationRuns, startVerification, setActiveTenderId } = useApp();
  const view = bidId ? getBidView(db, bidId) : undefined;
  const [viewingDoc, setViewingDoc] = useState<BidDocument | null>(null);

  const requested = tab ? ALIASES[tab] ?? tab : 'overview';
  const activeTab: BidTab = (BID_TABS as readonly string[]).includes(requested) ? (requested as BidTab) : 'overview';

  useEffect(() => {
    if (view) setActiveTenderId(view.tender.id);
  }, [view, setActiveTenderId]);

  if (!view) return <NotFoundPage what="bid" id={bidId} />;

  const goTo = (t: BidTab, query?: Record<string, string>) => {
    const qs = query ? `?${new URLSearchParams(query)}` : '';
    navigate(`${bidPath(view.bid.id, t === 'overview' ? undefined : t)}${qs}`);
  };
  const run = verificationRuns[view.bid.id];
  const running = !!run && !run.done;
  const tabProps: TabProps = { view, goTo, openDocument: setViewingDoc };
  const { bid, bidder, tender, counts } = view;

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumbs={[
          { label: 'Tenders', to: '/tenders' },
          { label: tender.id, to: tenderPath(tender.id, 'bids') },
          { label: `${bid.id} · ${bidder.companyName}` },
        ]}
        meta={
          <>
            <span className="font-mono text-xs text-slate-600">{bid.id}</span>
            <BidStatusBadge status={bid.status} />
          </>
        }
        title={bidder.companyName}
        subtitle={
          <span className="font-mono text-xs">
            {bidder.id} · GSTIN {bidder.gstin} · PAN {bidder.pan}
          </span>
        }
        actions={
          <>
            <Button
              onClick={() => void startVerification(bid.id)}
              disabled={running}
              title="Re-checks the submission against every tender requirement using the verification engine"
            >
              <RefreshCw className={`h-4 w-4 ${running ? 'animate-spin' : ''}`} />
              {running ? 'Verifying…' : 'Run verification'}
            </Button>
            {!view.flags.closed && (
              <Button variant="primary" onClick={() => goTo('decision')}>
                <Gavel className="h-4 w-4" /> Record decision
              </Button>
            )}
          </>
        }
      />

      <Card>
        <dl className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <Stat label="Compliance score" value={`${bid.complianceScore} / 100`} />
          <Stat label="Risk" value={<RiskBadge level={bid.riskLevel} score={bid.riskScore} />} />
          <Stat label="Requirements met" value={`${counts.met} of ${counts.total}`} />
          <Stat
            label="Exceptions"
            value={<span className={counts.exceptions ? 'text-amber-700' : 'text-emerald-700'}>{counts.exceptions || 'None'}</span>}
          />
          <Stat
            label="Documents"
            value={<span className={view.documents.length < view.documentsRequired ? 'text-rose-700' : ''}>{view.documents.length} of {view.documentsRequired}</span>}
          />
          <Stat label="EMD" value={view.emd ? EMD_RESULT[view.emd.result].label : 'Not submitted'} />
        </dl>
        <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-500">
          Tender {tender.id} · {tender.title} · submitted {formatDateTime(bid.submittedAt)} · last verified {formatDateTime(bid.lastVerifiedAt)}
        </p>
      </Card>

      {run && <VerificationPanel run={run} onReviewFindings={() => goTo('evidence')} />}

      <NextStep view={view} goTo={goTo} />

      <Tabs
        label="Bid sections"
        active={activeTab}
        onChange={(t) => goTo(t)}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'documents', label: 'Documents', badge: <CountPill n={view.documents.length} /> },
          {
            id: 'portal',
            label: 'Portal verification',
            badge: view.portal.some((p) => p.status === 'FAILED' || p.status === 'NOT_FOUND')
              ? <CountPill n={view.portal.filter((p) => p.status === 'FAILED' || p.status === 'NOT_FOUND').length} tone="danger" />
              : view.portal.some((p) => p.status === 'REVIEW')
                ? <CountPill n={view.portal.filter((p) => p.status === 'REVIEW').length} tone="warning" />
                : undefined,
          },
          { id: 'pan', label: 'PAN verification' },
          { id: 'emd', label: 'EMD' },
          { id: 'compliance', label: 'Compliance', badge: counts.exceptions ? <CountPill n={counts.exceptions} tone="warning" /> : undefined },
          { id: 'risk', label: 'Risk' },
          { id: 'evidence', label: 'Findings', badge: view.findings.length ? <CountPill n={view.findings.length} tone={view.openFindings.length ? 'danger' : 'neutral'} /> : undefined },
          { id: 'decision', label: 'Recommendation & decision' },
          { id: 'activity', label: 'Activity' },
        ]}
      />

      <div role="tabpanel">
        {activeTab === 'overview' && <OverviewTab {...tabProps} />}
        {activeTab === 'documents' && <DocumentsTab {...tabProps} />}
        {activeTab === 'portal' && <PortalVerificationTab {...tabProps} />}
        {activeTab === 'pan' && <PanVerificationTab {...tabProps} />}
        {activeTab === 'emd' && <EmdTab {...tabProps} />}
        {activeTab === 'compliance' && <ComplianceTab {...tabProps} />}
        {activeTab === 'risk' && <RiskTab {...tabProps} />}
        {activeTab === 'evidence' && <EvidenceTab {...tabProps} highlight={params.get('finding') ?? undefined} />}
        {activeTab === 'decision' && (
          <DecisionTab {...tabProps} preset={{ decision: params.get('decision') ?? undefined, finding: params.get('finding') ?? undefined }} />
        )}
        {activeTab === 'activity' && <ActivityTab {...tabProps} />}
      </div>

      <DocumentViewer view={view} doc={viewingDoc} onClose={() => setViewingDoc(null)} onViewFinding={(id) => { setViewingDoc(null); goTo('evidence', { finding: id }); }} />
    </div>
  );
};

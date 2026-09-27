import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Gavel, RefreshCw } from 'lucide-react';
import { getBidView } from '@shared/domain/selectors';
import type { BidDocument } from '@shared/domain/types';
import { useApp } from '../../state/appContext';
import { BidStatusBadge } from '../../components/ui/Badge';
import { Button, CountPill, PageHeader, Tabs } from '../../components/ui/primitives';
import { bidPath, tenderPath } from '../../lib/format';
import { NotFoundPage } from '../common/NotFoundPage';
import { BidStatePanel, LOCKED_HINT } from './ReevaluationPanel';
import { markBidOpened } from '../../lib/openedBids';
import { VerificationPanel } from './VerificationPanel';
import { DocumentViewer } from './DocumentViewer';
import { OverviewTab } from './tabs/OverviewTab';
import { DocumentsTab } from './tabs/DocumentsTab';
import { EmdTab } from './tabs/EmdTab';
import { ComplianceTab } from './tabs/ComplianceTab';
import { RiskTab } from './tabs/RiskTab';
import { EvidenceTab } from './tabs/EvidenceTab';
import { DecisionTab } from './tabs/DecisionTab';
import { PanVerificationTab } from './tabs/PanVerificationTab';
import { PortalVerificationTab } from './tabs/PortalVerificationTab';
import { BID_TAB_ALIASES as ALIASES, BID_TABS, type BidTab, type TabProps } from './bidTabs';


export const BidWorkspacePage: React.FC = () => {
  const { bidId, tab } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { db, currentUser, verificationRuns, startVerification, setActiveTenderId } = useApp();
  const view = bidId ? getBidView(db, bidId) : undefined;
  const [viewingDoc, setViewingDoc] = useState<BidDocument | null>(null);

  const requested = tab ? ALIASES[tab] ?? tab : 'overview';
  const activeTab: BidTab = (BID_TABS as readonly string[]).includes(requested) ? (requested as BidTab) : 'overview';

  useEffect(() => {
    if (view) setActiveTenderId(view.tender.id);
  }, [view, setActiveTenderId]);
  const openedId = view?.bid.id;
  useEffect(() => {
    if (openedId) markBidOpened(currentUser?.id, openedId);
  }, [openedId, currentUser?.id]);

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
        subtitle={`${tender.id} · ${tender.title}`}
        actions={
          <>
            <Button
              onClick={() => void startVerification(bid.id)}
              disabled={running || view.flags.closed}
              title={view.flags.closed ? LOCKED_HINT : 'CSAP verified this bid automatically when it arrived. Re-run the checks against every tender requirement.'}
            >
              <RefreshCw className={`h-4 w-4 ${running ? 'animate-spin' : ''}`} />
              {running ? 'Verifying…' : 'Re-run verification'}
            </Button>
            {!view.flags.closed && (
              <Button variant="primary" onClick={() => goTo('decision')}>
                <Gavel className="h-4 w-4" /> Record decision
              </Button>
            )}
          </>
        }
      />

      <BidStatePanel view={view} />

      {run && <VerificationPanel run={run} onReviewFindings={() => goTo('evidence')} />}

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
      </div>

      <DocumentViewer view={view} doc={viewingDoc} onClose={() => setViewingDoc(null)} onViewFinding={(id) => { setViewingDoc(null); goTo('evidence', { finding: id }); }} />
    </div>
  );
};

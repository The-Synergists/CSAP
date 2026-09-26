import React from 'react';
import { EmdBadge } from '../../../components/ui/Badge';
import { Button, Card, DetailList, EmptyState } from '../../../components/ui/primitives';
import { EMD_INSTRUMENT } from '../../../domain/labels';
import { formatDate, formatINR } from '../../../lib/format';
import type { TabProps } from '../bidTabs';

export const EmdTab: React.FC<TabProps> = ({ view, goTo, openDocument }) => {
  const emd = view.emd;
  if (!emd) return <Card><EmptyState title="No EMD submitted" description="The bid package contains no EMD payment, guarantee or exemption claim." /></Card>;
  const check = view.checks.find((c) => c.requirement.category === 'EMD');
  const doc = view.documents.find((d) => d.id === emd.documentId);
  const exempt = emd.instrument === 'MSME_EXEMPTION';
  const gap = emd.requiredAmount - emd.submittedAmount;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card title="EMD check" actions={<EmdBadge result={emd.result} />}>
        <div className="grid grid-cols-3 gap-3 rounded border border-slate-200 p-3 text-center text-xs">
          <div>
            <div className="text-xs text-slate-500">Tender requires</div>
            <div className="mt-1 font-semibold text-slate-900">{formatINR(emd.requiredAmount)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Bidder submitted</div>
            <div className={`mt-1 font-semibold ${!exempt && gap > 0 ? 'text-rose-700' : 'text-slate-900'}`}>
              {exempt ? 'Exemption claimed' : formatINR(emd.submittedAmount)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Difference</div>
            <div className={`mt-1 font-semibold ${!exempt && gap > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
              {exempt ? '—' : gap > 0 ? `${formatINR(gap)} short` : 'None'}
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-800">{emd.note}</p>
        {check?.findingId && (
          <Button className="mt-3" size="sm" onClick={() => goTo('evidence', { finding: check.findingId! })}>
            View finding and evidence
          </Button>
        )}
      </Card>

      <Card title="Instrument details" actions={doc && <Button size="sm" onClick={() => openDocument(doc)}>View document</Button>}>
        <DetailList
          rows={[
            { label: 'Instrument', value: EMD_INSTRUMENT[emd.instrument] },
            { label: exempt ? 'Udyam number' : 'Reference', value: <span className="font-mono text-xs">{emd.reference}</span> },
            ...(exempt ? [] : [{ label: 'Bank', value: `${emd.bankName}${emd.branch ? `, ${emd.branch}` : ''}` }]),
            { label: exempt ? 'Claimed on' : 'Payment date', value: formatDate(emd.paymentDate) },
            ...(emd.validUntil ? [{ label: 'Valid until', value: formatDate(emd.validUntil) }] : []),
            { label: 'Remitter matches bidder', value: emd.remitterMatchesBidder ? 'Yes' : 'No — name mismatch' },
          ]}
        />
        <p className="mt-3 text-xs text-slate-500">Bank / treasury confirmation is simulated in this prototype.</p>
      </Card>
    </div>
  );
};

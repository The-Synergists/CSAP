import React from 'react';
import { RiskBadge } from '../../../components/ui/Badge';
import { Button, Card } from '../../../components/ui/primitives';
import type { TabProps } from '../bidTabs';

const ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;

export const RiskTab: React.FC<TabProps> = ({ view, goTo }) => {
  const factors = [...view.riskFactors].sort((a, b) => ORDER[a.level] - ORDER[b.level]);
  return (
    <div className="space-y-5">
      <Card title="Risk assessment" actions={<RiskBadge level={view.bid.riskLevel} score={view.bid.riskScore} />}>
        <p className="text-xs text-slate-800">{view.bid.primaryConcern}</p>
        <p className="mt-2 text-xs text-slate-500">
          Score 0–100 from the exceptions found: 0–24 low, 25–49 medium, 50+ high. Missing mandatory EMD or financial eligibility weighs most.
        </p>
      </Card>
      <Card title="Risk factors" padded={false}>
        <ul className="divide-y divide-slate-100">
          {factors.map((f) => (
            <li key={f.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <RiskBadge level={f.level} />
                  <span className="font-medium text-slate-900">{f.title}</span>
                  <span className="text-xs text-slate-500">{f.category.charAt(0) + f.category.slice(1).toLowerCase()}</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-600">{f.description}</p>
              </div>
              {f.findingId && (
                <Button size="sm" variant="ghost" onClick={() => goTo('evidence', { finding: f.findingId! })}>
                  View evidence
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
};

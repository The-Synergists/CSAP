import React from 'react';
import { CheckBadge } from '../../../components/ui/Badge';
import { Button, Card } from '../../../components/ui/primitives';
import type { TabProps } from '../bidTabs';

export const ComplianceTab: React.FC<TabProps> = ({ view, goTo }) => {
  const { counts } = view;
  return (
    <Card
      title="Compliance by requirement"
      subtitle={`Score ${view.bid.complianceScore}/100 — weighted across all tender requirements; mandatory eligibility items carry more weight.`}
      actions={
        <span className="text-xs text-slate-600">
          {counts.met} met · {counts.review} review · {counts.notMet} not met · {counts.missing} missing
        </span>
      }
      padded={false}
    >
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-xs text-slate-700">
          <thead className="border-b border-slate-200 bg-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            <tr>
              <th scope="col" className="px-4 py-3">Requirement</th>
              <th scope="col" className="px-4 py-3">Tender requires</th>
              <th scope="col" className="px-4 py-3">Bidder submitted</th>
              <th scope="col" className="px-4 py-3">Result</th>
              <th scope="col" className="px-4 py-2.5"><span className="sr-only">Evidence</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 align-top">
            {view.checks.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3">
                  <div className="font-mono text-xs text-slate-500">
                    {c.requirement.code} · {c.requirement.clause}
                    {!c.requirement.mandatory && ' · optional'}
                  </div>
                  <div className="text-slate-900">{c.requirement.title}</div>
                </td>
                <td className="px-4 py-3 text-slate-700">{c.requirement.benchmark}</td>
                <td className="px-4 py-3">
                  <div className="text-slate-900">{c.submitted}</div>
                  <div className="text-xs text-slate-500">{c.note}</div>
                </td>
                <td className="px-4 py-3"><CheckBadge status={c.status} /></td>
                <td className="px-4 py-3 text-right">
                  {c.findingId && (
                    <Button size="sm" variant="ghost" onClick={() => goTo('evidence', { finding: c.findingId! })}>
                      View evidence
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

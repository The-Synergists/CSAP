import React from 'react';
import { CheckBadge } from '../../../components/ui/Badge';
import { Button, Card } from '../../../components/ui/primitives';
import type { TabProps } from '../bidTabs';

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export const ComplianceTab: React.FC<TabProps> = ({ view, goTo }) => {
  const { counts, score } = view;
  const byCode = new Map(score.rows.map((r) => [r.code, r]));
  return (
    <div className="space-y-4">
      <Card title={`Why the score is ${score.score} / 100`} subtitle="Computed from the requirement checks below; it changes as soon as a check changes.">
        <div className="space-y-3 text-xs text-slate-700">
          <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[13px] text-slate-900">
            score = Σ (weight × outcome) ÷ Σ weight × 100 = {fmt(score.points)} ÷ {score.maxPoints} × 100 = <strong>{score.score}</strong>
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="font-semibold text-slate-900">Weight: how much a requirement decides eligibility</p>
              <p>
                EMD and financial eligibility <strong>3</strong> · statutory and technical <strong>2</strong> · policy declarations and optional items{' '}
                <strong>1</strong>
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-900">Outcome: what the check found</p>
              <p>
                Met or exempted <strong>1</strong> · needs review <strong>0.5</strong> · not met or missing <strong>0</strong>
              </p>
            </div>
          </div>
          <p className="text-slate-500">
            The score summarises the checks; it does not decide the bid. A single failed mandatory item (for example a short EMD) can make a bid liable for
            rejection whatever the score.
          </p>
        </div>
      </Card>
      <Card
        title="Compliance by requirement"
        subtitle="Each requirement's weight, outcome and the points it contributes to the score."
        actions={
          <span className="text-xs text-slate-600">
            {counts.met} met · {counts.review} review · {counts.notMet} not met · {counts.missing} missing
          </span>
        }
        padded={false}
      >
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-xs text-slate-700">
            <thead className="border-b border-slate-200 bg-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Requirement
                </th>
                <th scope="col" className="px-4 py-3">
                  Tender requires
                </th>
                <th scope="col" className="px-4 py-3">
                  Bidder submitted
                </th>
                <th scope="col" className="px-4 py-3">
                  Result
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Weight
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Points
                </th>
                <th scope="col" className="px-4 py-2.5">
                  <span className="sr-only">Evidence</span>
                </th>
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
                  <td className="px-4 py-3">
                    <CheckBadge status={c.status} />
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{byCode.get(c.requirement.code)?.weight}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                    {fmt(byCode.get(c.requirement.code)?.points ?? 0)}
                    <span className="font-normal text-slate-400"> / {byCode.get(c.requirement.code)?.weight}</span>
                  </td>
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
            <tfoot className="border-t-2 border-slate-200 bg-slate-50 text-xs font-semibold text-slate-900">
              <tr>
                <td className="px-4 py-2.5" colSpan={4}>
                  Total
                </td>
                <td className="px-4 py-2.5 text-right font-mono">{score.maxPoints}</td>
                <td className="px-4 py-2.5 text-right font-mono">
                  {fmt(score.points)} / {score.maxPoints} = {score.score}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
};

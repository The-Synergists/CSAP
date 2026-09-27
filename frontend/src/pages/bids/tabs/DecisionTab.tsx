import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Minus, Plus } from 'lucide-react';
import type { BidView } from '@shared/domain/selectors';
import type { DecisionType } from '@shared/domain/types';
import { useApp } from '../../../state/appContext';
import { AdvisoryTag, BidStatusBadge, Badge } from '../../../components/ui/Badge';
import { Button, Card, Modal } from '../../../components/ui/primitives';
import { inputClass } from '../../../components/ui/styles';
import { useToast } from '../../../components/ui/toast';
import { BID_STATUS, DECISION } from '../../../domain/labels';
import { formatDateTime } from '../../../lib/format';
import type { TabProps } from '../bidTabs';
import { AiExplanation } from '../AiExplanation';
import { EvaluationReports } from '../EvaluationReports';

const ORDER: DecisionType[] = ['APPROVE', 'REQUEST_CLARIFICATION', 'REJECT'];
const OTHER = '__other__';
const MIN_REMARKS = 1;

interface Preset {
  decision?: string;
  finding?: string;
}

const RecommendationPanel: React.FC<{ view: BidView; goTo: TabProps['goTo'] }> = ({ view, goTo }) => {
  const { source } = useApp();
  const rec = view.recommendation;
  if (!rec)
    return (
      <Card title="AI recommendation">
        <p className="text-xs text-slate-500">No recommendation has been generated for this bid.</p>
      </Card>
    );
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          AI recommendation <AdvisoryTag />
        </span>
      }
      subtitle={`Suggested by CSAP from the current checks (last verified ${formatDateTime(rec.generatedAt)}); it updates as soon as a check changes`}
    >
      <p className="text-xs">
        <span className="text-slate-500">Suggested action: </span>
        <span className="font-semibold text-slate-900">{DECISION[rec.suggestedDecision].label}</span>
      </p>
      <p className="mt-2 text-xs text-slate-900">{rec.summary}</p>
      <p className="mt-2 text-xs leading-relaxed text-slate-600">{rec.rationale}</p>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-xs font-medium text-slate-500">In favour</h3>
          <ul className="mt-1 space-y-1 text-xs text-slate-800">
            {rec.strengths.map((s) => (
              <li key={s} className="flex gap-1.5">
                <Plus aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                {s}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-xs font-medium text-slate-500">Concerns</h3>
          <ul className="mt-1 space-y-1 text-xs text-slate-800">
            {rec.concerns.length ? (
              rec.concerns.map((s) => (
                <li key={s} className="flex gap-1.5">
                  <Minus aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
                  {s}
                </li>
              ))
            ) : (
              <li className="text-slate-500">None identified.</li>
            )}
          </ul>
        </div>
      </div>
      {source === 'api' && <AiExplanation bidId={view.bid.id} goTo={goTo} locked={view.flags.closed} since={view.bid.lastVerifiedAt} />}
      <p className="mt-4 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        AI advisory — the final decision remains with the designated procurement officer.
      </p>
    </Card>
  );
};

const DecisionForm: React.FC<{ view: BidView; preset: Preset }> = ({ view, preset }) => {
  const { submitDecision, currentUser } = useApp();
  const toast = useToast();
  const presetFinding = view.findings.find((f) => f.id === preset.finding);
  const presetDecision = ORDER.includes(preset.decision as DecisionType) ? (preset.decision as DecisionType) : null;

  const [decision, setDecision] = useState<DecisionType | null>(presetDecision);
  const [reasonChoice, setReasonChoice] = useState(presetDecision ? DECISION[presetDecision].reasons[0] : '');
  const [otherReason, setOtherReason] = useState('');
  const [remarks, setRemarks] = useState(
    presetFinding ? `${presetFinding.title}. ${presetFinding.suggestedAction ? `Bidder asked to: ${presetFinding.suggestedAction}` : ''}`.trim() : '',
  );
  const [acknowledged, setAcknowledged] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const reason = reasonChoice === OTHER ? otherReason.trim() : reasonChoice;
  const rec = view.recommendation;
  const differsFromAi = !!rec && !!decision && rec.suggestedDecision !== decision;
  const openSerious = view.openFindings.filter((f) => f.severity !== 'LOW');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!decision) e.decision = 'Choose a decision.';
    if (!reason) e.reason = 'Select or enter a reason.';
    if (remarks.trim().length < MIN_REMARKS) e.remarks = 'Enter your remarks for the decision.';
    if (!acknowledged) e.ack = 'Confirm that you have reviewed the evidence.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const confirm = async () => {
    if (!decision) return;
    setSaving(true);
    setSaveError(null);
    try {
      await submitDecision({ bidId: view.bid.id, decision, reason, remarks: remarks.trim() });
      setConfirming(false);
      toast({
        kind: 'success',
        title: `Decision recorded: ${DECISION[decision].label}`,
        message: `${view.bid.id} is now "${BID_STATUS[DECISION[decision].resultingStatus].label}". An audit event has been added.`,
      });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Officer decision" subtitle={`Recorded under your name: ${currentUser?.name ?? ''}, ${currentUser?.designation ?? ''}`}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (validate()) setConfirming(true);
        }}
        className="space-y-4"
      >
        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-slate-800">Decision</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ORDER.map((d) => (
              <label
                key={d}
                className={`flex cursor-pointer items-start gap-2 rounded border p-2.5 text-xs ${
                  decision === d ? 'border-blue-600 bg-blue-50' : 'border-slate-300 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="decision"
                  value={d}
                  checked={decision === d}
                  onChange={() => {
                    setDecision(d);
                    setReasonChoice(DECISION[d].reasons[0]);
                  }}
                  className="mt-0.5"
                />
                <span>
                  <span className="block font-medium text-slate-900">{DECISION[d].label}</span>
                  <span className="block text-xs text-slate-600">{DECISION[d].verb}</span>
                </span>
              </label>
            ))}
          </div>
          {errors.decision && <p className="mt-1 text-xs text-rose-700">{errors.decision}</p>}
        </fieldset>

        {decision && (
          <div>
            <label htmlFor="reason" className="mb-1 block text-xs font-medium text-slate-800">
              Reason
            </label>
            <select id="reason" value={reasonChoice} onChange={(e) => setReasonChoice(e.target.value)} className={inputClass}>
              {DECISION[decision].reasons.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
              <option value={OTHER}>Other (specify)</option>
            </select>
            {reasonChoice === OTHER && (
              <input
                aria-label="Other reason"
                value={otherReason}
                onChange={(e) => setOtherReason(e.target.value)}
                className={`${inputClass} mt-2`}
                placeholder="State the reason"
              />
            )}
            {errors.reason && <p className="mt-1 text-xs text-rose-700">{errors.reason}</p>}
          </div>
        )}

        <div>
          <label htmlFor="remarks" className="mb-1 block text-xs font-medium text-slate-800">
            Remarks
          </label>
          <textarea
            id="remarks"
            rows={4}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            aria-describedby="remarks-help"
            aria-invalid={!!errors.remarks}
            className={inputClass}
            placeholder="Record the basis for your decision, including how each open finding was considered."
          />
          {errors.remarks && (
            <p id="remarks-help" className="mt-1 text-xs text-rose-700">
              {errors.remarks}
            </p>
          )}
        </div>

        {decision === 'APPROVE' && openSerious.length > 0 && (
          <p className="flex gap-2 rounded border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {openSerious.length} open finding{openSerious.length === 1 ? '' : 's'} of medium or high severity. Explain in your remarks why approval is
            appropriate.
          </p>
        )}
        {differsFromAi && (
          <p className="rounded border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-700">
            Your decision differs from the AI recommendation ({DECISION[rec!.suggestedDecision].label}). That is fine — it will be recorded as your independent
            judgement.
          </p>
        )}

        <label className="flex items-start gap-2 text-xs text-slate-800">
          <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-0.5" />I have reviewed the findings
          and evidence for this bid, and this decision is my own.
        </label>
        {errors.ack && <p className="-mt-2 text-xs text-rose-700">{errors.ack}</p>}

        <div className="flex justify-end">
          <Button type="submit" variant="primary">
            Review and submit
          </Button>
        </div>
      </form>

      <Modal
        open={confirming}
        onClose={() => !saving && setConfirming(false)}
        title="Confirm decision"
        description={`${view.bid.id} · ${view.bidder.companyName}`}
        footer={
          <>
            <Button onClick={() => setConfirming(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant={decision === 'REJECT' ? 'danger' : 'primary'} onClick={() => void confirm()} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? 'Saving…' : `Confirm: ${decision ? DECISION[decision].label : ''}`}
            </Button>
          </>
        }
      >
        {decision && (
          <div className="space-y-3 text-xs">
            <p>
              The bid status will change from <BidStatusBadge status={view.bid.status} /> to <BidStatusBadge status={DECISION[decision].resultingStatus} />.
            </p>
            <dl className="space-y-1.5 rounded border border-slate-200 p-3">
              <div>
                <dt className="inline text-slate-500">Decision: </dt>
                <dd className="inline font-medium">{DECISION[decision].verb}</dd>
              </div>
              <div>
                <dt className="inline text-slate-500">Reason: </dt>
                <dd className="inline">{reason}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Remarks:</dt>
                <dd className="whitespace-pre-wrap">{remarks.trim()}</dd>
              </div>
            </dl>
            <p className="text-xs text-slate-500">
              {decision === 'APPROVE' || decision === 'REJECT'
                ? 'This is a final decision for the bid and cannot be changed afterwards in this system.'
                : 'You can record a further decision later, e.g. once the clarification is received.'}{' '}
              An audit event will be written.
            </p>
            {saveError && (
              <p role="alert" className="rounded border border-rose-200 bg-rose-50 p-2.5 text-rose-800">
                Not saved: {saveError}
              </p>
            )}
          </div>
        )}
      </Modal>
    </Card>
  );
};

const DecisionHistory: React.FC<{ view: BidView }> = ({ view }) =>
  view.decisions.length === 0 ? null : (
    <Card title="Decision history" padded={false}>
      <ol className="divide-y divide-slate-100">
        {view.decisions.map((d) => (
          <li key={d.id} className="px-4 py-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={DECISION[d.decision].tone}>{DECISION[d.decision].label}</Badge>
              <span className="text-slate-600">
                {d.officerName}
                {d.officerDesignation && `, ${d.officerDesignation}`}
              </span>
              <span className="font-mono text-xs text-slate-500">{formatDateTime(d.decidedAt)}</span>
              {!d.followedRecommendation && <span className="text-xs text-slate-500">· differs from AI recommendation</span>}
            </div>
            <p className="mt-1 text-slate-800">
              <span className="text-slate-500">Reason:</span> {d.reason}
            </p>
            <p className="mt-0.5 text-slate-700">{d.remarks}</p>
          </li>
        ))}
      </ol>
    </Card>
  );

/** Where the bid's verification stands, from its latest start / finish event. */
const verificationState = (view: BidView): 'done' | 'running' | 'stopped' | 'never' => {
  const mark = view.audit.find((e) => ['Re-verification requested', 'Bid received from GeM', 'Automatic verification completed', 'Automatic verification stopped'].includes(e.summary));
  if (!mark) return 'never';
  return mark.summary === 'Automatic verification completed' ? 'done' : mark.summary === 'Automatic verification stopped' ? 'stopped' : 'running';
};

export const DecisionTab: React.FC<TabProps & { preset: Preset }> = ({ view, preset, goTo }) => {
  const { source } = useApp();
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <div className="space-y-5">
        <RecommendationPanel view={view} goTo={goTo} />
      </div>
      <div className="space-y-5">
        {!view.flags.closed && verificationState(view) !== 'done' ? (
          <Card title="Verify before deciding">
            <p className="text-xs text-slate-700">
              {verificationState(view) === 'running'
                ? 'CSAP is still verifying this bid (reading its documents, checking the tender rules and the registries). The decision form opens as soon as it finishes.'
                : verificationState(view) === 'stopped'
                  ? 'The last verification did not finish. Use Re-run verification at the top of the bid, then decide on the verified result.'
                  : "CSAP has not verified this bid's documents yet. Use Re-run verification at the top of the bid, then decide on the verified result."}
            </p>
          </Card>
        ) : view.flags.closed ? (
          <Card>
            <p className="flex items-center gap-2 text-xs text-slate-800">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />A final decision has been recorded, so the bid is locked. A new decision is possible only after you accept a re-evaluation request from the bidder.
            </p>
          </Card>
        ) : (
          <DecisionForm key={`${view.bid.id}-${view.decisions.length}-${preset.decision ?? ''}-${preset.finding ?? ''}`} view={view} preset={preset} />
        )}
        <DecisionHistory view={view} />
        {source === 'api' && <EvaluationReports view={view} />}
      </div>
    </div>
  );
};

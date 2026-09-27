import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Send } from 'lucide-react';
import { OPTIONAL_CODES, SAFETY_EQUIPMENT_TEMPLATE } from '@shared/domain/tenderTemplate';
import { Button, Card, PageHeader } from '../../components/ui/primitives';
import { inputClass } from '../../components/ui/styles';
import { useToast } from '../../components/ui/toast';
import { tenderPath } from '../../lib/format';
import { api } from '../../state/api';
import { useApp } from '../../state/appContext';

const plusDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="block text-xs font-medium text-slate-700">
    {label}
    <div className="mt-1">{children}</div>
    {hint && <span className="mt-0.5 block text-[11px] font-normal text-slate-500">{hint}</span>}
  </label>
);

/** Publish a new tender from the CPCL requirement template; it opens for bids on GeM at once. */
export const NewTenderPage: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { reload } = useApp();
  const [f, setF] = useState({
    title: '',
    category: 'Safety & Fire',
    division: 'Chennai Refinery — Fire & Safety Department',
    description: '',
    estimatedValueCr: '1.00',
    emdAmount: '100000',
    turnoverCr: '3.00',
    deadlineDate: plusDays(21),
    technicalOpeningDate: plusDays(22),
  });
  const [exclude, setExclude] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  const turnover = Number(f.turnoverCr);
  const emd = Number(f.emdAmount);
  const preview = useMemo(
    () => (turnover > 0 && emd >= 0 ? SAFETY_EQUIPMENT_TEMPLATE({ turnoverCr: turnover, emdAmount: emd }) : []),
    [turnover, emd],
  );

  const publish = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.createTender({
        title: f.title,
        category: f.category,
        division: f.division,
        description: f.description,
        estimatedValue: Math.round(Number(f.estimatedValueCr) * 1e7),
        emdAmount: emd,
        turnoverCr: turnover,
        deadlineDate: f.deadlineDate,
        technicalOpeningDate: f.technicalOpeningDate,
        exclude,
      });
      await reload();
      toast({ kind: 'success', title: 'Tender published', message: `${r.id} is open for bids on GeM (simulated).` });
      navigate(tenderPath(r.id));
    } catch (err) {
      toast({ kind: 'error', title: 'Tender not published', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void publish(e)} className="space-y-5">
      <PageHeader
        title="New tender"
        subtitle="Start from CPCL's safety-equipment requirement template, set this tender's values, and publish. Bidders can participate on GeM straight away; CSAP verifies every bid against these requirements."
        breadcrumbs={[{ label: 'Tenders', to: '/tenders' }, { label: 'New tender' }]}
      />
      <Card title="Tender details">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title"><input className={inputClass} value={f.title} onChange={set('title')} placeholder="e.g. Portable gas detectors for the Manali refinery" required /></Field>
          <Field label="Category"><input className={inputClass} value={f.category} onChange={set('category')} /></Field>
          <Field label="Division / office"><input className={inputClass} value={f.division} onChange={set('division')} /></Field>
          <Field label="Estimated value (₹ crore)"><input className={inputClass} inputMode="decimal" value={f.estimatedValueCr} onChange={set('estimatedValueCr')} /></Field>
          <Field label="Bid end date"><input type="date" className={inputClass} value={f.deadlineDate} onChange={set('deadlineDate')} /></Field>
          <Field label="Technical bid opening"><input type="date" className={inputClass} value={f.technicalOpeningDate} onChange={set('technicalOpeningDate')} /></Field>
          <div className="sm:col-span-2">
            <Field label="Description (shown to bidders)">
              <textarea className={`${inputClass} min-h-[64px]`} value={f.description} onChange={set('description')} />
            </Field>
          </div>
        </div>
      </Card>

      <Card title="Eligibility values" subtitle="The values the checks use. Local content (50%, Make in India order) and OEM validity (90 days after opening) are policy and fixed.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Minimum average turnover (₹ crore)" hint="Over the last 3 audited years"><input className={inputClass} inputMode="decimal" value={f.turnoverCr} onChange={set('turnoverCr')} /></Field>
          <Field label="EMD amount (₹)" hint="MSEs registered on Udyam may claim exemption"><input className={inputClass} inputMode="numeric" value={f.emdAmount} onChange={set('emdAmount')} /></Field>
        </div>
      </Card>

      <Card title={`Requirements (${preview.length - exclude.length})`} subtitle="Exactly what bidders see and CSAP checks. Optional items can be left out." padded={false}>
        <ul className="divide-y divide-slate-100">
          {preview.map((r) => {
            const optional = OPTIONAL_CODES.includes(r.code);
            const off = exclude.includes(r.code);
            return (
              <li key={r.code} className={`flex items-start gap-3 px-4 py-2.5 text-xs ${off ? 'opacity-50' : ''}`}>
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={!off}
                  disabled={!optional}
                  aria-label={`Include ${r.title}`}
                  onChange={() => setExclude((x) => (off ? x.filter((c) => c !== r.code) : [...x, r.code]))}
                />
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">
                    <span className="font-mono text-slate-500">{r.code}</span> {r.title}
                    {!optional && <span className="ml-1 text-[11px] font-normal text-slate-500">(always included)</span>}
                  </p>
                  <p className="text-slate-600">{r.criterion}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" onClick={() => navigate('/tenders')}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={busy || !f.title.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Publish on GeM
        </Button>
      </div>
    </form>
  );
};

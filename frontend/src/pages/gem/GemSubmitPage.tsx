import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, FileUp, Loader2, Sparkles } from 'lucide-react';
import { formatDate } from '../../lib/format';
import { GemCard, gemButton, gemInput, gemPrimary, gemSecondary } from './GemLayout';
import { rememberSeller } from './gemSeller';
import { crore, gemApi, inr, type EmdInstrument, type GemCompany, type GemDocument, type GemTender } from './gemApi';

const FY = ['2022-23', '2023-24', '2024-25'];
const EMPTY: GemCompany = { name: '', pan: '', gstin: '', udyamNumber: '', msmeCategory: '', cin: '', epfoCode: '', esicCode: '', incorporationDate: '', address: '' };

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error('Could not read the file.'));
    r.readAsDataURL(file);
  });

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="block text-xs font-medium text-slate-700">
    {label}
    <div className="mt-1">{children}</div>
    {hint && <span className="mt-0.5 block text-[11px] font-normal text-slate-500">{hint}</span>}
  </label>
);

export const GemSubmitPage: React.FC = () => {
  const { tenderId = '' } = useParams();
  const id = decodeURIComponent(tenderId);
  const navigate = useNavigate();
  const draftId = useMemo(() => crypto.randomUUID(), []);
  const [tender, setTender] = useState<GemTender | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [company, setCompany] = useState<GemCompany>(EMPTY);
  const [turnover, setTurnover] = useState<string[]>(['', '', '']);
  const [localContent, setLocalContent] = useState('');
  const [emd, setEmd] = useState<{ instrument: EmdInstrument; amount: string; reference: string; bankName: string }>({ instrument: 'NEFT_RTGS', amount: '', reference: '', bankName: '' });
  const [docs, setDocs] = useState<Record<string, GemDocument & { specimen?: boolean }>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    gemApi
      .tenders()
      .then((ts) => {
        const t = ts.find((x) => x.id === id);
        if (t) setTender(t);
        else setError('This tender is not open for bids.');
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [id]);

  const set = (k: keyof GemCompany) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCompany((c) => ({ ...c, [k]: ['pan', 'gstin', 'udyamNumber', 'cin', 'epfoCode'].includes(k) ? e.target.value.toUpperCase() : e.target.value }));

  const fillDemo = async () => {
    setError(null);
    try {
      const kit = await gemApi.demoKit();
      setCompany({ ...EMPTY, ...kit.company });
      setTurnover(FY.map((fy) => String(kit.declared.turnover.find((t) => t.financialYear === fy)?.amountCr ?? '')));
      setLocalContent(String(kit.declared.makeInIndiaPercentage));
      setEmd({ instrument: kit.declared.emd.instrument, amount: String(kit.declared.emd.amount), reference: kit.declared.emd.reference, bankName: kit.declared.emd.bankName });
      setDocs(
        Object.fromEntries(
          kit.documents.map((d) => [d.requirement, { requirementCode: d.requirement, name: d.name, path: d.path, fileName: d.fileName, mimeType: 'image/png', sizeBytes: 20_000, specimen: true }]),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const upload = async (code: string, title: string, file: File | undefined) => {
    if (!file) return;
    setError(null);
    setUploading(code);
    try {
      const r = await gemApi.upload({ draftId, requirementCode: code, fileName: file.name, mimeType: file.type, contentBase64: await fileToBase64(file) });
      setDocs((d) => ({ ...d, [code]: { requirementCode: code, name: title, path: r.path, fileName: file.name, mimeType: file.type, sizeBytes: r.sizeBytes } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(null);
    }
  };

  const missing = tender?.requirements.filter((r) => r.mandatory && !docs[r.code]) ?? [];
  const problems = [
    !company.name.trim() && 'company name',
    !/^[A-Z]{5}\d{4}[A-Z]$/.test(company.pan) && 'a valid PAN',
    !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(company.gstin) && 'a valid GSTIN',
    company.gstin && company.pan && company.gstin.slice(2, 12) !== company.pan && 'a GSTIN that contains your PAN',
    turnover.some((t) => !(Number(t) > 0)) && 'turnover for all three years',
    !(Number(localContent) >= 0 && localContent !== '') && 'local content %',
    emd.instrument !== 'MSME_EXEMPTION' && !(Number(emd.amount) > 0) && 'EMD amount',
  ].filter(Boolean) as string[];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tender || problems.length) return;
    setSubmitting(true);
    setError(null);
    try {
      const sub = await gemApi.submit({
        tenderId: tender.id,
        company,
        declared: {
          turnover: FY.map((fy, i) => ({ financialYear: fy, amountCr: Number(turnover[i]) })),
          makeInIndiaPercentage: Number(localContent),
          emd: { instrument: emd.instrument, amount: emd.instrument === 'MSME_EXEMPTION' ? 0 : Number(emd.amount), reference: emd.reference, bankName: emd.bankName },
        },
        documents: Object.values(docs).map(({ specimen: _s, ...d }) => d),
      });
      rememberSeller(company.pan);
      navigate(`/gem/submissions/${sub.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  if (!tender)
    return error ? (
      <p role="alert" className="text-sm text-rose-700">{error} <Link to="/gem" className="underline">Back to tenders</Link></p>
    ) : (
      <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
    );

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to={`/gem/tenders/${encodeURIComponent(tender.id)}`} className="text-xs text-[#1b3a6b] hover:underline">← Bid document</Link>
          <p className="mt-1 font-mono text-xs text-slate-500">{tender.id}</p>
          <h1 className="text-xl font-semibold">{tender.title}</h1>
          <p className="text-xs text-slate-600">
            {tender.buyer} · estimated {crore(tender.estimatedValue)} · EMD {inr(tender.emdAmount)} · closes {formatDate(tender.deadlineDate)}
          </p>
        </div>
        <button type="button" onClick={() => void fillDemo()} className={gemSecondary}>
          <Sparkles aria-hidden className="h-4 w-4" /> Fill with demo bidder
        </button>
      </div>

      <GemCard title="1. Company details">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Company name"><input className={gemInput} value={company.name} onChange={set('name')} /></Field>
          <Field label="PAN" hint="10 characters, e.g. AADCC2718R"><input className={`${gemInput} font-mono`} maxLength={10} value={company.pan} onChange={set('pan')} /></Field>
          <Field label="GSTIN" hint="Must contain your PAN"><input className={`${gemInput} font-mono`} maxLength={15} value={company.gstin} onChange={set('gstin')} /></Field>
          <Field label="Udyam number (MSMEs)"><input className={`${gemInput} font-mono`} value={company.udyamNumber} onChange={set('udyamNumber')} /></Field>
          <Field label="MSME category" hint="e.g. Small (Manufacturing)"><input className={gemInput} value={company.msmeCategory} onChange={set('msmeCategory')} /></Field>
          <Field label="CIN (companies)"><input className={`${gemInput} font-mono`} value={company.cin} onChange={set('cin')} /></Field>
          <Field label="EPFO establishment code"><input className={`${gemInput} font-mono`} value={company.epfoCode} onChange={set('epfoCode')} /></Field>
          <Field label="ESIC employer code"><input className={`${gemInput} font-mono`} value={company.esicCode} onChange={set('esicCode')} /></Field>
          <Field label="Date of incorporation"><input type="date" className={gemInput} value={company.incorporationDate} onChange={set('incorporationDate')} /></Field>
          <Field label="Registered address"><input className={gemInput} value={company.address} onChange={set('address')} /></Field>
        </div>
      </GemCard>

      <GemCard title="2. Declarations">
        <div className="grid gap-3 sm:grid-cols-3">
          {FY.map((fy, i) => (
            <Field key={fy} label={`Turnover FY ${fy} (₹ crore)`}>
              <input className={gemInput} inputMode="decimal" value={turnover[i]} onChange={(e) => setTurnover((t) => t.map((v, j) => (j === i ? e.target.value : v)))} />
            </Field>
          ))}
          <Field label="Local content (%)" hint="Make in India"><input className={gemInput} inputMode="decimal" value={localContent} onChange={(e) => setLocalContent(e.target.value)} /></Field>
          <Field label="EMD paid as">
            <select className={gemInput} value={emd.instrument} onChange={(e) => setEmd((m) => ({ ...m, instrument: e.target.value as EmdInstrument }))}>
              <option value="NEFT_RTGS">Online transfer (NEFT/RTGS)</option>
              <option value="BANK_GUARANTEE">Bank guarantee</option>
              <option value="MSME_EXEMPTION">MSE exemption (Udyam)</option>
            </select>
          </Field>
          {emd.instrument !== 'MSME_EXEMPTION' && (
            <>
              <Field label={`EMD amount (₹) — required ${inr(tender.emdAmount)}`}><input className={gemInput} inputMode="numeric" value={emd.amount} onChange={(e) => setEmd((m) => ({ ...m, amount: e.target.value }))} /></Field>
              <Field label="Transaction / guarantee number"><input className={`${gemInput} font-mono`} value={emd.reference} onChange={(e) => setEmd((m) => ({ ...m, reference: e.target.value }))} /></Field>
              <Field label="Bank"><input className={gemInput} value={emd.bankName} onChange={(e) => setEmd((m) => ({ ...m, bankName: e.target.value }))} /></Field>
            </>
          )}
        </div>
      </GemCard>

      <GemCard title="3. Documents" actions={<span className="text-xs text-slate-500">{Object.keys(docs).length} of {tender.requirements.length} attached · PNG or JPEG, under 3 MB</span>}>
        <ul className="divide-y divide-slate-100">
          {tender.requirements.map((r) => {
            const d = docs[r.code];
            return (
              <li key={r.code} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm text-slate-900">
                    <span className="font-mono text-xs text-slate-500">{r.code}</span> {r.title}
                    {!r.mandatory && <span className="text-xs text-slate-500"> (optional)</span>}
                  </p>
                  <p className="text-[11px] text-slate-500">{r.benchmark}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {d && (
                    <span className="flex items-center gap-1 text-xs text-emerald-700">
                      <CheckCircle2 aria-hidden className="h-4 w-4" /> {d.specimen ? 'Specimen attached' : d.fileName}
                    </span>
                  )}
                  <label className={`${gemButton} cursor-pointer border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`}>
                    {uploading === r.code ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp aria-hidden className="h-4 w-4" />}
                    {d ? 'Replace' : 'Upload'}
                    <input type="file" accept="image/png,image/jpeg" className="sr-only" aria-label={`Upload ${r.title}`} onChange={(e) => void upload(r.code, r.title, e.target.files?.[0])} />
                  </label>
                </div>
              </li>
            );
          })}
        </ul>
      </GemCard>

      {error && <p role="alert" className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-xs text-slate-600">
          {problems.length
            ? `Still needed: ${problems.join(', ')}.`
            : missing.length
              ? `Ready. ${missing.length} mandatory document(s) not attached; the buyer will see them as missing.`
              : 'Ready to submit. The buyer receives your bid immediately and verifies it automatically.'}
        </p>
        <button type="submit" disabled={!!problems.length || submitting} className={`${gemPrimary} px-5`}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Submit bid
        </button>
      </div>
    </form>
  );
};

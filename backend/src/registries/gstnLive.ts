// GSTN check against the live GST portal data from gstinapi.in: registration profile plus the
// GSTR-3B returns of the current financial year. Used by the GSTN adapter for real GSTINs and
// by the officer's stand-alone "Live GSTIN lookup".

import { check, nameMatches, worst, type RegistryResult } from './adapters.js';
import { backupConfigured, fetchBackup, fetchProfile, fetchReturns, financialYear, fromBackup, gstr3bFilings, ProviderUnavailable, type ProviderCall } from './gstinProvider.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const dateLabel = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

/** GSTR-3B periods of the financial year already due on `asOf` (due by the 24th of the next month). */
function duePeriods(asOf: string, fy: string): string[] {
  const latest = addMonths(asOf.slice(0, 7), Number(asOf.slice(8, 10)) > 24 ? -1 : -2);
  const out: string[] = [];
  for (let p = `${fy.slice(0, 4)}-04`; p <= latest; p = addMonths(p, 1)) out.push(p);
  return out;
}

export async function liveGstn(gstin: string, bid?: { name: string; pan: string }): Promise<RegistryResult> {
  const asOf = new Date().toISOString().slice(0, 10);
  const fy = financialYear(asOf);
  let provider = 'gstinapi.in';
  let profile: ProviderCall;
  let returns: ProviderCall | null = null;
  let returnsNote: string | null = null;
  try {
    profile = await fetchProfile(gstin);
  } catch (err) {
    // Primary out of credits or down: the backup answers profile and filings in one call.
    // If both are unavailable, ProviderUnavailable propagates and the check reads "not verified".
    if (!(err instanceof ProviderUnavailable) || !backupConfigured()) throw err;
    const b = await fetchBackup(gstin);
    const n = fromBackup(b.body);
    provider = 'gstinapi.com (backup provider)';
    profile = { ...b, body: n.profile };
    returns = b.httpStatus === 200 ? { ...b, body: n.returns, latencyMs: 0 } : null;
  }
  const source = (c: ProviderCall) => (c.cached ? `cached answer from ${dateLabel(c.fetchedAt)} (no credit used)` : 'live call (1 credit)');
  const base = {
    registry: 'GSTN' as const,
    mode: 'LIVE_PROVIDER' as const,
    identifier: gstin,
    request: { method: 'GET', url: profile.url, body: null },
    latencyMs: profile.latencyMs,
  };

  if (profile.httpStatus === 404) {
    return {
      ...base,
      response: { httpStatus: 404, body: { profile: profile.body, cached: profile.cached } },
      status: 'NOT_FOUND',
      summary: `${gstin} is not registered on the GST portal (live lookup).`,
      facts: [{ label: 'Source', value: `${provider} · ${source(profile)}` }],
      checks: [check('Registration exists', false, 'Registered', 'Not found on GST portal')],
    };
  }

  const d = (profile.body.data ?? profile.body) as Record<string, any>;
  const status = String(d.status ?? 'Unknown');
  const active = /^active$/i.test(status);

  // Returns are best-effort: if the provider cannot answer, the filing checks stay open (not passed).
  if (provider === 'gstinapi.in') {
    try {
      returns = await fetchReturns(gstin, fy);
    } catch (err) {
      if (!(err instanceof ProviderUnavailable)) throw err;
      returnsNote = err.message;
    }
  }
  const fyStart = `${fy.slice(0, 4)}-04`;
  const fyEnd = `${Number(fy.slice(0, 4)) + 1}-03`;
  const filings = returns?.httpStatus === 200 ? gstr3bFilings(returns.body).filter((f) => f.period >= fyStart && f.period <= fyEnd) : [];
  const filed = filings.filter((f) => f.filedOn);
  const quarterly = filed.length > 0 && filed.every((f) => ['03', '06', '09', '12'].includes(f.period.slice(5)));
  const due = duePeriods(asOf, fy).filter((p) => !quarterly || ['03', '06', '09', '12'].includes(p.slice(5)));
  const filedSet = new Set(filed.map((f) => f.period));
  const missing = due.filter((p) => !filedSet.has(p));
  const late = filed.filter((f) => f.onTime === false && due.includes(f.period));
  const haveReturns = returns?.httpStatus === 200;

  const checks = [
    check('Registration active', active, 'Active', status),
    ...(bid
      ? [
          check('Legal name matches bid', nameMatches(d.legal_name, bid.name) || nameMatches(d.trade_name, bid.name), bid.name, d.legal_name ?? '—'),
          check('PAN embedded in GSTIN', gstin.slice(2, 12) === bid.pan, bid.pan, gstin.slice(2, 12)),
        ]
      : []),
    check(
      `GSTR-3B filed (FY ${fy})`,
      !haveReturns || due.length === 0 ? null : missing.length === 0,
      due.length ? `${due.length} of ${due.length} filed${quarterly ? ' (quarterly)' : ''}` : 'None due yet',
      !haveReturns ? (returnsNote ?? 'Returns not available') : due.length ? `${due.length - missing.length} of ${due.length} filed${missing.length ? ` — missing ${missing.map(monthLabel).join(', ')}` : ''}` : '—',
    ),
    check(
      'GSTR-3B filed on time',
      !haveReturns || filed.length === 0 ? null : late.length === 0,
      'By the due date',
      !haveReturns || filed.length === 0 ? '—' : late.length ? `${late.length} late (${late.map((f) => monthLabel(f.period)).join(', ')})` : 'On time',
    ),
  ];
  const cancelled = !active;
  const verdict = cancelled ? 'FAILED' : worst(checks, ['PAN embedded in GSTIN', `GSTR-3B filed (FY ${fy})`]);
  const openFiling = checks.some((c) => c.ok === null && c.label.startsWith('GSTR-3B filed ('));

  return {
    ...base,
    latencyMs: profile.latencyMs + (returns?.latencyMs ?? 0),
    response: { httpStatus: profile.httpStatus, body: { provider, profile: profile.body, returns: returns?.body ?? null, cached: profile.cached && (returns?.cached ?? true) } },
    status: verdict === 'VERIFIED' && openFiling ? 'REVIEW' : verdict,
    summary: cancelled
      ? `GST registration is ${status}${d.cancellation_date ? ` since ${d.cancellation_date}` : ''} (live GST portal data).`
      : missing.length && haveReturns
        ? `Active on the GST portal, but ${missing.length} GSTR-3B return(s) not filed this financial year.`
        : late.length
          ? `Active on the GST portal; returns filed, ${late.length} late.`
          : openFiling
            ? 'Active on the GST portal; filing history not available — check returns manually.'
            : 'Active on the GST portal; GSTR-3B returns filed on time (live data).',
    facts: [
      { label: 'Legal name', value: d.legal_name ?? '—' },
      ...(d.trade_name ? [{ label: 'Trade name', value: d.trade_name }] : []),
      { label: 'Status', value: status },
      ...(d.taxpayer_type ? [{ label: 'Taxpayer type', value: d.taxpayer_type }] : []),
      ...((d.business_constitution ?? d.constitution) ? [{ label: 'Constitution', value: d.business_constitution ?? d.constitution }] : []),
      ...(d.registration_date ? [{ label: 'Registered', value: d.registration_date }] : []),
      ...(d.cancellation_date ? [{ label: 'Cancelled', value: d.cancellation_date }] : []),
      ...(d.address ? [{ label: 'Address', value: [d.address, d.pincode].filter(Boolean).join(' — ') }] : []),
      ...(haveReturns && filed.length ? [{ label: `GSTR-3B FY ${fy}`, value: filed.map((f) => `${monthLabel(f.period)}: ${f.onTime === false ? 'late' : 'on time'}`).join(' · ') }] : []),
      {
        label: 'Source',
        value: `${provider} (live GST portal data) · ${provider === 'gstinapi.in' ? `profile: ${source(profile)}${returns ? ` · returns: ${source(returns)}` : ''}` : source(profile)}`,
      },
    ],
    checks,
  };
}

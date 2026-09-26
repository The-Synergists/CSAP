// Plain-language descriptions and display fields for each government registry, so officers see
// names and results rather than API payloads.

export interface RegistryMeta {
  key: string;
  title: string;
  authority: string;
  checks: string;
  idLabel: string;
  idField: string;
  columns: string[];
}

export const REGISTRIES: RegistryMeta[] = [
  { key: 'pan', title: 'PAN', authority: 'Income Tax Department', checks: 'Is the PAN valid, and is it registered to the bidder?', idLabel: 'PAN', idField: 'pan', columns: ['pan', 'registered_name', 'category', 'status'] },
  { key: 'gstn', title: 'GST registration & returns', authority: 'GSTN', checks: 'Is the GST registration active, and were monthly GSTR-3B returns filed on time?', idLabel: 'GSTIN', idField: 'gstin', columns: ['gstin', 'legal_name', 'status', 'constitution', 'state', 'filings'] },
  { key: 'udyam', title: 'Udyam / MSME', authority: 'Ministry of MSME', checks: 'Is the enterprise registered, and is it micro or small (needed for EMD exemption)?', idLabel: 'Udyam number', idField: 'udyam_number', columns: ['udyam_number', 'enterprise_name', 'type', 'major_activity', 'status'] },
  { key: 'mca21', title: 'Company master data', authority: 'Ministry of Corporate Affairs (MCA21)', checks: 'Is the company active, and who are its directors?', idLabel: 'CIN', idField: 'cin', columns: ['cin', 'company_name', 'company_status', 'date_of_incorporation', 'directors'] },
  { key: 'epfo', title: 'EPFO', authority: "Employees' Provident Fund Organisation", checks: 'Is the establishment live, and is the latest monthly return (ECR) filed?', idLabel: 'Establishment code', idField: 'establishment_code', columns: ['establishment_code', 'establishment_name', 'status', 'latest_ecr_month'] },
  { key: 'esic', title: 'ESIC', authority: "Employees' State Insurance Corporation", checks: 'Is the employer registered, and are contributions up to date?', idLabel: 'Employer code', idField: 'employer_code', columns: ['employer_code', 'employer_name', 'status', 'latest_contribution_month'] },
  { key: 'startup_india', title: 'Startup India', authority: 'DPIIT', checks: 'Is a claimed startup recognition valid?', idLabel: 'DPIIT number', idField: 'dpiit_number', columns: ['dpiit_number', 'entity_name', 'status', 'valid_until'] },
  { key: 'nsic', title: 'NSIC registration', authority: 'NSIC', checks: 'Is a claimed NSIC registration valid?', idLabel: 'Registration number', idField: 'registration_number', columns: ['registration_number', 'entity_name', 'status', 'valid_until'] },
  { key: 'debarment', title: 'Blacklisting / debarment', authority: 'CPPP · GeM · MoPNG · CPCL', checks: 'Is the bidder currently debarred by any buyer?', idLabel: 'PAN or company name', idField: 'pan', columns: ['entity_name', 'pan', 'authority', 'debarred_from', 'debarred_until', 'reason'] },
  { key: 'digilocker', title: 'DigiLocker issued documents', authority: 'DigiLocker', checks: 'Were the uploaded certificates really issued by the authority?', idLabel: 'PAN, GSTIN or Udyam number', idField: 'identifier', columns: ['identifier', 'doc_name', 'issuer', 'name_on_record', 'issued_on'] },
];

export const LABEL: Record<string, string> = {
  pan: 'PAN', registered_name: 'Registered name', category: 'Category', status: 'Status', date_of_incorporation: 'Date of incorporation / birth',
  aadhaar_seeding: 'Aadhaar linked', last_updated: 'Last updated', gstin: 'GSTIN', legal_name: 'Legal name', trade_name: 'Trade name',
  taxpayer_type: 'Taxpayer type', constitution: 'Constitution', registration_date: 'Registered on', state: 'State', principal_address: 'Address',
  cancellation_date: 'Cancelled on', filings: 'GSTR-3B returns', udyam_number: 'Udyam number', enterprise_name: 'Enterprise', type: 'Enterprise type',
  major_activity: 'Activity', date_of_registration: 'Registered on', classification_year: 'Classified for', cin: 'CIN', company_name: 'Company',
  company_status: 'Company status', company_class: 'Class', registered_office: 'Registered office', last_agm_date: 'Last AGM', directors: 'Directors',
  establishment_code: 'Establishment code', establishment_name: 'Establishment', latest_ecr_month: 'Latest return month', latest_ecr_paid_on: 'Paid on',
  employees_covered: 'Employees', employer_code: 'Employer code', employer_name: 'Employer', latest_contribution_month: 'Latest contribution month',
  dpiit_number: 'DPIIT number', entity_name: 'Name', recognition_date: 'Recognised on', valid_until: 'Valid until', sector: 'Sector',
  registration_number: 'Registration number', valid_from: 'Valid from', items_covered: 'Items covered', monetary_limit_inr: 'Limit (₹)',
  authority: 'Authority', order_reference: 'Order', debarred_from: 'Debarred from', debarred_until: 'Debarred until', reason: 'Reason',
  doc_name: 'Document', doc_type: 'Type', issuer: 'Issuer', identifier: 'Identifier', issued_on: 'Issued on', name_on_record: 'Name on record',
  remarks: 'Remarks', name_match: 'Name check',
};

/** A value as an officer would read it. */
export const display = (key: string, v: unknown): string => {
  if (v == null || v === '') return '—';
  if (key === 'filings' && Array.isArray(v)) {
    const late = v.filter((f) => f.status === 'LATE').length;
    const missed = v.filter((f) => f.status === 'NOT_FILED').length;
    return `${v.length - missed} of ${v.length} filed${late ? `, ${late} late` : ''}${missed ? `, ${missed} missing` : ''}`;
  }
  if (key === 'directors' && Array.isArray(v)) return v.map((d) => d.name).join(', ') || '—';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') return '…';
  if (typeof v === 'number' && key.endsWith('_inr')) return v.toLocaleString('en-IN');
  // Codes such as NOT_APPLICABLE read as plain words.
  if (typeof v === 'string' && /^[A-Z]+(_[A-Z]+)+$/.test(v)) return v.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
  return String(v);
};

export type Verdict = { tone: 'good' | 'warn' | 'bad'; headline: string; fields: [string, string][] };

const BAD_STATUS = /cancel|suspend|strike|closed|expired|deactivat|invalid/i;

/** Turns a registry's answer into a plain result. */
export function verdictOf(meta: RegistryMeta, httpStatus: number, body: Record<string, unknown>): Verdict {
  const status = String(body.status ?? '');
  if (httpStatus === 400 || status === 'INVALID_FORMAT') return { tone: 'bad', headline: `Not a valid ${meta.idLabel}.`, fields: [] };
  if (status === 'NOT_FOUND') return { tone: 'bad', headline: `Not found in the ${meta.title} registry.`, fields: [] };
  if (meta.key === 'pan') {
    const fields: [string, string][] = ['registered_name', 'category', 'status', 'date_of_incorporation', 'aadhaar_seeding'].map((k) => [LABEL[k], display(k, body[k])]);
    return status === 'VALID'
      ? { tone: 'good', headline: `Valid PAN, registered to ${body.registered_name}.`, fields }
      : { tone: 'bad', headline: `PAN is ${status.toLowerCase()}. ${body.remarks ?? ''}`.trim(), fields };
  }
  if (meta.key === 'debarment') {
    const matches = (body.matches as Record<string, unknown>[]) ?? [];
    if (status === 'DEBARRED') {
      const m = matches.find((x) => x.active) ?? matches[0];
      return { tone: 'bad', headline: `Debarred by ${m?.authority} until ${m?.debarred_until}.`, fields: [['Reason', display('reason', m?.reason)], ['Order', display('order_reference', m?.order_reference)]] };
    }
    return { tone: 'good', headline: matches.length ? 'Not currently debarred (a past debarment has ended).' : 'Not on any debarment list.', fields: [] };
  }
  if (meta.key === 'digilocker') {
    const docs = (body.documents as Record<string, unknown>[]) ?? [];
    return { tone: 'good', headline: `${docs.length} document${docs.length === 1 ? '' : 's'} issued by the authorities.`, fields: docs.map((d) => [String(d.doc_name), `${d.issuer} · issued ${d.issued_on}`]) };
  }
  const record = (body.record as Record<string, unknown>) ?? {};
  const keys = [...meta.columns.filter((k) => k !== meta.idField), ...Object.keys(record).filter((k) => ['cancellation_date', 'remarks', 'registration_date', 'valid_from'].includes(k))];
  const fields = [...new Set(keys)].filter((k) => record[k] != null).map((k) => [LABEL[k] ?? k, display(k, record[k])] as [string, string]);
  const recordStatus = String(record.status ?? record.company_status ?? '');
  const name = record.legal_name ?? record.enterprise_name ?? record.company_name ?? record.establishment_name ?? record.employer_name ?? record.entity_name;
  return BAD_STATUS.test(recordStatus)
    ? { tone: 'warn', headline: `Found, but the registration is ${recordStatus.toLowerCase()}.`, fields }
    : { tone: 'good', headline: `Found: ${name ?? 'registered'}${recordStatus ? ` · ${recordStatus}` : ''}.`, fields };
}

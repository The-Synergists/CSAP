// Client for the simulated GeM portal (bidder side). No officer session is involved.

import { publicCall } from '../../state/api';

export interface GemTender {
  id: string;
  title: string;
  buyer: string;
  division: string;
  category: string;
  description: string;
  estimatedValue: number;
  emdAmount: number;
  publishDate: string;
  deadlineDate: string;
  requirements: { code: string; title: string; criterion: string; benchmark: string; mandatory: boolean; category: string }[];
}

export interface GemCompany {
  name: string;
  pan: string;
  gstin: string;
  udyamNumber?: string;
  msmeCategory?: string;
  cin?: string;
  epfoCode?: string;
  esicCode?: string;
  incorporationDate?: string;
  address?: string;
}

export type EmdInstrument = 'NEFT_RTGS' | 'BANK_GUARANTEE' | 'MSME_EXEMPTION';

export interface GemDeclared {
  turnover: { financialYear: string; amountCr: number }[];
  makeInIndiaPercentage: number;
  emd: { instrument: EmdInstrument; amount: number; reference: string; bankName: string; paymentDate?: string };
}

export interface GemDocument {
  requirementCode: string;
  name: string;
  path: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface GemSubmission {
  id: string;
  gemBidNo: string;
  tenderId: string;
  company: GemCompany;
  declared: GemDeclared;
  documents: GemDocument[];
  status: 'SUBMITTED' | 'DELIVERED' | 'DELIVERY_FAILED';
  csapBidId: string | null;
  delivery: { request?: { url: string }; response?: { httpStatus: number }; error?: string } | null;
  submittedAt: string;
  deliveredAt: string | null;
  evaluationStatus?: string;
  evaluation?: {
    status: string;
    remarks: string | null;
    decidedAt: string | null;
    report: { reportNo: string; sha256: string; generatedAt: string; complianceScore: number; requirementsMet: string; issues: { id: string; title: string; requiredAction: string }[] } | null;
  } | null;
  evaluationReceivedAt?: string | null;
  /** The seller's clarification responses / re-evaluation requests, oldest first. */
  responses?: { kind: 'CLARIFICATION_RESPONSE' | 'REEVALUATION'; reason: string; documents: GemDocument[]; sentAt: string }[];
}

export const EVALUATION_STATUS: Record<string, { label: string; className: string }> = {
  UNDER_EVALUATION: { label: 'Under technical evaluation', className: 'bg-blue-100 text-blue-800' },
  CLARIFICATION_SOUGHT: { label: 'Clarification sought by buyer', className: 'bg-amber-100 text-amber-900' },
  TECHNICALLY_QUALIFIED: { label: 'Technically qualified · moved to financial evaluation', className: 'bg-emerald-100 text-emerald-800' },
  DISQUALIFIED: { label: 'Technically disqualified', className: 'bg-rose-100 text-rose-800' },
  UNDER_COMMITTEE_REVIEW: { label: 'Referred to evaluation committee', className: 'bg-violet-100 text-violet-800' },
};

export interface GemDemoKit {
  tender: string;
  company: GemCompany;
  declared: GemDeclared;
  documents: { requirement: string; name: string; path: string; fileName: string }[];
}

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export const gemApi = {
  tenders: () => publicCall<GemTender[]>('/api/gem/tenders'),
  demoKit: () => publicCall<GemDemoKit>('/api/gem/demo-kit'),
  upload: (b: { draftId: string; requirementCode: string; fileName: string; mimeType: string; contentBase64: string }) =>
    publicCall<{ path: string; sizeBytes: number }>('/api/gem/uploads', post(b)),
  submit: (b: { tenderId: string; company: GemCompany; declared: GemDeclared; documents: GemDocument[] }) => publicCall<GemSubmission>('/api/gem/submissions', post(b)),
  submission: (id: string) => publicCall<GemSubmission>(`/api/gem/submissions/${id}`),
  respond: (id: string, b: { reason: string; documents: GemDocument[] }) => publicCall<GemSubmission>(`/api/gem/submissions/${id}/responses`, post(b)),
  myBids: (pan: string) => publicCall<GemSubmission[]>(`/api/gem/my-bids?pan=${encodeURIComponent(pan)}`),
};

export const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error('Could not read the file.'));
    r.readAsDataURL(file);
  });

export const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
export const crore = (n: number) => `₹${(n / 1e7).toFixed(2)} Cr`;
export const gemTenderPath = (id: string) => `/gem/tenders/${encodeURIComponent(id)}`;

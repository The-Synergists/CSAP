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
}

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
};

export const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
export const crore = (n: number) => `₹${(n / 1e7).toFixed(2)} Cr`;
export const gemTenderPath = (id: string) => `/gem/tenders/${encodeURIComponent(id)}`;

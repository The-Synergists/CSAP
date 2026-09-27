// Requirement template for CPCL safety-equipment tenders. The demo tenders and every tender an
// officer creates use it; the tender-specific values (minimum average turnover, EMD) are filled in.
// Local content (50%, Make in India order) and OEM validity (90 days) are policy constants.

import type { RequirementCategory } from './types.js';

export interface TemplateRequirement {
  code: string;
  clause: string;
  category: RequirementCategory;
  title: string;
  criterion: string;
  benchmark: string;
  mandatory: boolean;
}

export interface TemplateValues {
  turnoverCr: number;
  emdAmount: number;
}

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export const SAFETY_EQUIPMENT_TEMPLATE = (v: TemplateValues): TemplateRequirement[] => {
  const cr = `₹${v.turnoverCr.toFixed(2)}`;
  const emd = inr(v.emdAmount);
  return [
    { code: 'REQ-01', clause: 'Clause 4.1', category: 'FINANCIAL', title: 'Minimum average turnover', criterion: `Average annual turnover over the last 3 audited financial years must be at least ${cr} crore.`, benchmark: `≥ ${cr} Cr average`, mandatory: true },
    { code: 'REQ-02', clause: 'Clause 4.2', category: 'STATUTORY', title: 'GST registration', criterion: 'Active GSTIN with regular GSTR-3B filings for the preceding 6 months.', benchmark: 'Active registration', mandatory: true },
    { code: 'REQ-03', clause: 'Clause 3.3', category: 'POLICY', title: 'Udyam / MSME registration', criterion: 'Valid Udyam certificate, required only when claiming MSE benefits such as EMD exemption.', benchmark: 'Required for MSE benefits', mandatory: false },
    { code: 'REQ-04', clause: 'Clause 3.4', category: 'POLICY', title: 'Make in India local content', criterion: 'Minimum 50% local content (Class-I local supplier) per the Public Procurement (Make in India) Order.', benchmark: '≥ 50% local content', mandatory: true },
    { code: 'REQ-05', clause: 'Clause 5.1(b)', category: 'TECHNICAL', title: 'OEM authorization', criterion: 'Manufacturer authorization with back-to-back warranty, valid for at least 90 days after technical bid opening.', benchmark: 'Valid ≥ 90 days after opening', mandatory: true },
    { code: 'REQ-06', clause: 'Clause 3.1', category: 'EMD', title: 'Earnest Money Deposit (EMD)', criterion: `EMD of ${emd} by online payment or bank guarantee from a scheduled bank. Bids with short EMD are liable for rejection. MSEs may claim exemption.`, benchmark: `${emd} or MSE exemption`, mandatory: true },
    { code: 'REQ-07', clause: 'Clause 4.3', category: 'STATUTORY', title: 'PAN & income tax returns', criterion: 'Valid PAN and ITR acknowledgements for FY 2023-24, 2024-25 and 2025-26.', benchmark: '3 years filed', mandatory: true },
    { code: 'REQ-08', clause: 'Clause 4.4', category: 'STATUTORY', title: 'EPFO & ESIC compliance', criterion: 'Active EPFO and ESIC codes with the latest monthly electronic challan (ECR).', benchmark: 'Active with recent ECR', mandatory: true },
    { code: 'REQ-09', clause: 'Clause 5.2', category: 'TECHNICAL', title: 'Past execution record', criterion: 'At least 2 completed contracts for similar safety equipment to PSU or oil & gas customers.', benchmark: '2 completed POs', mandatory: true },
    { code: 'REQ-10', clause: 'Clause 5.3', category: 'TECHNICAL', title: 'Product test certificates', criterion: 'NABL-accredited lab test certificates for EN 137 / IS 10245 respiratory equipment.', benchmark: 'NABL certificates', mandatory: true },
    { code: 'REQ-11', clause: 'Clause 2.4', category: 'POLICY', title: 'Non-blacklisting undertaking', criterion: 'Affidavit confirming no debarment by CPPP, MoPNG or CPCL.', benchmark: 'Signed affidavit', mandatory: true },
    { code: 'REQ-12', clause: 'Clause 2.5', category: 'POLICY', title: 'Land border declaration', criterion: 'Declaration regarding bidders from countries sharing a land border with India (GFR Rule 144(xi)).', benchmark: 'Signed declaration', mandatory: true },
  ];
};

/** Requirements an officer may leave out of a tender (the rest are mandatory eligibility items). */
export const OPTIONAL_CODES = ['REQ-03', 'REQ-09', 'REQ-10', 'REQ-12'];

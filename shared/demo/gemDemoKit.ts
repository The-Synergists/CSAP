// Fictitious bidder for demonstrating a submission on the simulated GeM portal (Phase 5).
// Single source for the GeM form's "Fill with demo bidder", the specimen images
// (database/sample_documents/export_manifest.ts writes gem_demo_kit/kit.json for the renderer)
// and the simulated registries. One deliberate issue: the OEM authorization expires before
// the tender's required validity.

export const GEM_DEMO_KIT = {
  "tender": "GEM/2026/CPCL/005",
  "company": {
    "name": "Coastal Safety Equipments Pvt Ltd",
    "pan": "AADCC2718R",
    "gstin": "33AADCC2718R1ZK",
    "udyamNumber": "UDYAM-TN-02-0073310",
    "msmeCategory": "Small (Manufacturing)",
    "cin": "U33120TN2015PTC101842",
    "epfoCode": "TNMAS0073310000",
    "esicCode": "51000733100000105",
    "incorporationDate": "2015-06-18",
    "address": "No. 18, SIDCO Industrial Estate, Thirumazhisai, Chennai, Tamil Nadu 600124"
  },
  "declared": {
    "turnover": [
      {
        "financialYear": "2022-23",
        "amountCr": 5.6
      },
      {
        "financialYear": "2023-24",
        "amountCr": 6.1
      },
      {
        "financialYear": "2024-25",
        "amountCr": 6.9
      }
    ],
    "makeInIndiaPercentage": 62,
    "emd": {
      "instrument": "NEFT_RTGS",
      "amount": 150000,
      "reference": "TXN662047",
      "bankName": "Indian Bank",
      "paymentDate": "2026-09-25"
    }
  },
  "documents": [
    {
      "requirement": "REQ-01",
      "name": "Audited Financial Statements (3 years)",
      "text": "FY 2022-23: INR 5.60 Cr | FY 2023-24: INR 6.10 Cr | FY 2024-25: INR 6.90 Cr | UDIN: 25073310CSEQ4471"
    },
    {
      "requirement": "REQ-02",
      "name": "GST Registration Certificate",
      "text": "GSTIN: 33AADCC2718R1ZK | Legal Name: Coastal Safety Equipments Pvt Ltd | Status: Active Regular"
    },
    {
      "requirement": "REQ-03",
      "name": "Udyam Registration Certificate",
      "text": "Udyam No: UDYAM-TN-02-0073310 | Enterprise: Coastal Safety Equipments Pvt Ltd | Category: Small (Manufacturing)"
    },
    {
      "requirement": "REQ-04",
      "name": "Make in India Self-Declaration",
      "text": "Declared Local Content: 62.0% | Classification: Class-I local supplier | Manufacturing Location: Thirumazhisai, Chennai"
    },
    {
      "requirement": "REQ-05",
      "name": "OEM Authorization Certificate",
      "text": "Manufacturer: Karam Industries | Authorized Partner: Coastal Safety Equipments Pvt Ltd | Warranty: Back-to-back | Valid Until: 30 Nov 2026"
    },
    {
      "requirement": "REQ-06",
      "name": "EMD Payment Receipt",
      "text": "Transaction ID: TXN662047 | Amount: INR 1,50,000.00 | Date: 25-Sep-2026 | Bank: Indian Bank | Beneficiary: CPCL Chennai"
    },
    {
      "requirement": "REQ-07",
      "name": "PAN & ITR Acknowledgements",
      "text": "Permanent Account Number: AADCC2718R | Name: COASTAL SAFETY EQUIPMENTS PVT LTD | Date of Incorporation: 18/06/2015 | Status of Taxpayer: Company"
    },
    {
      "requirement": "REQ-08",
      "name": "EPFO & ESIC Challans",
      "text": "EPFO Code: TNMAS0073310000 | ESIC Code: 51000733100000105 | Latest ECR Paid: 14 Sep 2026"
    },
    {
      "requirement": "REQ-09",
      "name": "Past Performance Certificates",
      "text": "PO: IOCL/2025/4410 Value: Rs. 1.10 Cr (Completed) | PO: HPCL/2025/2231 Value: Rs. 0.95 Cr (Completed)"
    },
    {
      "requirement": "REQ-10",
      "name": "NABL Test Reports",
      "text": "Lab: CIPET Chennai | Standard: EN 137 / IS 10245 | Verdict: PASS"
    },
    {
      "requirement": "REQ-11",
      "name": "Non-Blacklisting Affidavit",
      "text": "Affidavit Dated: 24-Sep-2026 | Declaration: Not debarred by any PSU or Ministry"
    },
    {
      "requirement": "REQ-12",
      "name": "Land Border Declaration",
      "text": "Declaration: Not from a country sharing a land border with India | Signed: Managing Director"
    }
  ]
} as const;

export type GemDemoKit = typeof GEM_DEMO_KIT;

"""Generates the simulated registry datasets used by the CSAP Government Gateway.

All records are fictitious. The four demo bidders are consistent across every registry;
extra records cover the edge cases each registry needs to demonstrate (cancelled, non-filer,
reclassified, struck off, debarred, expired, not found).

    python gov_gateway/data/generate_datasets.py
"""

import json
from pathlib import Path

OUT = Path(__file__).parent


def meta(name: str, desc: str) -> dict:
    return {
        "dataset": f"CSAP simulated {name}",
        "description": desc + " Fictitious demo data.",
        "version": "2026.09.2",
        "updated_at": "2026-09-26",
    }


PERIODS = ["Feb 2026", "Mar 2026", "Apr 2026", "May 2026", "Jun 2026", "Jul 2026"]
DUE = ["2026-03-20", "2026-04-20", "2026-05-20", "2026-06-20", "2026-07-20", "2026-08-20"]


def filings(statuses):
    out = []
    for period, due, status in zip(PERIODS, DUE, statuses):
        filed = None if status == "NOT_FILED" else (due if status == "ON_TIME" else due[:8] + "28")
        out.append({"period": period, "return_type": "GSTR-3B", "due_date": due, "filed_on": filed, "status": status})
    return out


OK6 = ["ON_TIME"] * 6

gstn = meta("GSTN taxpayer registry", "Registration status and GSTR-3B filing history.")
gstn["records"] = [
    {"gstin": "33AABCA1234F1Z8", "legal_name": "ABC INDUSTRIAL SOLUTIONS PRIVATE LIMITED", "trade_name": "ABC INDUSTRIAL SOLUTIONS", "status": "Active", "taxpayer_type": "Regular", "constitution": "Private Limited Company", "registration_date": "2017-07-01", "state": "Tamil Nadu", "principal_address": "Plot 42, Ambattur Industrial Estate, Chennai 600058", "filings": filings(OK6)},
    {"gstin": "33AABCB9876E1Z4", "legal_name": "BHARAT ENGINEERING WORKS", "trade_name": "BHARAT ENGINEERING WORKS", "status": "Active", "taxpayer_type": "Regular", "constitution": "Partnership", "registration_date": "2017-07-01", "state": "Tamil Nadu", "principal_address": "Industrial Area Phase 2, Coimbatore 641018", "filings": filings(OK6)},
    {"gstin": "09AABCN5544K1Z2", "legal_name": "NATIONAL SAFETY SYSTEMS", "trade_name": "NATIONAL SAFETY SYSTEMS", "status": "Active", "taxpayer_type": "Regular", "constitution": "Partnership", "registration_date": "2018-02-14", "state": "Uttar Pradesh", "principal_address": "Sector 62, Noida 201301", "filings": filings(["ON_TIME"] * 5 + ["LATE"])},
    {"gstin": "33AAACP4419M1ZP", "legal_name": "PRIME TECH SOLUTIONS", "trade_name": "PRIME TECH SOLUTIONS", "status": "Active", "taxpayer_type": "Regular", "constitution": "Partnership", "registration_date": "2017-07-01", "state": "Tamil Nadu", "principal_address": "TIDEL Park, Taramani, Chennai 600113", "filings": filings(OK6)},
    {"gstin": "33AAECS7788K1Z9", "legal_name": "SUNRISE SAFETY TRADERS", "trade_name": "SUNRISE SAFETY TRADERS", "status": "Cancelled", "taxpayer_type": "Regular", "constitution": "Proprietorship", "registration_date": "2019-07-03", "cancellation_date": "2026-05-31", "state": "Tamil Nadu", "principal_address": "Guindy, Chennai 600032", "filings": filings(["ON_TIME", "LATE", "NOT_FILED", "NOT_FILED", "NOT_FILED", "NOT_FILED"])},
    {"gstin": "29AAGCK5566L1ZX", "legal_name": "KAVERI FIRE PROTECTION PRIVATE LIMITED", "trade_name": "KAVERI SAFETY EQUIPMENT", "status": "Active", "taxpayer_type": "Regular", "constitution": "Private Limited Company", "registration_date": "2017-09-12", "state": "Karnataka", "principal_address": "Peenya Industrial Area, Bengaluru 560058", "filings": filings(["ON_TIME", "ON_TIME", "ON_TIME", "NOT_FILED", "NOT_FILED", "NOT_FILED"])},
    {"gstin": "33AAFCR3322Q1Z1", "legal_name": "RAJ FIRE SERVICES PRIVATE LIMITED", "trade_name": "RAJ FIRE SERVICES", "status": "Suspended", "taxpayer_type": "Regular", "constitution": "Private Limited Company", "registration_date": "2017-07-01", "state": "Tamil Nadu", "principal_address": "Ennore, Chennai 600057", "filings": filings(["NOT_FILED"] * 6)},
]

udyam = meta("Udyam registry", "MSME classification and activity.")
udyam["records"] = [
    {"udyam_number": "UDYAM-TN-02-0045812", "enterprise_name": "ABC INDUSTRIAL SOLUTIONS PRIVATE LIMITED", "type": "Small", "major_activity": "Manufacturing", "nic_codes": ["32901 Manufacture of safety equipment"], "date_of_registration": "2020-09-18", "classification_year": "2025-26", "status": "Active"},
    {"udyam_number": "UDYAM-TN-03-0012984", "enterprise_name": "BHARAT ENGINEERING WORKS", "type": "Medium", "major_activity": "Manufacturing", "nic_codes": ["28299 Manufacture of other special-purpose machinery"], "date_of_registration": "2020-10-02", "classification_year": "2025-26", "status": "Active"},
    {"udyam_number": "UDYAM-UP-28-0091245", "enterprise_name": "NATIONAL SAFETY SYSTEMS", "type": "Medium", "major_activity": "Services", "nic_codes": ["46699 Wholesale of other products"], "date_of_registration": "2021-01-11", "classification_year": "2025-26", "status": "Active"},
    {"udyam_number": "UDYAM-TN-02-0089142", "enterprise_name": "PRIME TECH SOLUTIONS", "type": "Small", "major_activity": "Manufacturing", "nic_codes": ["32901 Manufacture of safety equipment"], "date_of_registration": "2020-08-27", "classification_year": "2025-26", "status": "Active"},
    {"udyam_number": "UDYAM-KR-03-0055667", "enterprise_name": "KAVERI FIRE PROTECTION PRIVATE LIMITED", "type": "Medium", "major_activity": "Manufacturing", "nic_codes": ["32901 Manufacture of safety equipment"], "date_of_registration": "2020-11-05", "classification_year": "2025-26", "status": "Active", "remarks": "Reclassified from Small to Medium in FY 2025-26."},
]

mca = meta("MCA21 company master", "Company status, incorporation and directors.")
mca["records"] = [
    {"cin": "U29299TN2014PTC095871", "company_name": "ABC INDUSTRIAL SOLUTIONS PRIVATE LIMITED", "company_status": "Active", "company_class": "Private", "date_of_incorporation": "2014-05-14", "registered_office": "Plot 42, Ambattur Industrial Estate, Chennai, Tamil Nadu 600058", "authorised_capital_inr": 20000000, "paid_up_capital_inr": 15000000, "last_agm_date": "2025-09-26", "directors": [{"name": "SURESH ANANTHAKRISHNAN", "din": "07123456"}, {"name": "LATHA SURESH", "din": "07123457"}]},
    {"cin": "U74999KA2015PTC082334", "company_name": "KAVERI FIRE PROTECTION PRIVATE LIMITED", "company_status": "Active", "company_class": "Private", "date_of_incorporation": "2015-09-09", "registered_office": "Peenya Industrial Area, Bengaluru, Karnataka 560058", "authorised_capital_inr": 10000000, "paid_up_capital_inr": 5000000, "last_agm_date": "2025-09-30", "directors": [{"name": "RAVI KUMAR", "din": "08234567"}]},
    {"cin": "U74999TN2012PTC088123", "company_name": "RAJ FIRE SERVICES PRIVATE LIMITED", "company_status": "Strike Off", "company_class": "Private", "date_of_incorporation": "2012-11-15", "registered_office": "Ennore, Chennai, Tamil Nadu 600057", "authorised_capital_inr": 5000000, "paid_up_capital_inr": 1000000, "last_agm_date": "2021-09-30", "directors": []},
]

epfo = meta("EPFO establishment registry", "Establishment status and latest ECR (monthly return).")
epfo["records"] = [
    {"establishment_code": "TNMAS0045892000", "establishment_name": "ABC INDUSTRIAL SOLUTIONS PRIVATE LIMITED", "status": "Live", "latest_ecr_month": "2026-08", "latest_ecr_paid_on": "2026-09-12", "employees_covered": 38},
    {"establishment_code": "TNCBE0098124", "establishment_name": "BHARAT ENGINEERING WORKS", "status": "Live", "latest_ecr_month": "2026-07", "latest_ecr_paid_on": "2026-08-14", "employees_covered": 52},
    {"establishment_code": "UPNOI0078129", "establishment_name": "NATIONAL SAFETY SYSTEMS", "status": "Live", "latest_ecr_month": "2026-06", "latest_ecr_paid_on": "2026-07-29", "employees_covered": 21},
    {"establishment_code": "TNMAS0089142", "establishment_name": "PRIME TECH SOLUTIONS", "status": "Live", "latest_ecr_month": "2026-08", "latest_ecr_paid_on": "2026-09-10", "employees_covered": 64},
    {"establishment_code": "TNMAS0033221", "establishment_name": "RAJ FIRE SERVICES PRIVATE LIMITED", "status": "Closed", "latest_ecr_month": "2023-03", "latest_ecr_paid_on": "2023-04-15", "employees_covered": 0},
]

esic = meta("ESIC employer registry", "Employer status and latest contribution period.")
esic["records"] = [
    {"employer_code": "51000458920000101", "employer_name": "ABC INDUSTRIAL SOLUTIONS PRIVATE LIMITED", "status": "Active", "latest_contribution_month": "2026-08", "employees_covered": 38},
    {"employer_code": "51000981240000102", "employer_name": "BHARAT ENGINEERING WORKS", "status": "Active", "latest_contribution_month": "2026-07", "employees_covered": 52},
    {"employer_code": "69000781290000103", "employer_name": "NATIONAL SAFETY SYSTEMS", "status": "Active", "latest_contribution_month": "2026-07", "employees_covered": 21},
    {"employer_code": "51000891420000104", "employer_name": "PRIME TECH SOLUTIONS", "status": "Active", "latest_contribution_month": "2026-08", "employees_covered": 64},
]

startup = meta("Startup India (DPIIT) recognition registry", "DPIIT recognition and validity.")
startup["records"] = [
    {"dpiit_number": "DIPP145872", "entity_name": "KAVERI FIRE PROTECTION PRIVATE LIMITED", "recognition_date": "2019-03-14", "valid_until": "2027-03-13", "sector": "Industrial safety", "status": "Recognised"},
    {"dpiit_number": "DIPP098765", "entity_name": "ZENITH SAFETY CORPORATION PRIVATE LIMITED", "recognition_date": "2016-05-02", "valid_until": "2026-05-01", "sector": "Safety equipment", "status": "Expired"},
]

nsic = meta("NSIC Single Point Registration registry", "NSIC registration, validity and items covered (EMD exemption for MSEs).")
nsic["records"] = [
    {"registration_number": "NSIC/SPRS/TN/2024/00481", "entity_name": "PRIME TECH SOLUTIONS", "valid_from": "2024-04-01", "valid_until": "2027-03-31", "items_covered": ["Respiratory protective equipment", "Industrial safety equipment"], "monetary_limit_inr": 50000000, "status": "Valid"},
    {"registration_number": "NSIC/SPRS/TN/2021/00102", "entity_name": "SUNRISE SAFETY TRADERS", "valid_from": "2021-04-01", "valid_until": "2024-03-31", "items_covered": ["Safety helmets"], "monetary_limit_inr": 5000000, "status": "Expired"},
]

debarment = meta("central debarment list (CPPP / GeM / MoPNG / CPCL)", "Entities debarred or suspended from public procurement.")
debarment["records"] = [
    {"entity_name": "RAJ FIRE SERVICES PRIVATE LIMITED", "pan": "AAFCR3322Q", "gstin": "33AAFCR3322Q1Z1", "authority": "MoPNG", "order_reference": "MoPNG/Vig/2024/117", "debarred_from": "2025-01-01", "debarred_until": "2027-12-31", "reason": "Supply of sub-standard breathing apparatus"},
    {"entity_name": "SUNRISE SAFETY TRADERS", "pan": "AAECS7788K", "gstin": "33AAECS7788K1Z9", "authority": "GeM", "order_reference": "GeM/SUSP/2024/5512", "debarred_from": "2024-06-01", "debarred_until": "2025-05-31", "reason": "Repeated non-supply after order acceptance"},
]


def issued(doc_type, name, issuer, identifier, holder, issued_on):
    return {"doc_type": doc_type, "doc_name": name, "issuer": issuer, "identifier": identifier, "name_on_record": holder, "issued_on": issued_on, "uri": f"in.gov.{issuer.split()[0].lower()}-{doc_type}-{identifier}"}


digilocker = meta("DigiLocker issued-documents registry", "Documents as issued by the issuing authority (the authoritative copy an uploaded document is compared with).")
digilocker["records"] = [
    issued("PANCR", "PAN Verification Record", "Income Tax Department", "AABCA1234F", "ABC INDUSTRIAL SOLUTIONS PRIVATE LIMITED", "2014-06-02"),
    issued("GSTRC", "GST Registration Certificate", "GSTN", "33AABCA1234F1Z8", "ABC INDUSTRIAL SOLUTIONS PRIVATE LIMITED", "2017-07-01"),
    issued("UDCER", "Udyam Registration Certificate", "Ministry of MSME", "UDYAM-TN-02-0045812", "ABC INDUSTRIAL SOLUTIONS PRIVATE LIMITED", "2020-09-18"),
    issued("PANCR", "PAN Verification Record", "Income Tax Department", "AABCB9876E", "BHARAT ENGINEERING WORKS", "2011-09-10"),
    issued("GSTRC", "GST Registration Certificate", "GSTN", "33AABCB9876E1Z4", "BHARAT ENGINEERING WORKS", "2017-07-01"),
    issued("UDCER", "Udyam Registration Certificate", "Ministry of MSME", "UDYAM-TN-03-0012984", "BHARAT ENGINEERING WORKS", "2020-10-02"),
    issued("PANCR", "PAN Verification Record", "Income Tax Department", "AABCN5544K", "NATIONAL SAFETY SYSTEMS", "2018-01-22"),
    issued("GSTRC", "GST Registration Certificate", "GSTN", "09AABCN5544K1Z2", "NATIONAL SAFETY SYSTEMS", "2018-02-14"),
    issued("PANCR", "PAN Verification Record", "Income Tax Department", "AAACP4419M", "PRIME TECH SOLUTIONS", "2016-04-11"),
    issued("GSTRC", "GST Registration Certificate", "GSTN", "33AAACP4419M1ZP", "PRIME TECH SOLUTIONS", "2017-07-01"),
    issued("UDCER", "Udyam Registration Certificate", "Ministry of MSME", "UDYAM-TN-02-0089142", "PRIME TECH SOLUTIONS", "2020-08-27"),
]

if __name__ == "__main__":
    for name, obj in [("gstn", gstn), ("udyam", udyam), ("mca21", mca), ("epfo", epfo), ("esic", esic), ("startup_india", startup), ("nsic", nsic), ("debarment", debarment), ("digilocker", digilocker)]:
        (OUT / f"{name}.json").write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"{name}: {len(obj['records'])} records")

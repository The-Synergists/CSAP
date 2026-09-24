import React, { useState } from 'react';
import {
  Shield,
  Key,
  CheckCircle2,
  Save,
  FileCheck,
  Scale,
  Bell,
  BookOpen,
  Lock,
} from 'lucide-react';
import { useProcurement } from '../../context/ProcurementContext';

export const SettingsPage: React.FC = () => {
  const { currentUser } = useProcurement();

  // Procurement Officer Configuration State
  const [dscTokenId, setDscTokenId] = useState('CPCL-USB-DSC-88192');
  const [dscProvider, setDscProvider] = useState('eMudhra Class 3 (Organizational)');
  const [dscExpiry] = useState('15-Nov-2027');
  const [delegationLimit, setDelegationLimit] = useState('5000000'); // ₹50 Lakhs
  const [autoEscalateCommittee, setAutoEscalateCommittee] = useState(true);
  const [alertEmdShortfall, setAlertEmdShortfall] = useState(true);
  const [alertPqcDeficit, setAlertPqcDeficit] = useState(true);
  const [alertClarificationExpiry, setAlertClarificationExpiry] = useState(true);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [pinTestSuccess, setPinTestSuccess] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleTestDsc = () => {
    setPinTestSuccess(true);
    setTimeout(() => setPinTestSuccess(false), 3000);
  };

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-blue-600" />
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Procurement Officer Authority & Signing Profile
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage statutory signing authority, Digital Signature Certificate (DSC) credentials, and scrutiny delegation
          </p>
        </div>

        {saveSuccess && (
          <span className="text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300 px-3 py-1 rounded flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            Authority Profile Saved Successfully
          </span>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        {/* Section 1: Designated Officer Profile & Statutory Authority */}
        <div className="bg-white border border-slate-200 rounded-md p-5 shadow-2xs">
          <div className="flex items-center gap-2 pb-3 mb-4 border-b border-slate-200">
            <Shield className="w-4 h-4 text-blue-600" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Designated Officer & Statutory Authority
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block text-slate-500 font-medium mb-1">Officer Name</label>
              <input
                type="text"
                value={currentUser.name || 'R. Ramanathan'}
                readOnly
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded font-medium text-slate-800"
              />
            </div>

            <div>
              <label className="block text-slate-500 font-medium mb-1">Official Designation</label>
              <input
                type="text"
                value={currentUser.designation || 'Senior Procurement Officer'}
                readOnly
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded font-medium text-slate-800"
              />
            </div>

            <div>
              <label className="block text-slate-500 font-medium mb-1">Employee ID / GeM Reviewer Code</label>
              <input
                type="text"
                value={currentUser.badgeId || 'CPCL-PROC-4892'}
                readOnly
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded font-mono font-medium text-slate-800"
              />
            </div>

            <div>
              <label className="block text-slate-500 font-medium mb-1">Department / Division</label>
              <input
                type="text"
                value="Commercial & Contracts Division, Manali Refinery"
                readOnly
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded font-medium text-slate-800"
              />
            </div>

            <div>
              <label className="block text-slate-500 font-medium mb-1">Public Sector Enterprise</label>
              <input
                type="text"
                value={currentUser.organization || 'Chennai Petroleum Corporation Limited (Govt of India)'}
                readOnly
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded font-medium text-slate-800"
              />
            </div>

            <div>
              <label className="block text-slate-500 font-medium mb-1">Official Reviewer Email</label>
              <input
                type="text"
                value={currentUser.email || 'ramanathan.r@cpcl.co.in'}
                readOnly
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded font-medium text-slate-800"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Class-3 Digital Signature Certificate (DSC) & E-Sign */}
        <div className="bg-white border border-slate-200 rounded-md p-5 shadow-2xs">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-emerald-600" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Digital Signature Certificate (Class-3 DSC Token)
              </h2>
            </div>
            <span className="text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-300 px-2 py-0.5 rounded flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              DSC Active & Authenticated
            </span>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed mb-4">
            Under the Information Technology Act 2000 and CPPP/GeM guidelines, all officer determinations (recommendation to accept, disqualification, or clarification notice) require digital signing via a cryptographic Class-3 Hardware Token.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block text-slate-600 font-semibold mb-1">
                Cryptographic Token ID
              </label>
              <input
                type="text"
                value={dscTokenId}
                onChange={(e) => setDscTokenId(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono text-slate-900 bg-white"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">Hardware USB token reference</span>
            </div>

            <div>
              <label className="block text-slate-600 font-semibold mb-1">
                Issuing Certifying Authority (CA)
              </label>
              <select
                value={dscProvider}
                onChange={(e) => setDscProvider(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded text-slate-900 bg-white"
              >
                <option value="eMudhra Class 3 (Organizational)">eMudhra Class 3 (Organizational)</option>
                <option value="(n)Code Solutions Class 3">(n)Code Solutions Class 3</option>
                <option value="Capricorn CA Class 3">Capricorn CA Class 3</option>
                <option value="NSDL Class 3">NSDL Class 3</option>
              </select>
              <span className="text-[10px] text-slate-400 mt-1 block">CCA India accredited provider</span>
            </div>

            <div>
              <label className="block text-slate-600 font-semibold mb-1">
                Certificate Validity
              </label>
              <input
                type="text"
                value={dscExpiry}
                readOnly
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded font-mono text-emerald-800 font-medium"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">Valid for statutory sign-off</span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-slate-600">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              <span>Token Hardware: ePass2003 / mToken CryptoID (FIPS 140-2 Level 3)</span>
            </div>
            <button
              type="button"
              onClick={handleTestDsc}
              className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded transition-colors text-xs"
            >
              {pinTestSuccess ? '✓ Token Verified' : 'Verify Token PIN'}
            </button>
          </div>
        </div>

        {/* Section 3: Delegation of Financial Powers (DoP) & Scrutiny Limits */}
        <div className="bg-white border border-slate-200 rounded-md p-5 shadow-2xs">
          <div className="flex items-center gap-2 pb-3 mb-4 border-b border-slate-200">
            <Scale className="w-4 h-4 text-blue-600" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Delegation of Financial Powers (DoP) & Scrutiny Thresholds
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-xs">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                Single Tender Direct Evaluation Competence (INR):
              </label>
              <input
                type="number"
                step="500000"
                value={delegationLimit}
                onChange={(e) => setDelegationLimit(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-600"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Current limit: ₹{(Number(delegationLimit) / 100000).toFixed(2)} Lakhs. Tenders above this limit require Tender Evaluation Committee (TEC) review.
              </span>
            </div>

            <div className="flex flex-col justify-center">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoEscalateCommittee}
                  onChange={(e) => setAutoEscalateCommittee(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="font-semibold text-slate-800 block">
                    Mandatory Escalation to Tender Committee
                  </span>
                  <span className="text-[10px] text-slate-500 leading-normal block">
                    Automatically prompt "Refer to Committee" determination for tenders with estimated value exceeding ₹50.00 Lakhs.
                  </span>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Section 4: Officer Scrutiny Alerts & Notification Preferences */}
        <div className="bg-white border border-slate-200 rounded-md p-5 shadow-2xs">
          <div className="flex items-center gap-2 pb-3 mb-4 border-b border-slate-200">
            <Bell className="w-4 h-4 text-indigo-600" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Scrutiny Workstream Alerts & Action Triggers
            </h2>
          </div>

          <div className="space-y-3 text-xs">
            <label className="flex items-start gap-3 p-2.5 rounded hover:bg-slate-50 transition-colors cursor-pointer border border-transparent hover:border-slate-200">
              <input
                type="checkbox"
                checked={alertEmdShortfall}
                onChange={(e) => setAlertEmdShortfall(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <span className="font-semibold text-slate-800 block">
                  Critical Deficit: EMD Shortfall & Invalid Instrument Alert
                </span>
                <span className="text-[10px] text-slate-500 block">
                  Trigger high-priority alert when submitted EMD amount is less than tender requirement or Bank Guarantee fails SFMS confirmation.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-3 p-2.5 rounded hover:bg-slate-50 transition-colors cursor-pointer border border-transparent hover:border-slate-200">
              <input
                type="checkbox"
                checked={alertPqcDeficit}
                onChange={(e) => setAlertPqcDeficit(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <span className="font-semibold text-slate-800 block">
                  Pre-Qualification Criteria (PQC) Turnover & MAF Expiry Flag
                </span>
                <span className="text-[10px] text-slate-500 block">
                  Alert officer when bidder 3-year turnover is below the benchmark or Manufacturer Authorization Form validity is deficient.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-3 p-2.5 rounded hover:bg-slate-50 transition-colors cursor-pointer border border-transparent hover:border-slate-200">
              <input
                type="checkbox"
                checked={alertClarificationExpiry}
                onChange={(e) => setAlertClarificationExpiry(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <span className="font-semibold text-slate-800 block">
                  Bidder Clarification Response Window Reminder (48–72h)
                </span>
                <span className="text-[10px] text-slate-500 block">
                  Notify officer when a bidder's clarification deadline expires without submission, enabling timely disqualification or proceeding.
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* Section 5: Statutory Procurement Guidelines Reference */}
        <div className="bg-white border border-slate-200 rounded-md p-5 shadow-2xs">
          <div className="flex items-center gap-2 pb-3 mb-4 border-b border-slate-200">
            <BookOpen className="w-4 h-4 text-slate-600" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Statutory Procurement Directives & Mandates
            </h2>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            All bid scrutinies in this platform adhere strictly to Government of India and CPCL public procurement mandates:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded flex flex-col justify-between">
              <div>
                <div className="font-semibold text-slate-800">GFR 2017 Rule 144(xi)</div>
                <div className="text-[10px] text-slate-500 mt-1">Land Border Neighboring Country Restrictions</div>
              </div>
              <span className="text-[10px] font-semibold text-blue-700 mt-2 block">Statutory Mandate</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded flex flex-col justify-between">
              <div>
                <div className="font-semibold text-slate-800">MSE Policy Order 2012</div>
                <div className="text-[10px] text-slate-500 mt-1">EMD Exemption & 25% Purchase Preference for Micro/Small Enterprises</div>
              </div>
              <span className="text-[10px] font-semibold text-blue-700 mt-2 block">Udyam Verified</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded flex flex-col justify-between">
              <div>
                <div className="font-semibold text-slate-800">Make in India (DPIIT)</div>
                <div className="text-[10px] text-slate-500 mt-1">Class-I (≥50%) & Class-II (20–50%) Local Content Preference</div>
              </div>
              <span className="text-[10px] font-semibold text-blue-700 mt-2 block">Order 2017 Rev.</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded flex flex-col justify-between">
              <div>
                <div className="font-semibold text-slate-800">CVC Guidelines</div>
                <div className="text-[10px] text-slate-500 mt-1">Transparency in Public Tendering & Post-Tender Negotiations Ban</div>
              </div>
              <span className="text-[10px] font-semibold text-blue-700 mt-2 block">Central Vigilance</span>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="submit"
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold flex items-center gap-2 shadow-xs transition-colors"
          >
            <Save className="w-4 h-4" />
            <span>Save Officer Profile & Authority Settings</span>
          </button>
        </div>
      </form>
    </div>
  );
};

import React, { useState } from 'react';
import {
  Settings,
  Shield,
  Key,
  Sliders,
  CheckCircle2,
  Save,
  Server,
} from 'lucide-react';
import { useProcurement } from '../../context/ProcurementContext';

export const SettingsPage: React.FC = () => {
  const { currentUser } = useProcurement();
  const [ocrConfidence, setOcrConfidence] = useState('95');
  const [makeInIndiaThreshold, setMakeInIndiaThreshold] = useState('50');
  const [validityDays, setValidityDays] = useState('90');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-600" />
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Procurement Officer & System Settings
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure verification thresholds and review connected data source status
          </p>
        </div>

        {saveSuccess && (
          <span className="text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300 px-3 py-1 rounded flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            Configuration Saved Successfully
          </span>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        {/* Section 1: Designated Officer Profile */}
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
                value={currentUser.name}
                readOnly
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded font-medium text-slate-800"
              />
            </div>

            <div>
              <label className="block text-slate-500 font-medium mb-1">Designation</label>
              <input
                type="text"
                value={currentUser.designation}
                readOnly
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded font-medium text-slate-800"
              />
            </div>

            <div>
              <label className="block text-slate-500 font-medium mb-1">Employee Badge / GeM ID</label>
              <input
                type="text"
                value={currentUser.badgeId}
                readOnly
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded font-mono font-medium text-slate-800"
              />
            </div>

            <div>
              <label className="block text-slate-500 font-medium mb-1">Department / Division</label>
              <input
                type="text"
                value="Commercial & Contracts, Manali Refinery"
                readOnly
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded font-medium text-slate-800"
              />
            </div>

            <div>
              <label className="block text-slate-500 font-medium mb-1">Organization</label>
              <input
                type="text"
                value={currentUser.organization}
                readOnly
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded font-medium text-slate-800"
              />
            </div>

            <div>
              <label className="block text-slate-500 font-medium mb-1">Official Email</label>
              <input
                type="text"
                value={currentUser.email}
                readOnly
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded font-medium text-slate-800"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Officer Sign-off Identity */}
        <div className="bg-white border border-slate-200 rounded-md p-5 shadow-2xs">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-slate-600" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Officer Decision Sign-off
              </h2>
            </div>
            <span className="text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-300 px-2 py-0.5 rounded">
              DSC Not Configured
            </span>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Officer decisions are recorded against the signed-in officer's name and designation and
            written to the audit trail. Configure a Digital Signature Certificate (DSC) provider below
            to enable legally binding sign-off on officer determinations.
          </p>
        </div>

        {/* Section 3: AI Scrutiny Engine Sensitivity Thresholds */}
        <div className="bg-white border border-slate-200 rounded-md p-5 shadow-2xs">
          <div className="flex items-center gap-2 pb-3 mb-4 border-b border-slate-200">
            <Sliders className="w-4 h-4 text-indigo-600" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Verification Thresholds
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 text-xs">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                OCR Confidence Threshold (%):
              </label>
              <input
                type="number"
                min="80"
                max="99"
                value={ocrConfidence}
                onChange={(e) => setOcrConfidence(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-600"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Flag documents for manual review if OCR confidence is below threshold
              </span>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                Make in India Threshold (%):
              </label>
              <input
                type="number"
                min="20"
                max="80"
                value={makeInIndiaThreshold}
                onChange={(e) => setMakeInIndiaThreshold(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-600"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Class-I Local Supplier minimum domestic value addition (DPIIT)
              </span>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                OEM Form Validity Window (Days):
              </label>
              <input
                type="number"
                min="30"
                max="180"
                value={validityDays}
                onChange={(e) => setValidityDays(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-600"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Mandatory minimum authorization days post-bid technical opening
              </span>
            </div>
          </div>
        </div>

        {/* Section 4: Data Source References */}
        <div className="bg-white border border-slate-200 rounded-md p-5 shadow-2xs">
          <div className="flex items-center gap-2 pb-3 mb-4 border-b border-slate-200">
            <Server className="w-4 h-4 text-slate-600" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Reference Data Sources
            </h2>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Submissions are cross-verified against these government registries during AI verification.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded flex items-center justify-between">
              <div>
                <div className="font-semibold text-slate-800">GeM Portal</div>
                <div className="text-[10px] text-slate-400">Tender Ingestion</div>
              </div>
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">Connected</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded flex items-center justify-between">
              <div>
                <div className="font-semibold text-slate-800">GSTN</div>
                <div className="text-[10px] text-slate-400">GST Registration Check</div>
              </div>
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">Connected</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded flex items-center justify-between">
              <div>
                <div className="font-semibold text-slate-800">Ministry of MSME</div>
                <div className="text-[10px] text-slate-400">Udyam Registration</div>
              </div>
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">Connected</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded flex items-center justify-between">
              <div>
                <div className="font-semibold text-slate-800">CPCL Treasury</div>
                <div className="text-[10px] text-slate-400">EMD Reconciliation</div>
              </div>
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">Connected</span>
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
            <span>Save Configuration</span>
          </button>
        </div>
      </form>
    </div>
  );
};

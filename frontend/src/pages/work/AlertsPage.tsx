import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, AlertOctagon, CheckCircle2 } from 'lucide-react';
import { useProcurement } from '../../context/ProcurementContext';
import { getActiveAlerts } from '../../utils/alerts';

export const AlertsPage: React.FC = () => {
  const navigate = useNavigate();
  const { bids, selectBid } = useProcurement();

  const alerts = getActiveAlerts(bids);

  const handleInspect = (bidId: string, tenderId: string, tab?: string) => {
    selectBid(bidId, tenderId);
    navigate(tab ? `/bids/${bidId}/${tab}` : `/bids/${bidId}`);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Procurement Discrepancy & Critical Alerts
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Bids with open AI findings requiring officer attention or clarification
          </p>
        </div>
        <span className="text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200 px-2.5 py-1 rounded">
          {alerts.length} Open {alerts.length === 1 ? 'Alert' : 'Alerts'}
        </span>
      </div>

      {alerts.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-md p-10 text-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-800">No open alerts.</p>
          <p className="text-xs text-slate-500 mt-1">
            All flagged discrepancies have an officer decision recorded against them.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => {
            const isHigh = alert.severity === 'HIGH';
            return (
              <div
                key={alert.id}
                onClick={() => handleInspect(alert.bidId, alert.tenderId, alert.actionTab)}
                className={`p-4 bg-white border rounded-md shadow-2xs flex items-start justify-between gap-4 cursor-pointer transition-colors ${
                  isHigh ? 'border-rose-300 hover:bg-rose-50/30' : 'border-amber-300 hover:bg-amber-50/30'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`p-2 rounded mt-0.5 shrink-0 ${
                      isHigh ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {isHigh ? <AlertOctagon className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-bold text-xs uppercase ${isHigh ? 'text-rose-900' : 'text-amber-900'}`}
                      >
                        {isHigh ? 'Critical Deficit' : 'Rule Discrepancy'}
                      </span>
                      <span className="font-mono text-xs text-slate-500">
                        {alert.bidId} • {alert.tenderId}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 mt-0.5">
                      {alert.title} ({alert.companyName})
                    </h3>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">{alert.description}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleInspect(alert.bidId, alert.tenderId, 'decision');
                  }}
                  className={`px-3 py-1.5 text-white rounded text-xs font-semibold shrink-0 shadow-xs transition-colors ${
                    isHigh ? 'bg-rose-600 hover:bg-rose-700' : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  {alert.actionLabel}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

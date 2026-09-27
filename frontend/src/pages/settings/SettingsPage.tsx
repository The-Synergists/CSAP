import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, RefreshCw } from 'lucide-react';
import { useApp } from '../../state/appContext';
import { Badge } from '../../components/ui/Badge';
import { Button, Card, DetailList, Modal, PageHeader } from '../../components/ui/primitives';
import { useToast } from '../../components/ui/toast';

interface Health {
  status: string;
  database: string;
  verificationEngine: string;
  nvidiaOcr?: string;
  nvidiaExtraction?: string;
  panVerificationApi?: string;
  governmentGateway?: string;
  liveGstinProvider?: string;
  timestamp: string;
}

const INTEGRATIONS = [
  { name: 'CSAP AI — document reading (NVIDIA Nemotron OCR V2)', note: 'Reads every bid document, PDF or image (Documents and PAN verification tabs, and automatically for bids from GeM).', state: 'Live' },
  { name: 'CSAP AI — extraction, explanations, assistant (NVIDIA Nemotron)', note: 'Extracts the fields of each document type, writes cited explanations and answers the assistant.', state: 'Live' },
  { name: 'Government Gateway', note: 'PAN, GSTN (incl. GSTR-3B filing), Udyam, MCA21, EPFO, ESIC, Startup India, NSIC, debarment lists and DigiLocker — each registry answers from its own dataset. Real APIs plug in behind the same adapters.', state: 'Simulated' },
  { name: 'Live GSTIN provider (gstinapi.in)', note: 'Real GST registration and GSTR-3B filing data for real GSTINs (Portal verification tab). Answers are cached so repeat checks use no credits; demo GSTINs stay simulated.', state: 'Live' },
  { name: 'GeM portal (simulated)', note: 'Bids submitted on the GeM portal arrive in CSAP automatically (signed webhook) with their documents and are verified straight away; tenders published in CSAP open on GeM; evaluation reports go back to GeM after the decision.', state: 'Connected' },
  { name: 'Bank / treasury (EMD)', note: 'EMD amounts compared with submitted instrument; no bank confirmation.', state: 'Simulated' },
  { name: 'Digital signature (DSC)', note: 'Decisions are recorded against the signed-in officer, not digitally signed.', state: 'Not connected' },
];

export const SettingsPage: React.FC = () => {
  const { currentUser, source, logout, resetDemoData, reload, realtimeLive } = useApp();
  const navigate = useNavigate();
  const toast = useToast();
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const fetchHealth = useCallback(
    () =>
      fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/health`)
        .then((res) => res.json() as Promise<Health>)
        .then((h) => {
          setHealth(h);
          setHealthError(null);
        })
        .catch(() => setHealthError('Backend not reachable.')),
    [],
  );

  const checkHealth = async () => {
    setChecking(true);
    await fetchHealth();
    setChecking(false);
  };

  useEffect(() => {
    if (source === 'api') void fetchHealth();
  }, [source, fetchHealth]);

  const tone = (s?: string) => (s?.startsWith('ok') ? 'success' : 'danger');

  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader title="Profile & settings" />

      <Card title="Your profile" subtitle="Maintained by the system administrator" actions={
        <Button size="sm" onClick={() => { logout(); navigate('/login', { replace: true }); toast({ kind: 'info', title: 'Signed out' }); }}>
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </Button>
      }>
        {currentUser && (
          <DetailList
            rows={[
              { label: 'Name', value: currentUser.name },
              { label: 'Designation', value: currentUser.designation || '—' },
              { label: 'Employee ID', value: <span className="font-mono text-xs">{currentUser.employeeId || '—'}</span> },
              { label: 'Email', value: currentUser.email },
              { label: 'Role', value: currentUser.role },
            ]}
          />
        )}
      </Card>

      <Card
        title="System status"
        actions={source === 'api' && <Button size="sm" onClick={() => void checkHealth()} disabled={checking}><RefreshCw className={`h-3.5 w-3.5 ${checking ? 'animate-spin' : ''}`} /> Check again</Button>}
      >
        <DetailList
          rows={[
            { label: 'Data source', value: source === 'api' ? 'CSAP backend (Supabase database)' : 'Built-in demo dataset in this browser' },
            ...(source === 'api'
              ? [
                  { label: 'Backend', value: healthError ? <Badge tone="danger">{healthError}</Badge> : health ? <Badge tone={health.status === 'ok' ? 'success' : 'warning'}>{health.status}</Badge> : '…' },
                  { label: 'Database', value: health ? <Badge tone={tone(health.database)}>{health.database}</Badge> : '…' },
                  { label: 'Verification engine', value: health ? <Badge tone={tone(health.verificationEngine)}>{health.verificationEngine}</Badge> : '…' },
                  { label: 'CSAP AI — OCR', value: health?.nvidiaOcr ? <Badge tone={health.nvidiaOcr.startsWith('configured') ? 'success' : 'danger'}>{health.nvidiaOcr}</Badge> : '…' },
                  { label: 'CSAP AI — language model', value: health?.nvidiaExtraction ? <Badge tone={health.nvidiaExtraction.startsWith('configured') ? 'success' : 'danger'}>{health.nvidiaExtraction}</Badge> : '…' },
                  { label: 'Government Gateway', value: health?.governmentGateway ? <Badge tone={tone(health.governmentGateway)}>{health.governmentGateway}</Badge> : '…' },
                  { label: 'Live GSTIN provider', value: health?.liveGstinProvider ? <Badge tone={health.liveGstinProvider.startsWith('configured') ? 'success' : 'neutral'}>{health.liveGstinProvider}</Badge> : '…' },
                  { label: 'Realtime', value: <Badge tone={realtimeLive ? 'success' : 'warning'}>{realtimeLive ? 'connected' : 'not connected (polling)'}</Badge> },
                ]
              : []),
          ]}
        />
        <div className="mt-3 flex gap-2">
          {source === 'api' ? (
            <Button size="sm" onClick={() => void reload().then(() => toast({ kind: 'success', title: 'Data refreshed' }))}>Reload data</Button>
          ) : (
            <Button size="sm" variant="danger" onClick={() => setConfirmReset(true)}>Reset demo data</Button>
          )}
        </div>
      </Card>

      <Card title="Integrations" subtitle="What this prototype does and does not connect to" padded={false}>
        <ul className="divide-y divide-slate-100">
          {INTEGRATIONS.map((i) => (
            <li key={i.name} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-medium text-slate-900">{i.name}</p>
                <p className="text-xs text-slate-500">{i.note}</p>
              </div>
              <Badge tone={i.state === 'Live' || i.state === 'Connected' ? 'success' : i.state === 'Simulated' || i.state === 'Dummy API' ? 'warning' : 'neutral'}>{i.state}</Badge>
            </li>
          ))}
        </ul>
      </Card>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset demo data?"
        footer={
          <>
            <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => { resetDemoData?.(); setConfirmReset(false); toast({ kind: 'success', title: 'Demo data reset' }); }}>Reset</Button>
          </>
        }
      >
        <p className="text-xs text-slate-700">All decisions and audit events recorded in this browser session will be removed and the four demo bids restored.</p>
      </Modal>
    </div>
  );
};

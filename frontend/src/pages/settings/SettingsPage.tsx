import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useApp } from '../../state/appContext';
import { Badge } from '../../components/ui/Badge';
import { Button, Card, DetailList, Modal, PageHeader } from '../../components/ui/primitives';
import { useToast } from '../../components/ui/toast';

const INTEGRATIONS = [
  { name: 'CSAP AI', note: 'Reads every bid document (PDF or image), extracts its fields, checks them against the tender, writes cited explanations and answers the assistant.', state: 'Integrated' },
  { name: 'GeM portal (simulated)', note: 'Bids submitted on GeM arrive in CSAP automatically with their documents and are verified straight away; evaluation outcomes and bidder re-evaluation requests flow both ways.', state: 'Connected' },
  { name: 'Government Gateway', note: 'PAN, GSTN (incl. GSTR-3B filing), Udyam, MCA21, EPFO, ESIC, Startup India, NSIC, debarment lists and DigiLocker. Each registry answers from its own dataset; real APIs plug in behind the same adapters.', state: 'Simulated' },
  { name: 'Live GSTIN provider (gstinapi.in)', note: 'Real GST registration and GSTR-3B filing data for real GSTINs. Answers are cached so repeat checks use no credits.', state: 'Live' },
  { name: 'Bank / treasury (EMD)', note: 'EMD amounts compared with the submitted instrument; no bank confirmation.', state: 'Simulated' },
  { name: 'Digital signature (DSC)', note: 'Decisions are recorded against the signed-in officer, not digitally signed.', state: 'Not connected' },
];

export const SettingsPage: React.FC = () => {
  const { currentUser, source, logout, resetDemoData } = useApp();
  const navigate = useNavigate();
  const toast = useToast();
  const [confirmReset, setConfirmReset] = useState(false);

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

      <Card title="Integrations" subtitle="What CSAP connects to" padded={false}>
        <ul className="divide-y divide-slate-100">
          {INTEGRATIONS.map((i) => (
            <li key={i.name} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-medium text-slate-900">{i.name}</p>
                <p className="text-xs text-slate-500">{i.note}</p>
              </div>
              <Badge tone={i.state === 'Integrated' || i.state === 'Live' || i.state === 'Connected' ? 'success' : i.state === 'Simulated' ? 'warning' : 'neutral'}>{i.state}</Badge>
            </li>
          ))}
        </ul>
      </Card>

      {source !== 'api' && (
        <Card title="Demo data">
          <Button size="sm" variant="danger" onClick={() => setConfirmReset(true)}>Reset demo data</Button>
        </Card>
      )}

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

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useApp } from '../../state/appContext';
import { Badge } from '../../components/ui/Badge';
import { Button, Card, DetailList, Modal, PageHeader } from '../../components/ui/primitives';
import { useToast } from '../../components/ui/toast';

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

      <Card title="Integration">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs text-slate-700">
            <span className="font-medium text-slate-900">CSAP AI.</span> Reads every bid document, checks it against the tender, explains its findings and answers the assistant. The officer makes every decision.
          </p>
          <Badge tone="success">Integrated</Badge>
        </div>
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

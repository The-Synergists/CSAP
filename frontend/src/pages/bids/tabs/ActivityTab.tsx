import React from 'react';
import { Link } from 'react-router-dom';
import { ActivityTimeline } from '../../../components/ActivityTimeline';
import { Card } from '../../../components/ui/primitives';
import { buttonClass } from '../../../components/ui/styles';
import type { TabProps } from '../bidTabs';

export const ActivityTab: React.FC<TabProps> = ({ view }) => (
  <Card
    title="Activity"
    subtitle="Submission, verification and officer actions for this bid"
    actions={
      <Link to={`/audit?bidId=${view.bid.id}`} className={buttonClass('ghost', 'sm')}>
        Open in audit trail
      </Link>
    }
  >
    <ActivityTimeline events={view.audit} />
  </Card>
);

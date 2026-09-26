import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';
import { Button, EmptyState } from '../../components/ui/primitives';

/** Shown for unknown routes and for tender / bid / bidder IDs that do not exist. */
export const NotFoundPage: React.FC<{ what?: 'page' | 'tender' | 'bid' | 'bidder'; id?: string }> = ({ what = 'page', id }) => {
  const navigate = useNavigate();
  const target = { page: 'page', tender: 'tender', bid: 'bid', bidder: 'bidder' }[what];
  const back = { page: '/dashboard', tender: '/tenders', bid: '/bidders', bidder: '/bidders' }[what];
  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <EmptyState
        icon={<FileQuestion className="h-8 w-8" />}
        title={id ? `No ${target} found with ID ${id}` : `This ${target} does not exist`}
        description="The link may be out of date, or the record is not part of this dataset."
        action={
          <div className="flex gap-2">
            <Button onClick={() => navigate(-1)}>Go back</Button>
            <Button variant="primary" onClick={() => navigate(back)}>
              {what === 'page' ? 'Go to dashboard' : what === 'tender' ? 'View all tenders' : 'View all bidders'}
            </Button>
          </div>
        }
      />
    </div>
  );
};

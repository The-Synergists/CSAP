import React from 'react';
import { Shield } from 'lucide-react';

/** CSAP wordmark — as in the original CSAP portal design. */
export const BrandMark: React.FC = () => (
  <div className="flex items-center gap-3">
    <div className="flex h-9 w-9 items-center justify-center rounded bg-blue-600 text-white shadow-xs">
      <Shield aria-hidden className="h-5 w-5 text-white" />
    </div>
    <div className="flex flex-col">
      <span className="text-base font-bold uppercase tracking-wider text-white">CSAP</span>
      <span className="text-[10px] font-medium tracking-wide text-slate-400">CPCL Procurement Portal</span>
    </div>
  </div>
);

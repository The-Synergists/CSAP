import React from 'react';
import { Link } from 'react-router-dom';

/** An identifier (PAN, GSTIN, Udyam no., …) that opens its government registry with that number found and checked. */
export const RegistryLink: React.FC<{ registry: string; id: string; className?: string }> = ({ registry, id, className = '' }) => (
  <Link
    to={`/gateway/${registry.toLowerCase()}?q=${encodeURIComponent(id)}`}
    onClick={(e) => e.stopPropagation()}
    title={`Open ${id} in the ${registry.replace('_', ' ')} registry`}
    className={`font-mono text-blue-700 underline decoration-blue-200 underline-offset-2 hover:decoration-blue-700 ${className}`}
  >
    {id}
  </Link>
);

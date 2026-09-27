import React from 'react';

/** Shows a stored document: images inline, PDFs in the browser's PDF viewer. */
export const DocPreview: React.FC<{ url: string; mimeType?: string; title: string; className?: string }> = ({ url, mimeType, title, className = '' }) =>
  mimeType === 'application/pdf' || /\.pdf(\?|$)/i.test(url.split('?')[0] ?? '') ? (
    <iframe src={url} title={title} className={`h-[480px] w-full rounded border-0 bg-white ${className}`} />
  ) : (
    <img src={url} alt={title} className={`w-full rounded bg-white ${className}`} />
  );

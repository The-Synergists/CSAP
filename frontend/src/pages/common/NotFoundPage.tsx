import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FileQuestion, ArrowLeft } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center text-center py-24">
      <div className="w-14 h-14 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center mb-4">
        <FileQuestion className="w-7 h-7 text-slate-400" />
      </div>
      <h1 className="text-lg font-bold text-slate-900">Page not found</h1>
      <p className="text-xs text-slate-500 mt-1.5 max-w-sm">
        The tender, bid, or page you're looking for doesn't exist, or the link may be out of date.
      </p>
      <div className="flex items-center gap-2 mt-5">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Go Back</span>
        </button>
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold transition-colors"
        >
          Return to Dashboard
        </button>
      </div>
    </div>
  );
};

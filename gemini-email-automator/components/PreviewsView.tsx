import React, { useState } from 'react';
import { type EmailPreview } from '../types';

interface PreviewsViewProps {
  previews: EmailPreview[];
  onBack: () => void;
}

export const PreviewsView: React.FC<PreviewsViewProps> = ({ previews, onBack }) => {
  const [openPreviews, setOpenPreviews] = useState<Set<number>>(new Set());

  const togglePreview = (index: number) => {
    setOpenPreviews(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  return (
    <div className="p-6 bg-white/40 dark:bg-slate-800/40 backdrop-blur-md h-full overflow-y-auto rounded-lg shadow-lg border border-slate-200 dark:border-slate-700">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
          Generated Email Previews ({previews.length})
        </h1>
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg shadow-md hover:bg-slate-700 transition-colors"
        >
          <span className="material-symbols-outlined">arrow_back</span>
          Back to Dashboard
        </button>
      </div>

      <div className="space-y-4">
        {previews.map((preview, index) => (
          <div key={index} className="bg-white dark:bg-slate-800/80 rounded-lg shadow-md border border-slate-200 dark:border-slate-700 overflow-hidden">
            <button
              onClick={() => togglePreview(index)}
              className="w-full p-4 text-left flex justify-between items-center hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
            >
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  To: <span className="font-medium text-slate-700 dark:text-slate-200">{preview.prospect_name} ({preview.email})</span>
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Subject: <span className="font-medium text-slate-700 dark:text-slate-200">{preview.subject}</span>
                </p>
              </div>
              <span className={`material-symbols-outlined transition-transform ${openPreviews.has(index) ? 'rotate-180' : ''}`}>
                expand_more
              </span>
            </button>
            {openPreviews.has(index) && (
              <div className="p-6 border-t border-slate-200 dark:border-slate-600">
                <div 
                  className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{ __html: preview.body.replace(/\n/g, '<br />') }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default PreviewsView;
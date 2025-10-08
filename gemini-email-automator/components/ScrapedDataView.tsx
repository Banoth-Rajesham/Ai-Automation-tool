import React from 'react';
import { type ScrapedItem } from '../types';
import { unparse } from 'papaparse';

const getPhoneNumbers = (item: ScrapedItem) =>
  item.phone_numbers && item.phone_numbers.length > 0 ? item.phone_numbers.join(' / ') : 'N/A';

const getEmails = (item: ScrapedItem) => {
  const allEmails = [item.work_email, ...(item.personal_emails || [])].filter(Boolean);
  return allEmails.length > 0 ? allEmails.join(' / ') : 'N/A';
};

interface ScrapedDataViewProps {
  scrapedData: ScrapedItem[];
  onClearAll: () => void;
  onMoveToProspects: (item: ScrapedItem) => void;
  onMoveAllToProspects: () => void;
}

const downloadCsv = (data: any[], filename: string) => {
  const csv = unparse(data);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  
  // Append, click, and remove the link safely
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    // Ensure the object URL is revoked and the element is removed
    // even if the click fails for some reason.
    URL.revokeObjectURL(url);
    document.body.removeChild(link);
  }
};

export const ScrapedDataView: React.FC<ScrapedDataViewProps> = ({ scrapedData, onClearAll, onMoveToProspects, onMoveAllToProspects }) => {
  const handleDownload = () => {
    if (scrapedData.length === 0) {
      alert("No data to download.");
      return;
    }

    const dataForCsv = scrapedData.map(item => ({
      company: item.company,
      full_name: item.full_name,
      role: item.role,
      work_email: item.work_email,
      personal_emails: (item.personal_emails || []).join(', '),
      phone: getPhoneNumbers(item),
      address: item.source_details,
      original_query: item.query,
    }));

    const filename = `scraped_data_${new Date().toISOString().split('T')[0]}.csv`;
    downloadCsv(dataForCsv, filename);
  };

  return (
    <div className="p-6 bg-white/40 dark:bg-slate-800/40 backdrop-blur-md h-full overflow-y-auto rounded-lg shadow-lg border border-slate-200 dark:border-slate-700">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
          Scraped Data ({scrapedData.length})
        </h1>
        <div className="flex gap-2">
          <button
            onClick={onMoveAllToProspects}
            disabled={scrapedData.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg shadow-md hover:bg-green-700 transition-colors disabled:bg-slate-400 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined">move_up</span>
            Move All to Prospects
          </button>
          <button
            onClick={onClearAll}
            disabled={scrapedData.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg shadow-md hover:bg-red-700 transition-colors disabled:bg-slate-400 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined">delete_sweep</span>
            Clear All
          </button>
          <button
            onClick={handleDownload}
            disabled={scrapedData.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 transition-colors disabled:bg-slate-400 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined">download</span>
            Download CSV
          </button>
        </div>
      </div>
      <div className="flex-grow overflow-y-auto">
        {/* --- Desktop Table View --- */}
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 hidden md:table">
          <thead className="bg-slate-50 dark:bg-slate-700 sticky top-0">
            <tr>
              <th scope="col" className="py-3.5 px-4 text-left text-sm font-semibold text-slate-900 dark:text-slate-200">Name</th>
              <th scope="col" className="py-3.5 px-4 text-left text-sm font-semibold text-slate-900 dark:text-slate-200">Role</th>
              <th scope="col" className="py-3.5 px-4 text-left text-sm font-semibold text-slate-900 dark:text-slate-200">Email</th>
              <th scope="col" className="py-3.5 px-4 text-left text-sm font-semibold text-slate-900 dark:text-slate-200">Phone</th>
              <th scope="col" className="py-3.5 px-4 text-left text-sm font-semibold text-slate-900 dark:text-slate-200">Source Details</th>
              <th scope="col" className="relative py-3.5 px-4">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
            {scrapedData.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                <td className="py-4 px-4 text-sm font-medium text-slate-900 dark:text-slate-200">{item.full_name || 'N/A'}</td>
                <td className="py-4 px-4 text-sm text-slate-500 dark:text-slate-400">{item.role || 'N/A'}</td>
                <td className="py-4 px-4 text-sm text-slate-500 dark:text-slate-400">{getEmails(item)}</td>
                <td className="py-4 px-4 text-sm text-slate-500 dark:text-slate-400">{getPhoneNumbers(item)}</td>
                <td className="py-4 px-4 text-sm text-slate-500 dark:text-slate-400" title={item.query}>{item.source_details || 'N/A'}</td>
                <td className="relative whitespace-nowrap py-4 px-4 text-right text-sm font-medium">
                  <button onClick={() => onMoveToProspects(item)} className="text-blue-600 hover:text-blue-800">Move</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* --- Mobile Card View --- */}
        <div className="grid grid-cols-1 gap-4 md:hidden">
          {scrapedData.map((item) => (
            <div key={item.id} className="p-4 rounded-lg border bg-white/80 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{item.full_name}</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{item.role || 'N/A'} at {item.company || 'N/A'}</p>
                </div>
                <button onClick={() => onMoveToProspects(item)} className="ml-4 px-3 py-1 text-xs font-semibold text-white bg-blue-600 rounded-full hover:bg-blue-700 transition-colors">Move</button>
              </div>
              <div className="mt-4 border-t border-slate-200 dark:border-slate-700 pt-3 space-y-2 text-sm">
                <p><strong className="font-semibold text-slate-600 dark:text-slate-300">Email:</strong> <span className="text-slate-500 dark:text-slate-400 break-all">{getEmails(item)}</span></p>
                <p><strong className="font-semibold text-slate-600 dark:text-slate-300">Phone:</strong> <span className="text-slate-500 dark:text-slate-400">{getPhoneNumbers(item)}</span></p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
import React from 'react';
import { type Prospect } from '../types';
import { unparse } from 'papaparse';

const downloadCsv = (data: any[], filename: string) => {
  const csv = unparse(data);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    URL.revokeObjectURL(url);
    document.body.removeChild(link);
  }
};

interface ProspectsViewProps {
  prospects: Prospect[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onDeleteProspect: (id: string) => void;
}

export const ProspectsView: React.FC<ProspectsViewProps> = ({ prospects, selectedIds, onSelectionChange, onDeleteProspect }) => {
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      onSelectionChange(new Set(prospects.map(p => p.id)));
    } else {
      onSelectionChange(new Set());
    }
  };

  const handleSelectOne = (id: string) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    onSelectionChange(newSelection);
  };

  const handleDownload = () => {
    if (prospects.length === 0) {
      alert("No prospect data to download.");
      return;
    }

    const dataForCsv = prospects.map(p => ({
      full_name: p.full_name,
      work_email: p.work_email,
      company: p.company,
      role: p.role,
      country: p.country,
      source: p.source,
      source_details: p.source_details,
    }));

    const filename = `prospects_data_${new Date().toISOString().split('T')[0]}.csv`;
    downloadCsv(dataForCsv, filename);
  };

  return (
    <div className="p-6 bg-white/40 dark:bg-slate-800/40 backdrop-blur-md h-full overflow-y-auto rounded-lg shadow-lg border border-slate-200 dark:border-slate-700">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
          Loaded Prospects ({prospects.length})
        </h1>
        <button
          onClick={handleDownload}
          disabled={prospects.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 transition-colors disabled:bg-slate-400 disabled:cursor-not-allowed"
        >
          <span className="material-symbols-outlined">download</span>
          Download CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
          <thead className="bg-slate-50 dark:bg-slate-700">
            <tr>
              <th scope="col" className="p-4"><input type="checkbox" onChange={handleSelectAll} checked={selectedIds.size === prospects.length && prospects.length > 0} /></th>
              <th scope="col" className="py-3.5 px-4 text-left text-sm font-semibold text-slate-900 dark:text-slate-200">Name</th>
              <th scope="col" className="py-3.5 px-4 text-left text-sm font-semibold text-slate-900 dark:text-slate-200">Email</th>
              <th scope="col" className="py-3.5 px-4 text-left text-sm font-semibold text-slate-900 dark:text-slate-200">Company</th>
              <th scope="col" className="py-3.5 px-4 text-left text-sm font-semibold text-slate-900 dark:text-slate-200">Role</th>
              <th scope="col" className="relative py-3.5 px-4"><span className="sr-only">Delete</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
            {prospects.map((prospect) => (
              <tr key={prospect.id} className={selectedIds.has(prospect.id) ? 'bg-blue-50 dark:bg-blue-900/50' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'}>
                <td className="p-4"><input type="checkbox" checked={selectedIds.has(prospect.id)} onChange={() => handleSelectOne(prospect.id)} /></td>
                <td className="py-4 px-4 text-sm font-medium text-slate-900 dark:text-slate-200">{prospect.full_name}</td>
                <td className="py-4 px-4 text-sm text-slate-500 dark:text-slate-400">{prospect.work_email || 'N/A'}</td>
                <td className="py-4 px-4 text-sm text-slate-500 dark:text-slate-400">{prospect.company || 'N/A'}</td>
                <td className="py-4 px-4 text-sm text-slate-500 dark:text-slate-400">{prospect.role || 'N/A'}</td>
                <td className="py-4 px-4 text-right text-sm"><button onClick={() => onDeleteProspect(prospect.id)} className="text-red-600 hover:text-red-800">Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ProspectsView;
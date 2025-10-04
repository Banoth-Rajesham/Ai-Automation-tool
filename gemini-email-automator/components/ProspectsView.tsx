import React from 'react';
import { type Prospect } from '../types';

interface ProspectsViewProps {
  prospects: Prospect[];
  selectedIds: Set<string>;
  onSelectionChange: (newSelectedIds: Set<string>) => void;
  onDeleteProspect: (prospectId: string) => void;
}

export const ProspectsView: React.FC<ProspectsViewProps> = ({
  prospects,
  selectedIds,
  onSelectionChange,
  onDeleteProspect,
}) => {
  const handleSelectAll = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      const allIds = new Set(prospects.map(p => p.id));
      onSelectionChange(allIds);
    } else {
      onSelectionChange(new Set());
    }
  };

  const handleSelectOne = (id: string) => {
    const newSelectedIds = new Set(selectedIds);
    if (newSelectedIds.has(id)) {
      newSelectedIds.delete(id);
    } else {
      newSelectedIds.add(id);
    }
    onSelectionChange(newSelectedIds);
  };

  const getPhoneNumber = (prospect: Prospect) => {
    const phoneWebsite = prospect.websites?.find(w => w.type === 'phone');
    return phoneWebsite ? phoneWebsite.url : 'N/A';
  };

  const isAllSelected = prospects.length > 0 && selectedIds.size === prospects.length;

  return (
    <div className="p-6 bg-white/40 dark:bg-slate-800/40 backdrop-blur-md h-full overflow-y-auto rounded-lg shadow-lg border border-slate-200 dark:border-slate-700">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-4">
        Loaded Prospects ({prospects.length})
      </h1>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
          <thead className="bg-slate-50 dark:bg-slate-700">
            <tr>
              <th scope="col" className="p-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
                    checked={isAllSelected}
                    onChange={handleSelectAll}
                  />
                </div>
              </th>
              <th scope="col" className="py-3.5 px-4 text-left text-sm font-semibold text-slate-900 dark:text-slate-200">
                Name
              </th>
              <th scope="col" className="py-3.5 px-4 text-left text-sm font-semibold text-slate-900 dark:text-slate-200">
                Email
              </th>
              <th scope="col" className="py-3.5 px-4 text-left text-sm font-semibold text-slate-900 dark:text-slate-200">
                Personal Emails
              </th>
              <th scope="col" className="py-3.5 px-4 text-left text-sm font-semibold text-slate-900 dark:text-slate-200">
                Phone
              </th>
              <th scope="col" className="py-3.5 px-4 text-left text-sm font-semibold text-slate-900 dark:text-slate-200">
                Company
              </th>
              <th scope="col" className="py-3.5 px-4 text-left text-sm font-semibold text-slate-900 dark:text-slate-200">
                Source
              </th>
              <th scope="col" className="relative py-3.5 px-4">
                <span className="sr-only">Actions</span>
              </th>
              <th scope="col" className="py-3.5 px-4 text-left text-sm font-semibold text-slate-900 dark:text-slate-200">
                Source Details
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
            {prospects.map((prospect) => (
              <tr key={prospect.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                <td className="p-4">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
                      checked={selectedIds.has(prospect.id)}
                      onChange={() => handleSelectOne(prospect.id)}
                    />
                  </div>
                </td>
                <td className="whitespace-nowrap py-4 px-4 text-sm font-medium text-slate-900 dark:text-slate-200">{prospect.full_name}</td>
                <td className="whitespace-nowrap py-4 px-4 text-sm text-slate-500 dark:text-slate-400">{prospect.work_email}</td>
                <td className="whitespace-nowrap py-4 px-4 text-sm text-slate-500 dark:text-slate-400">{(prospect.personal_emails || []).join(', ')}</td>
                <td className="whitespace-nowrap py-4 px-4 text-sm text-slate-500 dark:text-slate-400"><a href={`tel:${getPhoneNumber(prospect)}`} className="hover:underline">{getPhoneNumber(prospect)}</a></td>
                <td className="whitespace-nowrap py-4 px-4 text-sm text-slate-500 dark:text-slate-400">{prospect.company}</td>
                <td className="whitespace-nowrap py-4 px-4 text-sm text-slate-500 dark:text-slate-400">{prospect.source}</td>
                <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                  <button
                    onClick={() => onDeleteProspect(prospect.id)}
                    className="text-red-600 hover:text-red-800 dark:text-red-500 dark:hover:text-red-400"
                    aria-label={`Delete ${prospect.full_name}`}
                  >
                    Delete
                  </button>
                </td>
                <td className="whitespace-nowrap py-4 px-4 text-sm text-slate-500 dark:text-slate-400">{prospect.source_details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
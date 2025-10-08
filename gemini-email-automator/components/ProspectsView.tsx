import React, { useState } from 'react';
import { type Prospect } from '../types'; // Assuming this is the correct path
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

const getPhoneNumbers = (prospect: Prospect) => {
  return prospect.phone_numbers && prospect.phone_numbers.length > 0 ? prospect.phone_numbers.join(' / ') : 'N/A';
};

interface ProspectsViewProps {
  prospects: Prospect[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onAddTestProspect: (prospect: Partial<Prospect>) => Promise<void>;
  hasProspects: boolean;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onDeleteProspect: (id: string) => void;
  onReturnToScraped: (prospect: Prospect) => void;
}

export const ProspectsView: React.FC<ProspectsViewProps> = ({
  prospects,
  selectedIds,
  onSelectionChange,
  onDeleteProspect,
  onReturnToScraped,
  onAddTestProspect,
  hasProspects,
  showToast,
}) => {
  const [newProspect, setNewProspect] = useState<Partial<Prospect>>({
    full_name: '',
    work_email: '',
    company: '',
    role: '',
    phone_numbers: [],
  });
  const [isAddingTest, setIsAddingTest] = useState(false);
  const [isAddFormVisible, setIsAddFormVisible] = useState(false);
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

  const handleNewProspectChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setNewProspect(prev => ({ ...prev, [name]: value }));
  };

  const handleAddTestClick = async () => {
    if (!newProspect.work_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newProspect.work_email)) {
      showToast("Please enter a valid email address.", "error");
      return;
    }
    if (!newProspect.full_name) {
      showToast("Please enter a name.", "error");
      return;
    }

    setIsAddingTest(true);
    try {
      // Pass the phone number as an array
      const prospectData = { ...newProspect, phone_numbers: newProspect.phone_numbers?.toString().split(',').map(p => p.trim()).filter(Boolean) || [] };
      await onAddTestProspect(prospectData);
      setNewProspect({ full_name: '', work_email: '', company: '', role: '', phone_numbers: [] }); // Clear form
      setIsAddFormVisible(false); // Hide form after successful submission
    } finally {
      setIsAddingTest(false);
    }
  };

  const handleDownload = () => {
    if (prospects.length === 0) {
      alert("No prospect data to download.");
      return;
    }

    const dataForCsv = prospects.map(p => ({
      full_name: p.full_name,
      work_email: p.work_email,
      personal_emails: (p.personal_emails || []).join(', '),
      phone_numbers: (p.phone_numbers || []).join(', '),
      company: p.company,
      role: p.role,
      website: (p.websites?.map(w => w.url) || []).join(', '),
      confidence_score: p.confidence_score,
      country: p.country,
      source: p.source,
      source_details: p.source_details,
      query: p.query,
    }));

    const filename = `prospects_data_${new Date().toISOString().split('T')[0]}.csv`;
    downloadCsv(dataForCsv, filename);
  };

  return (
    <div className="p-6 bg-white/40 dark:bg-slate-800/40 backdrop-blur-md h-full flex flex-col rounded-lg shadow-lg border border-slate-200 dark:border-slate-700">
      <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
          Loaded Prospects ({prospects.length})
        </h1>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsAddFormVisible(!isAddFormVisible)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg shadow-md hover:bg-green-700 transition-colors"
          >
            <span className="material-symbols-outlined">{isAddFormVisible ? 'close' : 'add'}</span>
            {isAddFormVisible ? 'Cancel' : 'Add My Details'}
          </button>
          <button
            onClick={handleDownload}
            disabled={prospects.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 transition-colors disabled:bg-slate-400 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined">download</span>
            Download CSV
          </button>
        </div>
      </div>

      {/* Add My Details Form */}
      {isAddFormVisible && (
        <div className="bg-slate-100 dark:bg-slate-700/50 p-4 rounded-lg mb-6 border border-slate-200 dark:border-slate-600">
          <h3 className="text-lg font-semibold mb-3 text-slate-800 dark:text-slate-100">Add My Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <input name="full_name" value={newProspect.full_name} onChange={handleNewProspectChange} placeholder="Full Name" className="p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input name="work_email" value={newProspect.work_email} onChange={handleNewProspectChange} placeholder="Work Email" className="p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input name="company" value={newProspect.company} onChange={handleNewProspectChange} placeholder="Company" className="p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input name="role" value={newProspect.role} onChange={handleNewProspectChange} placeholder="Role" className="p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input name="phone_numbers" value={newProspect.phone_numbers} onChange={handleNewProspectChange} placeholder="Mobile Number" className="p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="mt-3 text-right">
            <button
              onClick={handleAddTestClick}
              disabled={!newProspect.work_email || !newProspect.full_name || isAddingTest}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 transition-colors disabled:bg-slate-400 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined">person_add</span>
              {isAddingTest ? 'Adding...' : 'Add to List'}
            </button>
          </div>
        </div>
      )}

      <div className="flex-grow overflow-y-auto">
        {/* --- Desktop Table View --- */}
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 hidden md:table">
          <thead className="bg-slate-50 dark:bg-slate-700">
            <tr>
              <th scope="col" className="p-4"><input type="checkbox" onChange={handleSelectAll} checked={selectedIds.size === prospects.length && prospects.length > 0} /></th>
              <th scope="col" className="py-3.5 px-4 text-left text-sm font-semibold text-slate-900 dark:text-slate-200">Name</th>
              <th scope="col" className="py-3.5 px-4 text-left text-sm font-semibold text-slate-900 dark:text-slate-200">Email</th>
              <th scope="col" className="py-3.5 px-4 text-left text-sm font-semibold text-slate-900 dark:text-slate-200">Company</th>
              <th scope="col" className="py-3.5 px-4 text-left text-sm font-semibold text-slate-900 dark:text-slate-200">Role</th>
              <th scope="col" className="relative py-3.5 px-4 text-left text-sm font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
            {prospects.map((prospect) => (
              <tr key={prospect.id} className={`transition-colors ${selectedIds.has(prospect.id) ? 'bg-blue-50 dark:bg-blue-900/50' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}>
                <td className="p-4"><input type="checkbox" checked={selectedIds.has(prospect.id)} onChange={() => handleSelectOne(prospect.id)} /></td>
                <td className="py-4 px-4 text-sm font-medium text-slate-900 dark:text-slate-200">{prospect.full_name}</td>
                <td className="py-4 px-4 text-sm text-slate-500 dark:text-slate-400"><a href={`mailto:${prospect.work_email}`} className="hover:text-blue-500">{prospect.work_email || 'N/A'}</a></td>
                <td className="py-4 px-4 text-sm text-slate-500 dark:text-slate-400">{prospect.company || 'N/A'}</td>
                <td className="py-4 px-4 text-sm text-slate-500 dark:text-slate-400">{prospect.role || 'N/A'}</td>
                <td className="py-4 px-4 text-right text-sm font-medium space-x-2 whitespace-nowrap">
                  <button onClick={() => onReturnToScraped(prospect)} className="text-amber-600 hover:text-amber-800">Return</button>
                  <button onClick={() => onDeleteProspect(prospect.id)} className="text-red-600 hover:text-red-800">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* --- Mobile Card View --- */}
        <div className="grid grid-cols-1 gap-4 md:hidden">
          {prospects.map((prospect) => (
            <div key={prospect.id} className={`p-4 rounded-lg border transition-colors ${selectedIds.has(prospect.id) ? 'bg-blue-50 dark:bg-blue-900/50 border-blue-300 dark:border-blue-700' : 'bg-white/80 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700'}`}>
              <div className="flex items-start justify-between">
                <div className="flex-grow">
                  <div className="flex items-center mb-2">
                    <input type="checkbox" checked={selectedIds.has(prospect.id)} onChange={() => handleSelectOne(prospect.id)} className="h-5 w-5 mr-4" />
                    <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{prospect.full_name}</p>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{prospect.role || 'N/A'} at {prospect.company || 'N/A'}</p>
                </div>
                <div className="flex flex-col items-end space-y-2 ml-2">
                  <button onClick={() => onDeleteProspect(prospect.id)} className="text-red-500 hover:text-red-700"><span className="material-symbols-outlined">delete</span></button>
                  <button onClick={() => onReturnToScraped(prospect)} className="text-amber-500 hover:text-amber-700"><span className="material-symbols-outlined">undo</span></button>
                </div>
              </div>
              <div className="mt-4 border-t border-slate-200 dark:border-slate-700 pt-3 space-y-2 text-sm">
                <p><strong className="font-semibold text-slate-600 dark:text-slate-300">Email:</strong> <a href={`mailto:${prospect.work_email}`} className="text-blue-500 hover:underline">{prospect.work_email || 'N/A'}</a></p>
                <p><strong className="font-semibold text-slate-600 dark:text-slate-300">Phone:</strong> <span className="text-slate-500 dark:text-slate-400">{getPhoneNumbers(prospect)}</span></p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ProspectsView;
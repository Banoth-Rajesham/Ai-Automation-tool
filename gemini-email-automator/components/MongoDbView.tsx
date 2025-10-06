import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { type ScrapedItem } from '../types';

const getPhoneNumbers = (item: ScrapedItem) =>
  item.phone_numbers && item.phone_numbers.length > 0 ? item.phone_numbers.join(' / ') : 'N/A';

export const MongoDbView: React.FC = () => {
  const [leads, setLeads] = useState<ScrapedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLeads = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await axios.get('http://localhost:3001/api/leads');
        setLeads(response.data);
      } catch (err) {
        setError('Failed to fetch leads from the database. Is the server running?');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLeads();
  }, []);

  if (isLoading) {
    return <div className="p-6 text-center">Loading saved leads...</div>;
  }

  if (error) {
    return <div className="p-6 text-center text-red-500">{error}</div>;
  }

  return (
    <div className="p-6 bg-white/40 dark:bg-slate-800/40 backdrop-blur-md h-full overflow-y-auto rounded-lg shadow-lg border border-slate-200 dark:border-slate-700">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-4">
        Saved Leads from Database ({leads.length})
      </h1>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
          <thead className="bg-slate-50 dark:bg-slate-700">
            <tr>
              <th scope="col" className="py-3.5 px-4 text-left text-sm font-semibold text-slate-900 dark:text-slate-200">Name</th>
              <th scope="col" className="py-3.5 px-4 text-left text-sm font-semibold text-slate-900 dark:text-slate-200">Role</th>
              <th scope="col" className="py-3.5 px-4 text-left text-sm font-semibold text-slate-900 dark:text-slate-200">Company</th>
              <th scope="col" className="py-3.5 px-4 text-left text-sm font-semibold text-slate-900 dark:text-slate-200">Email</th>
              <th scope="col" className="py-3.5 px-4 text-left text-sm font-semibold text-slate-900 dark:text-slate-200">Phone</th>
              <th scope="col" className="py-3.5 px-4 text-left text-sm font-semibold text-slate-900 dark:text-slate-200">Confidence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
            {leads.map((item) => (
              <tr key={item.id || item._id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                <td className="py-4 px-4 text-sm font-medium text-slate-900 dark:text-slate-200">{item.full_name || 'N/A'}</td>
                <td className="py-4 px-4 text-sm text-slate-500 dark:text-slate-400">{item.role || 'N/A'}</td>
                <td className="py-4 px-4 text-sm text-slate-500 dark:text-slate-400">{item.company || 'N/A'}</td>
                <td className="py-4 px-4 text-sm text-slate-500 dark:text-slate-400">{item.work_email || 'N/A'}</td>
                <td className="py-4 px-4 text-sm text-slate-500 dark:text-slate-400">{getPhoneNumbers(item)}</td>
                <td className="py-4 px-4 text-sm text-slate-500 dark:text-slate-400">{item.confidence_score || 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
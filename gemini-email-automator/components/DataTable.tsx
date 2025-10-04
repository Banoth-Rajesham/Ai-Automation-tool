
import React from 'react';

interface DataTableProps {
  data: Record<string, any>[];
}

const formatHeader = (key: string): string => {
  return key.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
};

export const DataTable: React.FC<DataTableProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return null;
  }

  const headers = Object.keys(data[0]);

  return (
    <div className="mt-2 w-full max-w-none bg-white/40 dark:bg-slate-800/40 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-x-auto">
      <table className="w-full text-sm text-left text-slate-600 dark:text-slate-300">
        <thead className="text-xs text-slate-700 dark:text-slate-300 uppercase bg-slate-50 dark:bg-slate-700/50">
          <tr>
            {headers.map(header => (
              <th key={header} scope="col" className="px-6 py-3">
                {formatHeader(header)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-slate-200 dark:border-slate-700 last:border-b-0 hover:bg-slate-50/50 dark:hover:bg-slate-700/30">
              {headers.map(header => (
                <td key={`${rowIndex}-${header}`} className="px-6 py-4">
                  <span className="line-clamp-2">{String(row[header])}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

import React from 'react';
import './DataSourceToggle.css';

type DataSource = 'contactout' | 'webscraping';

interface DataSourceToggleProps {
  dataSource: DataSource;
  setDataSource: (source: DataSource) => void;
}

export const DataSourceToggle: React.FC<DataSourceToggleProps> = ({ dataSource, setDataSource }) => {
  const isWebScraping = dataSource === 'webscraping';

  const toggleDataSource = () => {
    setDataSource(isWebScraping ? 'contactout' : 'webscraping');
  };

  return (
    <div className="p-2 bg-slate-100 dark:bg-slate-700/50 rounded-lg flex flex-col items-center">
      <label htmlFor="dataSourceCheckbox" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
        Data Source
      </label>
      <div className="dataSourceContainer">
        <input 
          type="checkbox" 
          name="checkbox" 
          id="dataSourceCheckbox" 
          checked={isWebScraping}
          onChange={toggleDataSource}
        />
        <label htmlFor="dataSourceCheckbox" className="dataSourceLabel"></label>
        <div className="flex justify-between w-full text-xs px-1 mt-1">
            <span className={`dataSourceText ${!isWebScraping ? 'active' : 'text-slate-500 dark:text-slate-400'}`} onClick={() => setDataSource('contactout')}>ContactOut</span>
            <span className={`dataSourceText ${isWebScraping ? 'active' : 'text-slate-500 dark:text-slate-400'}`} onClick={() => setDataSource('webscraping')}>Web Scraping</span>
        </div>
      </div>
    </div>
  );
};
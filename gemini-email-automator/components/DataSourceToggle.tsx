import React from 'react';
import { type DataSource } from '../types';
import './DataSourceToggle.css';

interface DataSourceToggleProps {
  dataSource: DataSource;
  setDataSource: (source: DataSource) => void;
}

export const DataSourceToggle: React.FC<DataSourceToggleProps> = ({ dataSource, setDataSource }) => {
  const isWebScraping = dataSource === 'webscraping';

  const handleToggle = () => {
    setDataSource(isWebScraping ? 'contactout' : 'webscraping');
  };

  return (
    <div className="dataSourceContainer">
      <input
        type="checkbox"
        id="dataSourceCheckbox"
        checked={isWebScraping}
        onChange={handleToggle}
      />
      <label htmlFor="dataSourceCheckbox" className="dataSourceLabel">
      </label>
      <div className="flex justify-between mt-2 text-xs w-full px-2">
        <span className={`dataSourceText ${!isWebScraping ? 'active' : 'text-slate-500'}`}>
          ContactOut
        </span>
        <span className={`dataSourceText ${isWebScraping ? 'active' : 'text-slate-500'}`}>
          Web Scraper
        </span>
      </div>
    </div>
  );
};

import React from 'react';
import { type ViewType, type DataSource } from '../types';
import { DataSourceToggle } from './DataSourceToggle';

interface NavItemProps {
  icon: string;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ icon, label, active, onClick }) => {
  const activeClasses = active
    ? 'bg-blue-600 text-white font-semibold shadow-md'
    : 'text-slate-500 dark:text-slate-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 hover:text-blue-600 dark:hover:text-blue-400';
  
  return (
    <button onClick={onClick} disabled={active} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 text-left disabled:opacity-100 ${activeClasses}`}>
      <span className={`material-symbols-outlined ${active ? 'filled' : ''}`}>{icon}</span>
      <span>{label}</span>
    </button>
  );
};

export const Sidebar: React.FC<{ 
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  dataSource: DataSource;
  setDataSource: (source: DataSource) => void;
}> = ({ currentView, onNavigate, dataSource, setDataSource }) => {
  return (
    <aside className="w-64 flex-shrink-0 p-4 hidden md:flex flex-col">
      <div className="flex-1 flex flex-col gap-y-4 bg-white/40 dark:bg-slate-800/40 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm">
        <div className="flex-shrink-0 flex items-center gap-3 mb-4 text-slate-800 dark:text-slate-100">
          <div className="bg-blue-600 text-white p-2 rounded-full flex items-center justify-center">
            <span className="material-symbols-outlined">mail</span>
          </div>
          <span className="text-lg font-bold">Email Automator</span>
        </div>
        
        {/* This container allows the navigation to scroll independently */}
        <div className="flex-1 min-h-0 overflow-y-auto -mr-2 pr-2">
            <nav className="flex flex-col gap-2">
                <NavItem icon="dashboard" label="Dashboard" active={currentView === 'dashboard'} onClick={() => onNavigate('dashboard')} />
                <NavItem icon="hub" label="AI Web Scraper" active={currentView === 'scraper_input'} onClick={() => onNavigate('scraper_input')} />
                <NavItem icon="upload_file" label="Load Data" active={currentView === 'prospects'} onClick={() => onNavigate('prospects')} />
                <NavItem icon="travel_explore" label="Scraped Data" active={currentView === 'scraped'} onClick={() => onNavigate('scraped')} />
                <NavItem icon="preview" label="Generate Previews" active={currentView === 'previews'} onClick={() => onNavigate('previews')} />
                <NavItem icon="send" label="Send Emails" active={currentView === 'send'} onClick={() => onNavigate('send')} />
                <NavItem icon="mark_email_read" label="Check Replies" active={currentView === 'replies'} onClick={() => onNavigate('replies')} />
            </nav>
        </div>

        <div className="flex-shrink-0">
          <DataSourceToggle dataSource={dataSource} setDataSource={setDataSource} />
          <div className="bg-slate-100 dark:bg-slate-700/50 rounded-lg p-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img 
                alt="User" 
                src="https://picsum.photos/seed/user-rajesh/40/40" 
                className="w-10 h-10 rounded-full"
              />
              <div>
                <p className="font-semibold text-sm text-slate-800 dark:text-slate-100">Rajesh</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Admin</p>
              </div>
            </div>
            <button title="Logout" className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100">
              <span className="material-symbols-outlined">logout</span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};

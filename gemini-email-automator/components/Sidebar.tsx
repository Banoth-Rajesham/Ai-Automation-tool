import React from 'react';
import { type ViewType, type DataSource } from '../types';
import { DataSourceToggle } from './DataSourceToggle';

interface SidebarProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  dataSource: DataSource;
  setDataSource: (source: DataSource) => void;
}

const NavItem: React.FC<{
  view: ViewType;
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  icon: React.ReactNode;
  label: string;
}> = ({ view, currentView, onNavigate, icon, label }) => {
  const isActive = currentView === view;
  return (
    <button
      onClick={() => onNavigate(view)}
      className={`flex items-center w-full p-3 my-1 rounded-lg transition-colors duration-200 ${
        isActive
          ? 'bg-blue-600 text-white shadow-lg'
          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
      }`}
    >
      {icon}
      <span className="ml-4 font-semibold">{label}</span>
    </button>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate, dataSource, setDataSource }) => {
  return (
    <aside className="w-64 flex-shrink-0 p-4 bg-slate-100/80 dark:bg-slate-800/80 backdrop-blur-sm border-r border-slate-200 dark:border-slate-700 flex flex-col">
      <div className="flex items-center mb-8">
        <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg">
          <span className="material-symbols-outlined text-white text-2xl">lan</span>
        </div>
        <h1 className="text-xl font-bold ml-3 text-slate-800 dark:text-slate-100">
          Email Automator
        </h1>
      </div>

      <nav className="flex-grow">
        <NavItem
          view="dashboard"
          currentView={currentView}
          onNavigate={onNavigate}
          icon={<span className="material-symbols-outlined">dashboard</span>}
          label="Dashboard"
        />
        <NavItem
          view="prospects"
          currentView={currentView}
          onNavigate={onNavigate}
          icon={<span className="material-symbols-outlined">upload_file</span>}
          label="Load Data"
        />
        <NavItem
          view="previews"
          currentView={currentView}
          onNavigate={onNavigate}
          icon={<span className="material-symbols-outlined">preview</span>}
          label="Generate Preview"
        />
        <NavItem
          view="scraped"
          currentView={currentView}
          onNavigate={onNavigate}
          icon={<span className="material-symbols-outlined">dataset</span>}
          label="Scraped Data"
        />
        <NavItem
          view="send"
          currentView={currentView}
          onNavigate={onNavigate}
          icon={<span className="material-symbols-outlined">send</span>}
          label="Send Emails"
        />
        <NavItem
          view="replies"
          currentView={currentView}
          onNavigate={onNavigate}
          icon={<span className="material-symbols-outlined">mark_email_read</span>}
          label="Check Replies"
        />
        <NavItem
          view="scraper_input"
          currentView={currentView}
          onNavigate={onNavigate}
          icon={<span className="material-symbols-outlined">travel_explore</span>}
          label="AI Web Scraping"
        />
      </nav>

      <div className="mt-auto">
        <DataSourceToggle dataSource={dataSource} setDataSource={setDataSource} />
        <div className="mt-6 border-t border-slate-200 dark:border-slate-700 pt-4">
          <a href="#" className="flex items-center p-2 rounded-lg transition-colors">
            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-slate-500 dark:text-slate-400">account_circle</span>
            </div>
            <div className="ml-3">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Admin</p>
            </div>
          </a>
        </div>
      </div>
    </aside>
  );
};
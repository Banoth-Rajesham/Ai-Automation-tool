
import React from 'react';
import { type CampaignMetrics, type RecentActivity } from '../types';
import { DataTable } from './DataTable';

interface MetricCardProps {
  label: string;
  value: number | string;
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value }) => (
  <div className="bg-white/40 dark:bg-slate-800/40 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm">
    <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
    <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">{value.toLocaleString()}</p>
  </div>
);

interface MetricsDashboardProps {
  overview: CampaignMetrics;
  activity: RecentActivity[];
}

export const MetricsDashboard: React.FC<MetricsDashboardProps> = ({ overview, activity }) => {
  return (
    <div className="space-y-6 mt-2">
      <div>
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-3">📊 Campaign Overview</h3>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <MetricCard label="Emails Sent" value={overview.emails_sent} />
          <MetricCard label="Replies Received" value={overview.replies_received} />
          <MetricCard label="Unsubscribed" value={overview.unsubscribed} />
          <MetricCard label="Interested Leads" value={overview.interested_leads} />
          <MetricCard label="Not Interested" value={overview.not_interested} />
        </div>
      </div>
      <div>
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-3">📝 Recent Email Activity</h3>
        <DataTable data={activity} />
      </div>
    </div>
  );
};

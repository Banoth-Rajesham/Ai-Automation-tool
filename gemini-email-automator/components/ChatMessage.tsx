
import React from 'react';
import { type ChatMessage as ChatMessageType } from '../types';
import { MetricsDashboard } from './MetricsDashboard';
import { DataTable } from './DataTable';

interface ChatMessageProps {
  message: ChatMessageType;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isAssistant = message.role === 'assistant';

  const UserAvatar = () => (
    <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
      <span className="material-symbols-outlined text-slate-500 dark:text-slate-400 text-lg">person</span>
    </div>
  );
  
  const AssistantAvatar = () => (
    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 text-white">
      <span className="material-symbols-outlined text-lg">psychology</span>
    </div>
  );

  return (
    <div className={`flex items-start gap-4 ${!isAssistant ? 'flex-row-reverse' : ''}`}>
      {isAssistant ? <AssistantAvatar /> : <UserAvatar />}
      <div className={`flex flex-col gap-2 max-w-2xl ${!isAssistant ? 'items-end' : 'items-start'}`}>
        <div className={`px-4 py-3 rounded-2xl ${isAssistant ? 'bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-tl-none' : 'bg-blue-600 text-white rounded-br-none'}`}>
          <p>{message.content}</p>
        </div>
        {message.data && (
            <div className="w-full">
                <DataTable data={message.data} />
            </div>
        )}
        {message.metrics && (
            <div className="w-full">
                <MetricsDashboard overview={message.metrics.overview} activity={message.metrics.activity} />
            </div>
        )}
      </div>
    </div>
  );
};

import React, { useState, useRef, useEffect } from 'react';
import { SendButton } from './SendButton';
import { ChatMessage } from './ChatMessage';
import { type ChatMessage as ChatMessageType } from '../types';

interface WebScraperViewProps {
  onSendMessage: (message: string) => void;
  isLoading: boolean;
  messages: ChatMessageType[];
}

export const WebScraperView: React.FC<WebScraperViewProps> = ({ onSendMessage, isLoading, messages }) => {
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    onSendMessage(input);
    setInput('');
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 bg-white/40 dark:bg-slate-800/40 backdrop-blur-md border-b border-slate-200 dark:border-slate-700 p-4">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-blue-600">hub</span>
          <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">AI Web Scraper</h1>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 ml-9">Enter a URL or query to extract contact information.</p>
      </div>

      {/* Chat/Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.map((msg, index) => (
          <ChatMessage key={index} message={msg} />
        ))}
        {isLoading && (
            <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 text-white">
                     <span className="material-symbols-outlined text-lg">psychology</span>
                </div>
                <div className="flex items-center gap-2 pt-1 text-slate-500 dark:text-slate-400">
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse"></div>
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse [animation-delay:0.2s]"></div>
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse [animation-delay:0.4s]"></div>
                </div>
            </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="px-4 pb-4">
        <form onSubmit={handleSubmit} className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter a URL or company name to scrape..."
            disabled={isLoading}
            className="w-full pl-4 pr-12 py-3 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-full focus:ring-2 focus:ring-blue-500 focus:outline-none transition-shadow"
          />
          <SendButton isLoading={isLoading} />
        </form>
      </div>
    </div>
  );
};
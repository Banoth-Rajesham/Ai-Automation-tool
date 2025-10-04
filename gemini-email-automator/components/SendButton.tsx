import React from 'react';

interface SendButtonProps {
  isLoading: boolean;
}

export const SendButton: React.FC<SendButtonProps> = ({ isLoading }) => (
  <button
    type="submit"
    className={`absolute inset-y-0 right-0 flex items-center pr-4 font-semibold text-sm ${
      isLoading ? 'text-slate-400 cursor-not-allowed' : 'text-blue-500 hover:text-blue-600'
    }`}
    disabled={isLoading}
  >
    {isLoading ? 'Sending...' : 'Send'}
  </button>
);
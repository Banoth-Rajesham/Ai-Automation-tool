import React, { useState, useEffect } from 'react';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  duration?: number; // in ms
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, type, duration = 3000, onClose }) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  if (!isVisible) return null;

  const bgColor = type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500';

  return (
    <div className={`fixed bottom-4 right-4 p-4 rounded-lg shadow-lg text-white ${bgColor} z-50`}>
      <div className="flex items-center">
        {type === 'success' && <span className="material-symbols-outlined mr-2">check_circle</span>}
        {type === 'error' && <span className="material-symbols-outlined mr-2">error</span>}
        {type === 'info' && <span className="material-symbols-outlined mr-2">info</span>}
        <span>{message}</span>
        <button onClick={() => { setIsVisible(false); onClose(); }} className="ml-4 text-white font-bold">
          &times;
        </button>
      </div>
    </div>
  );
};

export default Toast;
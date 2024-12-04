import React, { useRef, useEffect } from 'react';

const LogPanel = ({ logs }) => {
  const logEndRef = useRef(null);

  // Auto-scroll to bottom when new logs are added
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="bg-white rounded-lg shadow-lg p-4 w-64 h-96 overflow-y-auto">
      <h3 className="text-lg font-semibold mb-2">Game Log</h3>
      <div className="space-y-1">
        {logs.map((log, index) => (
          <div 
            key={index} 
            className={`text-sm p-1 rounded ${
              log.type === 'error' ? 'text-red-600 bg-red-50' :
              log.type === 'ai' ? 'text-blue-600 bg-blue-50' :
              'text-gray-600'
            }`}
          >
            {log.message}
          </div>
        ))}
        <div ref={logEndRef} />
      </div>
    </div>
  );
};

export default LogPanel;
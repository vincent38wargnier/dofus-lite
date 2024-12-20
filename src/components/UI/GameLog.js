import React, { useState, useEffect, useRef } from 'react';
import { gameLogger } from '../Player/Player';
import './GameLog.css';

const GameLog = () => {
  const [logs, setLogs] = useState([]);
  const contentRef = useRef(null);

  useEffect(() => {
    const logHandler = (message) => {
      const isTurnMarker = message.startsWith('===');
      
      setLogs(prevLogs => [...prevLogs, {
        id: Date.now(),
        message,
        isTurnMarker
      }]);
    };

    gameLogger.on('log', logHandler);

    return () => {
      gameLogger.off('log', logHandler);
    };
  }, []);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="game-log">
      <div className="game-log-header">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Battle Log</h3>
          <span className="text-xs text-gray-400">{logs.length} events</span>
        </div>
      </div>
      <div className="game-log-content" ref={contentRef}>
        {logs.map(log => (
          <div
            key={log.id}
            className={`log-entry ${log.isTurnMarker ? 'turn-marker' : ''}`}
          >
            {log.message}
          </div>
        ))}
      </div>
    </div>
  );
};

export default GameLog; 
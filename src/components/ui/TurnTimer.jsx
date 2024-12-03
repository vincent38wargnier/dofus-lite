import React from 'react';

const TurnTimer = ({ timeLeft }) => {
  const percentage = (timeLeft / 60) * 100;
  
  const getColorClass = () => {
    if (percentage > 66) return 'bg-green-500';
    if (percentage > 33) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="flex flex-col items-center bg-white p-4 rounded-lg shadow-md">
      <div className="text-lg font-bold mb-2">
        Time Left: {timeLeft}s
      </div>
      <div className="w-48 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-1000 ${getColorClass()}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

export default TurnTimer;
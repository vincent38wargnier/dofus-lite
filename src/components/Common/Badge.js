import React from 'react';
import './Badge.css';

const Badge = ({ 
  children, 
  variant = 'default',
  size = 'medium',
  rounded = false,
  icon,
  className = '' 
}) => {
  const badgeClassName = `
    badge
    badge-${variant}
    badge-${size}
    ${rounded ? 'badge-rounded' : ''}
    ${className}
  `.trim();

  return (
    <span className={badgeClassName}>
      {icon && <span className="badge-icon">{icon}</span>}
      <span className="badge-content">{children}</span>
    </span>
  );
};

export default Badge;

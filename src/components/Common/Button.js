import React from 'react';
import './Button.css';

const Button = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  size = 'medium',
  disabled = false,
  className = '',
  type = 'button'
}) => {
  const buttonClassName = `
    button
    button-${variant}
    button-${size}
    ${className}
    ${disabled ? 'button-disabled' : ''}
  `.trim();

  return (
    <button
      type={type}
      className={buttonClassName}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
};

export default Button;

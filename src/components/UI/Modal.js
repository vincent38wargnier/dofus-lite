import React from 'react';
import './Modal.css';

const Modal = ({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  onConfirm, 
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  showButtons = true 
}) => {
  if (!isOpen) return null;

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
    }
    onClose();
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-content">
        <button className="modal-close" onClick={onClose}>×</button>
        
        {title && <h2 className="modal-title">{title}</h2>}
        
        <div className="modal-body">
          {children}
        </div>
        
        {showButtons && (
          <div className="modal-footer">
            {onConfirm && (
              <button 
                className="modal-button confirm"
                onClick={handleConfirm}
              >
                {confirmText}
              </button>
            )}
            <button 
              className="modal-button cancel"
              onClick={onClose}
            >
              {cancelText}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Modal;

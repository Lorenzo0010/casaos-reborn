import React, { createContext, useContext, useState, useCallback } from 'react';
import { AlertTriangle, Info, Check, X } from 'lucide-react';

const DialogContext = createContext();

export function useDialog() {
  return useContext(DialogContext);
}

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);

  const showAlert = useCallback((title, message, isError = false) => {
    return new Promise((resolve) => {
      setDialog({
        type: 'alert',
        title,
        message,
        isError,
        onConfirm: () => {
          setDialog(null);
          resolve();
        }
      });
    });
  }, []);

  const showConfirm = useCallback((title, message) => {
    return new Promise((resolve) => {
      setDialog({
        type: 'confirm',
        title,
        message,
        onConfirm: () => {
          setDialog(null);
          resolve(true);
        },
        onCancel: () => {
          setDialog(null);
          resolve(false);
        }
      });
    });
  }, []);

  return (
    <DialogContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      {dialog && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-content glass" style={{ width: '400px', padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '15px' }}>
              {dialog.type === 'confirm' ? (
                <AlertTriangle size={24} color="var(--warning, #f59e0b)" />
              ) : dialog.isError ? (
                <AlertTriangle size={24} color="var(--danger, #ef4444)" />
              ) : (
                <Info size={24} color="var(--primary)" />
              )}
              <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{dialog.title}</h3>
            </div>
            
            <p style={{ margin: '0 0 20px 0', opacity: 0.9, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
              {dialog.message}
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              {dialog.type === 'confirm' && (
                <button 
                  className="btn" 
                  onClick={dialog.onCancel} 
                  style={{ background: 'var(--card-bg)' }}
                >
                  <X size={16} style={{ marginRight: '5px' }} /> Annulla
                </button>
              )}
              <button 
                className="btn btn-primary" 
                onClick={dialog.onConfirm}
              >
                <Check size={16} style={{ marginRight: '5px' }} /> {dialog.type === 'confirm' ? 'Conferma' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

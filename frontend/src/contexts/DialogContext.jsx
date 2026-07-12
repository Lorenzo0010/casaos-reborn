import React, { createContext, useContext, useState, useCallback } from 'react';
import { AlertTriangle, Info, Check, X } from 'lucide-react';

const DialogContext = createContext();

export function useDialog() {
  return useContext(DialogContext);
}

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const [toasts, setToasts] = useState([]);

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

  const showToast = useCallback((title, message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, title, message, type, hiding: false }]);
    
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, hiding: true } : t));
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 300);
    }, 3000);
  }, []);

  return (
    <DialogContext.Provider value={{ showAlert, showConfirm, showToast }}>
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

      {/* Toasts */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast toast-${toast.type} ${toast.hiding ? 'hiding' : ''}`}>
            <div className="toast-icon">
              {toast.type === 'success' && <Check size={20} />}
              {toast.type === 'error' && <AlertTriangle size={20} />}
              {toast.type === 'info' && <Info size={20} />}
            </div>
            <div className="toast-content">
              {toast.title && <div className="toast-title">{toast.title}</div>}
              {toast.message && <div className="toast-message">{toast.message}</div>}
            </div>
          </div>
        ))}
      </div>
    </DialogContext.Provider>
  );
}

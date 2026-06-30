import React, { useState } from 'react';
import { X, Save, Palette } from 'lucide-react';

export default function SettingsModal({ onClose, preferences, onSave }) {
  const [accentColor, setAccentColor] = useState(preferences?.accentColor || '#3b82f6');
  const [bgColor, setBgColor] = useState(preferences?.bgColor || '#f3f4f6');
  const [darkBgColor, setDarkBgColor] = useState(preferences?.darkBgColor || '#111827');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    await onSave({
      ...preferences,
      accentColor,
      bgColor,
      darkBgColor
    });
    setIsSaving(false);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content glass casaos-form" onClick={e => e.stopPropagation()}>
        <div className="section-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <Palette /> Impostazioni Interfaccia
          </h2>
          <button className="btn-icon" onClick={onClose}><X /></button>
        </div>
        
        <form onSubmit={handleSubmit} className="form-body">
          <div className="input-group">
            <label>Colore Accento (Primary)</label>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input 
                type="color" 
                value={accentColor} 
                onChange={e => setAccentColor(e.target.value)} 
                style={{ width: '50px', height: '40px', padding: '0', border: 'none', borderRadius: '4px', cursor: 'pointer' }} 
              />
              <input 
                type="text" 
                value={accentColor} 
                onChange={e => setAccentColor(e.target.value)} 
                style={{ flex: 1 }}
              />
            </div>
            <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>Il colore principale per i pulsanti, link e indicatori attivi.</p>
          </div>

          <div className="input-group">
            <label>Colore Sfondo (Tema Chiaro)</label>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input 
                type="color" 
                value={bgColor} 
                onChange={e => setBgColor(e.target.value)} 
                style={{ width: '50px', height: '40px', padding: '0', border: 'none', borderRadius: '4px', cursor: 'pointer' }} 
              />
              <input 
                type="text" 
                value={bgColor} 
                onChange={e => setBgColor(e.target.value)} 
                style={{ flex: 1 }}
              />
            </div>
          </div>

          <div className="input-group">
            <label>Colore Sfondo (Tema Scuro)</label>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input 
                type="color" 
                value={darkBgColor} 
                onChange={e => setDarkBgColor(e.target.value)} 
                style={{ width: '50px', height: '40px', padding: '0', border: 'none', borderRadius: '4px', cursor: 'pointer' }} 
              />
              <input 
                type="text" 
                value={darkBgColor} 
                onChange={e => setDarkBgColor(e.target.value)} 
                style={{ flex: 1 }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button type="button" className="btn" onClick={onClose} style={{ border: '1px solid var(--card-border)' }}>Annulla</button>
            <button type="submit" className="btn btn-primary" disabled={isSaving}>
              <Save size={18} /> {isSaving ? 'Salvataggio...' : 'Salva Preferenze'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

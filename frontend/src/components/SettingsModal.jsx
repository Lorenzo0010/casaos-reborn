import React, { useState } from 'react';
import { X, Save, Palette, RefreshCcw } from 'lucide-react';

export default function SettingsModal({ onClose, preferences, onSave }) {
  const [accentColor, setAccentColor] = useState(preferences?.accentColor || '#3b82f6');
  const [bgTheme, setBgTheme] = useState(preferences?.bgTheme || 'gray');
  const [isSaving, setIsSaving] = useState(false);

  const predefinedAccents = [
    { name: 'Blu CasaOS', hex: '#3b82f6' },
    { name: 'Smeraldo', hex: '#10b981' },
    { name: 'Viola', hex: '#8b5cf6' },
    { name: 'Arancione', hex: '#f97316' },
    { name: 'Rosso', hex: '#ef4444' },
    { name: 'Rosa', hex: '#ec4899' },
  ];

  const predefinedBackgrounds = [
    { id: 'gray', name: 'Grigio Classico' },
    { id: 'black', name: 'Total Black' },
    { id: 'navy', name: 'Blu Navy' },
    { id: 'red', name: 'Rosso Scuro' },
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    await onSave({
      ...preferences,
      accentColor,
      bgTheme
    });
    setIsSaving(false);
    onClose();
  };

  const handleReset = async () => {
    setIsSaving(true);
    await onSave({
      ...preferences,
      accentColor: '#3b82f6',
      bgTheme: 'gray'
    });
    setIsSaving(false);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content glass casaos-form" onClick={e => e.stopPropagation()}>
        <div className="section-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <Palette /> Tema e Colori
          </h2>
          <button className="btn-icon" onClick={onClose}><X /></button>
        </div>
        
        <form onSubmit={handleSubmit} className="form-body">
          <div className="input-group">
            <label>Colore Accento</label>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '5px' }}>
              {predefinedAccents.map(color => (
                <button
                  key={color.hex}
                  type="button"
                  title={color.name}
                  onClick={() => setAccentColor(color.hex)}
                  style={{
                    width: '40px', height: '40px', borderRadius: '50%', border: 'none', cursor: 'pointer',
                    backgroundColor: color.hex,
                    boxShadow: accentColor === color.hex ? `0 0 0 3px var(--card-bg), 0 0 0 5px ${color.hex}` : 'none',
                    transition: 'all 0.2s'
                  }}
                />
              ))}
            </div>
          </div>

          <div className="input-group" style={{ marginTop: '10px' }}>
            <label>Sfondo Adattivo (Light/Dark)</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '5px' }}>
              {predefinedBackgrounds.map(bg => (
                <button
                  key={bg.id}
                  type="button"
                  onClick={() => setBgTheme(bg.id)}
                  style={{
                    padding: '12px', borderRadius: '8px', border: bgTheme === bg.id ? `2px solid var(--primary)` : '1px solid var(--card-border)',
                    background: 'var(--card-bg)', color: 'var(--text-color)', textAlign: 'left', cursor: 'pointer',
                    fontWeight: bgTheme === bg.id ? 'bold' : 'normal',
                    transition: 'all 0.2s'
                  }}
                >
                  {bg.name}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
            <button type="button" className="btn btn-action danger" onClick={handleReset} disabled={isSaving}>
              <RefreshCcw size={16} /> Ripristina
            </button>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" className="btn" onClick={onClose} style={{ border: '1px solid var(--card-border)' }}>Annulla</button>
              <button type="submit" className="btn btn-primary" disabled={isSaving}>
                <Save size={18} /> {isSaving ? 'Salvataggio...' : 'Applica Tema'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

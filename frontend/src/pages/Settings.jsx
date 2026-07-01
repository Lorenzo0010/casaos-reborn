import React, { useState } from 'react';
import { Palette, Save, RefreshCcw, Moon, Sun } from 'lucide-react';

export default function Settings({ theme, toggleTheme, preferences, onSave }) {
  const [accentColor, setAccentColor] = useState(preferences?.accentColor || '#3b82f6');
  const [bgTheme, setBgTheme] = useState(preferences?.bgTheme || 'gray');
  const [isSaving, setIsSaving] = useState(false);

  const predefinedAccents = [
    // Rossi/Arancioni/Gialli
    { name: 'Rosso', hex: '#ef4444' },
    { name: 'Cremisi', hex: '#be123c' },
    { name: 'Arancione', hex: '#f97316' },
    { name: 'Ambra', hex: '#f59e0b' },
    { name: 'Giallo Cyber', hex: '#facc15' },
    // Verdi
    { name: 'Lime', hex: '#84cc16' },
    { name: 'Smeraldo', hex: '#10b981' },
    { name: 'Menta', hex: '#34d399' },
    { name: 'Verde Scuro', hex: '#15803d' },
    // Blu/Ciano
    { name: 'Ciano', hex: '#06b6d4' },
    { name: 'Azzurro', hex: '#0ea5e9' },
    { name: 'Blu CasaOS', hex: '#3b82f6' },
    { name: 'Indaco', hex: '#6366f1' },
    // Viola/Rosa
    { name: 'Viola', hex: '#8b5cf6' },
    { name: 'Lavanda', hex: '#d8b4fe' },
    { name: 'Fucsia', hex: '#d946ef' },
    { name: 'Rosa', hex: '#ec4899' },
    // Neutri
    { name: 'Ardesia', hex: '#64748b' },
    { name: 'Zinco', hex: '#71717a' },
  ];

  const predefinedBackgrounds = [
    // Grigi/Neutri
    { id: 'gray', name: 'Grigio Classico', hex: '#9ca3af' },
    { id: 'lightgray', name: 'Grigio Chiaro', hex: '#d1d5db' },
    { id: 'mediumgray', name: 'Grigio Medio', hex: '#4b5563' },
    { id: 'darkgray', name: 'Grigio Scuro', hex: '#1f2937' },
    { id: 'anthracite', name: 'Antracite', hex: '#18181b' },
    { id: 'black', name: 'Total Black', hex: '#000000' },
    // Colori
    { id: 'navy', name: 'Blu Navy', hex: '#020617' },
    { id: 'ocean', name: 'Oceano Profondo', hex: '#083344' },
    { id: 'forest', name: 'Verde Foresta', hex: '#022c22' },
    { id: 'military', name: 'Verde Militare', hex: '#333d29' },
    { id: 'mocha', name: 'Mocha Caldo', hex: '#2e1008' },
    { id: 'rust', name: 'Ruggine', hex: '#451a03' },
    { id: 'red', name: 'Rosso Scuro', hex: '#2a040d' },
    { id: 'purple', name: 'Viola Profondo', hex: '#2e1065' },
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
  };

  const handleReset = async () => {
    setIsSaving(true);
    await onSave({
      ...preferences,
      accentColor: '#3b82f6',
      bgTheme: 'gray'
    });
    setAccentColor('#3b82f6');
    setBgTheme('gray');
    setIsSaving(false);
  };

  return (
    <div className="grid">
      <div className="widget glass" style={{ maxWidth: '800px', margin: '0 auto', width: '100%' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
          <Palette /> Impostazioni UI
        </h2>
        
        <form onSubmit={handleSubmit} className="casaos-form" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div className="input-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              Tema Dark Mode {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '5px' }}>
              <label className="switch">
                <input type="checkbox" checked={theme === 'dark'} onChange={toggleTheme} />
                <span className="slider round"></span>
              </label>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-color)' }}>
                {theme === 'dark' ? 'Scuro abilitato' : 'Chiaro abilitato'}
              </span>
            </div>
          </div>

          <div className="input-group" style={{ marginTop: '10px' }}>
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
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '5px' }}>
              {predefinedBackgrounds.map(bg => (
                <button
                  key={bg.id}
                  type="button"
                  title={bg.name}
                  onClick={() => setBgTheme(bg.id)}
                  style={{
                    width: '40px', height: '40px', borderRadius: '50%', border: 'none', cursor: 'pointer',
                    backgroundColor: bg.hex,
                    boxShadow: bgTheme === bg.id ? `0 0 0 3px var(--card-bg), 0 0 0 5px var(--primary)` : 'none',
                    transition: 'all 0.2s',
                    position: 'relative'
                  }}
                />
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', borderTop: '1px solid var(--card-border)', paddingTop: '20px' }}>
            <button type="button" className="btn btn-action danger" onClick={handleReset} disabled={isSaving}>
              <RefreshCcw size={16} /> Ripristina Default
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSaving}>
              <Save size={18} /> {isSaving ? 'Salvataggio...' : 'Applica Tema'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

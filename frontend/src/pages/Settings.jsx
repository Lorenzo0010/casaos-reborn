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
    { id: 'gray', name: 'Grigio Classico', lightHex: '#f3f4f6', darkHex: '#111827' },
    { id: 'lightgray', name: 'Grigio Chiaro', lightHex: '#e5e7eb', darkHex: '#4b5563' },
    { id: 'mediumgray', name: 'Grigio Medio', lightHex: '#e5e7eb', darkHex: '#374151' },
    { id: 'darkgray', name: 'Grigio Scuro', lightHex: '#d1d5db', darkHex: '#1f2937' },
    { id: 'anthracite', name: 'Antracite', lightHex: '#e4e4e7', darkHex: '#18181b' },
    { id: 'black', name: 'Total Black', lightHex: '#e5e7eb', darkHex: '#000000' },
    // Colori
    { id: 'navy', name: 'Blu Navy', lightHex: '#e0e7ff', darkHex: '#020617' },
    { id: 'ocean', name: 'Oceano Profondo', lightHex: '#cffafe', darkHex: '#083344' },
    { id: 'forest', name: 'Verde Foresta', lightHex: '#dcfce7', darkHex: '#022c22' },
    { id: 'military', name: 'Verde Militare', lightHex: '#e9edc9', darkHex: '#333d29' },
    { id: 'mocha', name: 'Mocha Caldo', lightHex: '#ffedd5', darkHex: '#2e1008' },
    { id: 'rust', name: 'Ruggine', lightHex: '#ffedbf', darkHex: '#451a03' },
    { id: 'red', name: 'Rosso Scuro', lightHex: '#ffe4e6', darkHex: '#2a040d' },
    { id: 'purple', name: 'Viola Profondo', lightHex: '#f3e8ff', darkHex: '#2e1065' },
  ];

  // Removed handleSubmit since we save immediately

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
        
        <div className="casaos-form" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div className="input-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              Tema Dark Mode {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '5px' }}>
              <select value={theme} onChange={(e) => {
                setTheme(e.target.value);
                onSave({ ...preferences, theme: e.target.value });
              }} style={{ padding: '8px', borderRadius: '8px', border: '1px solid var(--card-border)', background: 'var(--bg-color)', color: 'var(--text-color)' }}>
                <option value="light">Chiaro</option>
                <option value="dark">Scuro</option>
                <option value="auto">Auto (Sistema)</option>
              </select>
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
                  onClick={() => {
                    setAccentColor(color.hex);
                    onSave({ ...preferences, accentColor: color.hex, bgTheme });
                  }}
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
              {predefinedBackgrounds.map(bg => {
                const currentHex = theme === 'dark' ? bg.darkHex : bg.lightHex;
                return (
                  <button
                    key={bg.id}
                    type="button"
                    title={bg.name}
                    onClick={() => {
                      setBgTheme(bg.id);
                      onSave({ ...preferences, accentColor, bgTheme: bg.id });
                    }}
                    style={{
                      width: '40px', height: '40px', borderRadius: '50%', border: '1px solid var(--card-border)', cursor: 'pointer',
                      backgroundColor: currentHex,
                      boxShadow: bgTheme === bg.id ? `0 0 0 3px var(--card-bg), 0 0 0 5px var(--primary)` : 'none',
                      transition: 'all 0.2s',
                      position: 'relative'
                    }}
                  />
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '20px', borderTop: '1px solid var(--card-border)', paddingTop: '20px' }}>
            <button type="button" className="btn btn-action danger" onClick={handleReset} disabled={isSaving}>
              <RefreshCcw size={16} /> Ripristina Default
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Wrench, Palette, Save, RefreshCcw, Moon, Sun, Terminal, RefreshCw, Trash2, ArrowDown } from 'lucide-react';
import { useDialog } from '../contexts/DialogContext';

export default function Advanced({ theme, actualTheme, setTheme, preferences, onSave }) {
  // ─── UI Settings state ───
  const [accentColor, setAccentColor] = useState(preferences?.accentColor || '#3b82f6');
  const [bgTheme, setBgTheme] = useState(preferences?.bgTheme || 'gray');
  const [isSaving, setIsSaving] = useState(false);

  // ─── System Logs state ───
  const [logs, setLogs] = useState('');
  const [logsLoading, setLogsLoading] = useState(true);
  const logsEndRef = useRef(null);

  const { showAlert, showConfirm } = useDialog();

  // Sync accent/bgTheme when preferences change externally
  useEffect(() => {
    if (preferences?.accentColor) setAccentColor(preferences.accentColor);
    if (preferences?.bgTheme) setBgTheme(preferences.bgTheme);
  }, [preferences]);

  // ═══════════════════════════════════════
  // UI Settings logic
  // ═══════════════════════════════════════

  const predefinedAccents = [
    { name: 'Rosso', hex: '#ef4444' },
    { name: 'Arancione', hex: '#f97316' },
    { name: 'Giallo', hex: '#eab308' },
    { name: 'Giallo Cyber', hex: '#facc15' },
    { name: 'Smeraldo', hex: '#10b981' },
    { name: 'Azzurro', hex: '#0ea5e9' },
    { name: 'Blu CasaOS', hex: '#3b82f6' },
    { name: 'Viola', hex: '#8b5cf6' },
    { name: 'Rosa', hex: '#ec4899' },
  ];

  const predefinedBackgrounds = [
    { id: 'gray', name: 'Grigio Scuro', lightHex: '#e5e7eb', darkHex: '#1f2937' },
    { id: 'mediumgray', name: 'Grigio Medio', lightHex: '#d1d5db', darkHex: '#374151' },
    { id: 'anthracite', name: 'Antracite', lightHex: '#e4e4e7', darkHex: '#18181b' },
    { id: 'black', name: 'Total Black', lightHex: '#e5e7eb', darkHex: '#000000' },
    { id: 'navy', name: 'Blu Scuro', lightHex: '#e0e7ff', darkHex: '#020617' },
    { id: 'ocean', name: 'Verde Petrolio', lightHex: '#cffafe', darkHex: '#083344' },
    { id: 'red', name: 'Rosso Scuro', lightHex: '#ffe4e6', darkHex: '#2a040d' },
  ];

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

  // ═══════════════════════════════════════
  // System Logs logic
  // ═══════════════════════════════════════

  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/system/logs', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLogs(res.data);
    } catch (err) {
      console.error(err);
      showAlert('Errore', 'Failed to fetch logs: ' + (err.response?.data?.error || err.message), true);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const clearLogs = async () => {
    const confirmed = await showConfirm('Svuota Log', 'Sei sicuro di voler svuotare tutti i log di sistema? Questa azione non può essere annullata.');
    if (!confirmed) return;

    try {
      const token = localStorage.getItem('token');
      await axios.delete('/api/system/logs', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLogs('');
    } catch (err) {
      showAlert('Errore', 'Failed to clear logs: ' + (err.response?.data?.error || err.message), true);
    }
  };

  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Funzione per colorare le righe di errore
  const renderLogLines = () => {
    if (!logs) return 'Nessun log disponibile.';
    return logs.split('\n').map((line, idx) => {
      const isError = line.includes('[ERROR]');
      return (
        <div key={idx} style={{ color: isError ? '#ef4444' : 'inherit' }}>
          {line}
        </div>
      );
    });
  };

  // ═══════════════════════════════════════
  // Docker Prune logic
  // ═══════════════════════════════════════

  const handlePruneImages = async () => {
    const confirmed = await showConfirm('Pulizia Immagini', 'Sei sicuro di voler eliminare tutte le immagini Docker non utilizzate da alcun container?');
    if (!confirmed) return;
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`/api/docker/images/prune`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const deletedSpace = (res.data.result?.SpaceReclaimed || 0) / 1024 / 1024;
      showAlert('Pulizia Completata', `Spazio liberato: ${deletedSpace.toFixed(2)} MB`);
    } catch (err) {
      showAlert('Errore', `Errore durante la pulizia delle immagini: ` + err.message, true);
    }
  };

  // ═══════════════════════════════════════
  // Render
  // ═══════════════════════════════════════

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '40px' }}>
      
      <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '0 0 4px 0' }}>
        <Wrench /> Avanzate
      </h1>

      {/* ─── Section 1: UI Settings ─── */}
      <div className="widget glass">
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
                const currentHex = actualTheme === 'dark' ? bg.darkHex : bg.lightHex;
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

      {/* ─── Section 2: System Logs ─── */}
      <div className="widget glass" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
            <Terminal size={24} /> Log di Sistema
          </h2>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn" onClick={fetchLogs} title="Aggiorna Logs" style={{ background: 'var(--card-bg)' }}>
              <RefreshCw size={18} className={logsLoading ? 'spin' : ''} style={{ marginRight: '5px' }} /> Aggiorna
            </button>
            <button className="btn" onClick={scrollToBottom} title="Scorri alla fine" style={{ background: 'var(--card-bg)' }}>
              <ArrowDown size={18} style={{ marginRight: '5px' }} /> Fine
            </button>
            <button className="btn btn-danger" onClick={clearLogs} title="Svuota Logs">
              <Trash2 size={18} style={{ marginRight: '5px' }} /> Svuota
            </button>
          </div>
        </div>

        <div className="glass" style={{ height: '350px', backgroundColor: '#1e1e1e', color: '#d4d4d4', padding: '15px', borderRadius: '8px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '13px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {logsLoading && !logs ? 'Caricamento logs in corso...' : renderLogLines()}
          <div ref={logsEndRef} />
        </div>
      </div>

      {/* ─── Section 3: Docker Maintenance ─── */}
      <div className="widget glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 5px 0' }}>
            🐋 Manutenzione Docker
          </h2>
          <p style={{ margin: 0, opacity: 0.7, fontSize: '0.9rem' }}>Rimuovi le immagini docker non collegate ad alcun container per liberare spazio su disco.</p>
        </div>
        <button className="btn btn-danger" onClick={handlePruneImages}>
          <Trash2 size={16} style={{ marginRight: '8px' }} />
          Pulisci Immagini
        </button>
      </div>

    </div>
  );
}

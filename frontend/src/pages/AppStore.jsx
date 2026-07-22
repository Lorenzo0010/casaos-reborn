import React, { useState, useEffect } from 'react';
import { Search, Download, AlertCircle, Menu } from 'lucide-react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

export default function AppStore({ togglePanel }) {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [installing, setInstalling] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchApps = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get('/api/store', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setApps(res.data);
      } catch (err) {
        console.error(err);
        setError('Errore nel caricamento dello Store');
      } finally {
        setLoading(false);
      }
    };
    fetchApps();
  }, []);

  const handleInstall = async (app) => {
    setInstalling(app.id);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      // Mappiamo i campi dello store sul formato richiesto da /containers/create
      const payload = {
        name: app.name,
        displayName: app.displayName,
        image: app.image,
        tag: app.tag || 'latest',
        ports: app.ports?.map(p => ({ mapped: p.split(':')[0], original: p.split(':')[1]?.split('/')[0] })) || [],
        env: app.env?.map(e => ({ name: e.split('=')[0], value: e.split('=')[1] })) || [],
        volumes: app.volumes?.map(v => ({ host: v.split(':')[0], container: v.split(':')[1] })) || [],
        restartPolicy: app.restartPolicy || 'unless-stopped',
        networkMode: app.networkMode || 'bridge',
        icon: app.icon
      };

      await axios.post('/api/docker/containers/create', payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Reindirizza alla dashboard per vedere l'installazione in corso
      navigate('/');
    } catch (err) {
      console.error(err);
      setError(`Errore durante l'installazione di ${app.displayName}`);
      setInstalling(null);
    }
  };

  const filteredApps = apps.filter(app => 
    app.displayName.toLowerCase().includes(searchQuery.toLowerCase()) || 
    app.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-col gap-6" style={{ maxWidth: '1200px', margin: '0 auto', width: '100%', padding: '20px', paddingBottom: '40px' }}>
      
      {/* Header con menu hamburger per mobile */}
      <div className="page-header">
        <div className="flex items-center gap-2">
          <button onClick={() => togglePanel('menu')} className="btn-icon-only" title="Menu">
            <Menu size={24} />
          </button>
          <h1 className="flex items-center gap-2 m-0">
            App Store
          </h1>
        </div>
        <div style={{ position: 'relative' }}>
          <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} size={18} />
          <input 
            type="text" 
            placeholder="Cerca app..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input glass"
            style={{ borderRadius: '20px', paddingLeft: '38px', width: '100%', maxWidth: '280px', minWidth: '180px' }}
          />
        </div>
      </div>

      {error && (
        <div className="glass" style={{ padding: '16px', marginBottom: '8px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px', borderLeft: '4px solid #ef4444' }}>
          <AlertCircle style={{ color: '#ef4444', flexShrink: 0 }} />
          <span style={{ color: '#ef4444', fontWeight: 500 }}>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center" style={{ height: '256px' }}>
          <div className="spinner"></div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
          {filteredApps.map((app) => (
            <div key={app.id} className="widget" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <div>
                <div className="flex items-center gap-4" style={{ marginBottom: '16px' }}>
                  <img 
                    src={app.icon} 
                    alt={app.displayName} 
                    style={{ width: '64px', height: '64px', borderRadius: '12px', objectFit: 'contain', background: 'rgba(255,255,255,0.05)', padding: '8px' }} 
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                  <div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>{app.displayName}</h2>
                    <span style={{ 
                      fontSize: '0.75rem', fontWeight: 600, padding: '4px 10px', borderRadius: '20px', 
                      background: 'rgba(var(--primary-rgb, 59, 130, 246), 0.15)', color: 'var(--primary)',
                      display: 'inline-block', marginTop: '4px'
                    }}>
                      {app.category}
                    </span>
                  </div>
                </div>
                <p style={{ fontSize: '0.875rem', opacity: 0.8, marginBottom: '24px', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {app.description}
                </p>
              </div>
              
              <button 
                className="btn btn-primary"
                onClick={() => handleInstall(app)}
                disabled={installing === app.id}
                style={{ borderRadius: '12px', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
              >
                {installing === app.id ? (
                  <>
                    <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }}></div>
                    Installazione...
                  </>
                ) : (
                  <>
                    <Download size={18} />
                    Installa
                  </>
                )}
              </button>
            </div>
          ))}
          {filteredApps.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '48px 0', opacity: 0.5 }}>
              Nessuna app trovata con questo nome.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

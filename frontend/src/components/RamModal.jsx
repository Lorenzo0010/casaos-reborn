import React, { useState, useEffect } from 'react';
import { X, Activity } from 'lucide-react';
import axios from 'axios';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';

export default function RamModal({ isOpen, onClose }) {
  const [history, setHistory] = useState([]);
  const [processes, setProcesses] = useState([]);
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;

    const token = localStorage.getItem('token');
    
    // Fetch initial history
    const fetchHistory = async () => {
      try {
        const res = await axios.get('/api/system/history', { headers: { Authorization: `Bearer ${token}` } });
        setHistory(res.data);
      } catch (e) {
        console.error('Failed to fetch history', e);
      }
    };

    // Fetch top processes and containers
    const fetchProcesses = async () => {
      setLoading(true);
      try {
        const res = await axios.get('/api/system/processes', { headers: { Authorization: `Bearer ${token}` } });
        // Sort by memory instead of CPU
        const sortedProcesses = (res.data.processes || []).sort((a, b) => b.mem - a.mem);
        const sortedContainers = (res.data.containers || []).sort((a, b) => b.mem - a.mem);
        setProcesses(sortedProcesses);
        setContainers(sortedContainers);
      } catch (e) {
        console.error('Failed to fetch processes', e);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
    fetchProcesses();
    
    // Auto refresh processes every 10 seconds while open
    const interval = setInterval(fetchProcesses, 10000);
    
    // Listen to real-time stats to update chart
    let socket;
    import('socket.io-client').then(({ io }) => {
      socket = io(window.location.origin, { auth: { token, type: 'web' } });
      socket.on('system.stats', (stats) => {
        setHistory(prev => {
          const newPoint = {
            time: Date.now(),
            cpu: parseFloat(stats.cpu.load),
            memory: parseFloat(stats.memory.percent),
            memoryUsed: stats.memory.used,
            memoryTotal: stats.memory.total
          };
          const updated = [...prev, newPoint];
          if (updated.length > 300) updated.shift();
          return updated;
        });
      });
    });

    return () => {
      clearInterval(interval);
      if (socket) socket.disconnect();
    };

  }, [isOpen]);

  if (!isOpen) return null;

  const formatTime = (time) => {
    const d = new Date(time);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ background: 'var(--bg-color)', border: '1px solid var(--border-color)', padding: '10px', borderRadius: '8px', color: 'var(--text-color)' }}>
          <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.8 }}>{formatTime(label)}</p>
          <p style={{ margin: 0, fontWeight: 'bold', color: '#10b981' }}>RAM: {payload[0].value}%</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      padding: '20px'
    }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{
        backgroundColor: 'var(--card-bg)',
        width: '100%', maxWidth: '800px', maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        borderRadius: '16px', overflow: 'hidden',
        border: '1px solid var(--card-border)'
      }}>
        {/* Header */}
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Activity size={24} color="#10b981" />
            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Dettagli RAM (Ultimi 15 minuti)</h2>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          
          {/* Chart */}
          <div style={{ height: '250px', marginBottom: '30px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRam" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                <XAxis dataKey="time" tickFormatter={formatTime} stroke="var(--text-muted)" fontSize={12} minTickGap={50} />
                <YAxis domain={[0, 100]} stroke="var(--text-muted)" fontSize={12} tickFormatter={val => `${val}%`} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="memory" stroke="#10b981" fillOpacity={1} fill="url(#colorRam)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Processes Table */}
          {loading && processes.length === 0 && containers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>Caricamento processi e container...</div>
          ) : (
            <div style={{ overflowX: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Containers */}
              {containers.length > 0 && (
                <div>
                  <h3 style={{ fontSize: '1rem', marginBottom: '10px', color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ padding: '2px 6px', background: '#10b981', color: 'white', borderRadius: '4px', fontSize: '0.7rem', textTransform: 'uppercase' }}>Container</span>
                    Container Docker (Ordinati per Memoria)
                  </h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', textAlign: 'left' }}>
                        <th style={{ padding: '8px' }}>Nome Container</th>
                        <th style={{ padding: '8px' }}>ID</th>
                        <th style={{ padding: '8px' }}>Memoria %</th>
                        <th style={{ padding: '8px' }}>CPU %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {containers.map(c => (
                        <tr key={c.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '8px', fontWeight: 500, color: 'var(--text-color)' }}>{c.name}</td>
                          <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{c.id}</td>
                          <td style={{ padding: '8px', color: '#10b981', fontWeight: 'bold' }}>{c.mem.toFixed(1)}%</td>
                          <td style={{ padding: '8px', color: 'var(--text-color)' }}>{c.cpu.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Processes */}
              <div>
                <h3 style={{ fontSize: '1rem', marginBottom: '10px', color: 'var(--text-color)' }}>Processi di Sistema (Ordinati per Memoria)</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', textAlign: 'left' }}>
                      <th style={{ padding: '8px' }}>PID</th>
                      <th style={{ padding: '8px' }}>Nome</th>
                      <th style={{ padding: '8px' }}>Memoria %</th>
                      <th style={{ padding: '8px' }}>CPU %</th>
                      <th style={{ padding: '8px' }}>Utente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {processes.slice(0, 50).map(p => (
                      <tr key={p.pid} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{p.pid}</td>
                        <td style={{ padding: '8px', fontWeight: 500, color: 'var(--text-color)' }}>{p.name}</td>
                        <td style={{ padding: '8px', color: '#10b981' }}>{p.mem.toFixed(1)}%</td>
                        <td style={{ padding: '8px', color: 'var(--text-color)' }}>{p.cpu.toFixed(1)}%</td>
                        <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{p.user}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

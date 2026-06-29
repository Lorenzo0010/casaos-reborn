import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Activity, Cpu, HardDrive, MemoryStick } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [containers, setContainers] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        const config = { headers: { Authorization: `Bearer ${token}` } };
        
        const [statsRes, contRes] = await Promise.all([
          axios.get('/api/system/stats', config),
          axios.get('/api/docker/containers', config)
        ]);
        
        setStats(statsRes.data);
        setContainers(contRes.data);
      } catch (err) {
        console.error(err);
      }
    };
    
    fetchData();
    const interval = setInterval(fetchData, 5000); // refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const runningContainers = containers.filter(c => c.State === 'running').length;

  return (
    <div>
      <h1>Dashboard</h1>
      
      {!stats ? (
        <p>Loading system statistics...</p>
      ) : (
        <div className="grid grid-cols-2">
          
          <div className="glass widget">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.8 }}>
              <Cpu /> <span>CPU Usage ({stats.cpu.cores} Cores)</span>
            </div>
            <div className="value">{stats.cpu.load}%</div>
            <progress value={stats.cpu.load} max="100" style={{ width: '100%' }}></progress>
          </div>

          <div className="glass widget">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.8 }}>
              <MemoryStick /> <span>RAM Usage</span>
            </div>
            <div className="value">{stats.memory.percent}%</div>
            <progress value={stats.memory.percent} max="100" style={{ width: '100%' }}></progress>
            <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>
              {(stats.memory.used / 1024 / 1024 / 1024).toFixed(1)} GB / {(stats.memory.total / 1024 / 1024 / 1024).toFixed(1)} GB
            </div>
          </div>

          <div className="glass widget">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.8 }}>
              <HardDrive /> <span>Primary Disk Usage</span>
            </div>
            <div className="value">{stats.disk.percent}%</div>
            <progress value={stats.disk.percent} max="100" style={{ width: '100%' }}></progress>
            <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>
              {(stats.disk.used / 1024 / 1024 / 1024).toFixed(1)} GB / {(stats.disk.total / 1024 / 1024 / 1024).toFixed(1)} GB
            </div>
          </div>

          <div className="glass widget">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.8 }}>
              <Activity /> <span>Active Containers</span>
            </div>
            <div className="value">{runningContainers} <span style={{fontSize: '1rem', color: 'var(--text-color)', fontWeight: 'normal'}}>out of {containers.length}</span></div>
            <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>OS: {stats.os.distro} {stats.os.release}</div>
          </div>
          
        </div>
      )}
    </div>
  );
}

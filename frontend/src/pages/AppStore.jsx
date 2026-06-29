import React, { useState } from 'react';
import axios from 'axios';
import { DownloadCloud } from 'lucide-react';

const APP_TEMPLATES = [
  {
    name: 'Nextcloud',
    image: 'linuxserver/nextcloud:latest',
    description: 'A safe home for all your data',
    ports: { '443/tcp': [{ HostPort: '8443' }] },
    volumes: ['nextcloud_data:/config', 'nextcloud_data:/data']
  },
  {
    name: 'Plex',
    image: 'linuxserver/plex:latest',
    description: 'Stream your media anywhere',
    ports: { '32400/tcp': [{ HostPort: '32400' }] },
    volumes: ['plex_config:/config', 'plex_media:/tv', 'plex_media:/movies']
  },
  {
    name: 'Pi-hole',
    image: 'pihole/pihole:latest',
    description: 'Network-wide Ad Blocking',
    ports: { '53/tcp': [{ HostPort: '53' }], '53/udp': [{ HostPort: '53' }], '80/tcp': [{ HostPort: '8080' }] },
    volumes: ['pihole_etc:/etc/pihole', 'pihole_dnsmasq:/etc/dnsmasq.d']
  },
  {
    name: 'Jellyfin',
    image: 'linuxserver/jellyfin:latest',
    description: 'The Free Software Media System',
    ports: { '8096/tcp': [{ HostPort: '8096' }] },
    volumes: ['jellyfin_config:/config', 'jellyfin_tv:/data/tvshows', 'jellyfin_movies:/data/movies']
  }
];

export default function AppStore() {
  const [installing, setInstalling] = useState(null);

  const handleInstall = async (app) => {
    setInstalling(app.name);
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/docker/deploy', {
        image: app.image,
        name: app.name.toLowerCase(),
        ports: app.ports,
        volumes: app.volumes,
        env: ['TZ=Europe/Rome', 'PUID=1000', 'PGID=1000']
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert(`${app.name} installed and started successfully!`);
    } catch (err) {
      alert(`Failed to install ${app.name}: ` + (err.response?.data?.error || err.message));
    } finally {
      setInstalling(null);
    }
  };

  return (
    <div>
      <h1>App Store</h1>
      <p style={{ marginBottom: '20px', opacity: 0.8 }}>One-click installs for popular applications.</p>
      
      <div className="grid grid-cols-2">
        {APP_TEMPLATES.map(app => (
          <div key={app.name} className="glass" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h2>{app.name}</h2>
            <p style={{ opacity: 0.8 }}>{app.description}</p>
            <div style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: 'auto', marginBottom: '10px' }}>
              Image: {app.image}
            </div>
            
            <button 
              onClick={() => handleInstall(app)} 
              className="btn btn-primary" 
              disabled={installing === app.name}
            >
              <DownloadCloud size={18} />
              {installing === app.name ? 'Installing...' : 'Install App'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

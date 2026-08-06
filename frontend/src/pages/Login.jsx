import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { LogIn, UserPlus } from 'lucide-react';

export default function Login({ setToken }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSetupMode, setIsSetupMode] = useState(false);

  useEffect(() => {
    // Check if setup is required on mount
    axios.post('/api/login', { username: '', password: '' }).catch(err => {
      if (err.response && err.response.data.setupRequired) {
        setIsSetupMode(true);
      }
    });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const endpoint = isSetupMode ? '/api/setup' : '/api/login';
      const res = await axios.post(endpoint, { username, password });
      const token = res.data.token;
      localStorage.setItem('token', token);
      setToken(token);
    } catch (err) {
      if (err.response && err.response.data.setupRequired) {
        setIsSetupMode(true);
        setError('Setup required. Please create an admin account.');
      } else {
        setError(err.response?.data?.error || 'Invalid credentials');
      }
    }
  };

  return (
    <div className="login-container">
      <form onSubmit={handleSubmit} className="login-card casaos-form">
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <h2>{isSetupMode ? 'CasaOS Reborn Setup' : 'Welcome to CasaOS Reborn'}</h2>
          <p style={{ opacity: 0.7 }}>{isSetupMode ? 'Create your admin account to get started' : 'Login to manage your server'}</p>
        </div>
        
        {error && (
          <div style={{
            color: 'var(--danger)',
            textAlign: 'center',
            marginBottom: '16px',
            backgroundColor: 'rgba(248, 113, 113, 0.1)',
            padding: '12px',
            borderRadius: '8px'
          }}>
            {error}
          </div>
        )}

        <div className="form-group">
          <label>Username</label>
          <input type="text" value={username} onChange={e => setUsername(e.target.value)} required />
        </div>
        <div className="form-group">
          <label>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        </div>

        <button type="submit" className="btn btn-primary" style={{ justifyContent: 'center', marginTop: '10px' }}>
          {isSetupMode ? <><UserPlus size={18} /> Complete Setup</> : <><LogIn size={18} /> Login</>}
        </button>
      </form>
    </div>
  );
}

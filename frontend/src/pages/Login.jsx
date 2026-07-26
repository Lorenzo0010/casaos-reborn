import React, { useState } from 'react';
import axios from 'axios';
import { LogIn } from 'lucide-react';

export default function Login({ setToken }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post('/api/login', { username, password });
      const token = res.data.token;
      localStorage.setItem('token', token);
      setToken(token);
    } catch (err) {
      setError('Invalid credentials');
    }
  };

  return (
    <div className="login-container">
      <form onSubmit={handleLogin} className="login-card casaos-form">
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <h2>Welcome to CasaOS Reborn</h2>
          <p style={{ opacity: 0.7 }}>Login to manage your server</p>
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
          <LogIn size={18} /> Login
        </button>
      </form>
    </div>
  );
}

import { useState } from 'react';
import './index.css';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // FastAPI OAuth2 expects form-encoded data
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);

      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData
      });

      if (!response.ok) {
        throw new Error('Incorrect username or password');
      }
      
      const data = await response.json();
      // Pass the token and user info up to App.jsx
      onLogin(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '70vh' }}>
      <div style={{
        background: 'var(--bg-card)', padding: '2.5rem', width: '100%', maxWidth: '400px',
        borderRadius: 'var(--border-radius-lg)', border: '1px solid var(--border-color)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
      }}>
        <h2 style={{ textAlign: 'center', marginBottom: '2rem', fontSize: '1.8rem' }}>Welcome to Moosic</h2>
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          <div>
            <label style={{ display: 'block', color: 'var(--text-muted)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Username</label>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{
                width: '100%', padding: '0.8rem', borderRadius: '8px',
                border: '1px solid var(--border-color)', background: 'var(--bg-secondary)',
                color: 'var(--text-main)', fontSize: '1rem'
              }}
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', color: 'var(--text-muted)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: '100%', padding: '0.8rem', borderRadius: '8px',
                border: '1px solid var(--border-color)', background: 'var(--bg-secondary)',
                color: 'var(--text-main)', fontSize: '1rem'
              }}
              required
            />
          </div>

          {error && <div style={{ color: '#ff4757', fontSize: '0.9rem', textAlign: 'center', fontWeight: 'bold' }}>{error}</div>}

          <button type="submit" disabled={isLoading} style={{
            background: 'var(--accent-green)', color: '#000', border: 'none',
            padding: '1rem', borderRadius: '8px', fontWeight: 'bold', fontSize: '1rem', 
            cursor: isLoading ? 'not-allowed' : 'pointer', marginTop: '1rem',
            opacity: isLoading ? 0.7 : 1
          }}>
            {isLoading ? 'Authenticating...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}
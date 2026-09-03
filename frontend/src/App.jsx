import { useState, useEffect } from 'react';
import Login from './Login';
import Daily from './Daily';
import History from './History';
import Stats from './Stats';
import Profile from './Profile';
import './index.css';

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('moosic_token'));
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('moosic_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [activeTab, setActiveTab] = useState('daily');

  useEffect(() => {
    const savedToken = localStorage.getItem('moosic_token');
    if (savedToken && !token) {
      setToken(savedToken);
    }
  }, [token]);

  const handleLogin = (newToken, userObj) => {
    localStorage.setItem('moosic_token', newToken);
    localStorage.setItem('moosic_user', JSON.stringify(userObj));
    setToken(newToken);
    setCurrentUser(userObj);
    setActiveTab('daily');
  };

  const handleLogout = () => {
    localStorage.removeItem('moosic_token');
    localStorage.removeItem('moosic_user');
    setToken(null);
    setCurrentUser(null);
    setActiveTab('daily');
  };

  const isLoggedIn = Boolean(token || localStorage.getItem('moosic_token'));

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-main)', padding: '2rem' }}>
      
      {/* Centered Max-Width Wrapper to prevent wide-screen stretching */}
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 'bold', letterSpacing: '-0.5px' }}>MPE • Moosic</h1>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {isLoggedIn ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  Signed in as <strong style={{ color: 'var(--text-main)' }}>
                    {typeof currentUser === 'string' ? currentUser : (currentUser?.username || localStorage.getItem('user') || 'User')}
                  </strong>
                </span>
                <button onClick={handleLogout} style={{
                  background: 'transparent', color: '#ff4757', border: '1px solid #ff4757',
                  padding: '0.4rem 1rem', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.85rem'
                }}>
                  Logout
                </button>
              </div>
            ) : (
              <button onClick={() => setActiveTab('login')} style={{
                background: 'var(--accent-green)', color: '#000', border: 'none',
                padding: '0.5rem 1.2rem', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer'
              }}>
                Login
              </button>
            )}
          </div>
        </header>

        <nav className="nav-tabs" style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
          <button className={`nav-tab ${activeTab === 'daily' ? 'active' : ''}`} onClick={() => setActiveTab('daily')}>
            Vote
          </button>
          <button className={`nav-tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
            History
          </button>
          <button className={`nav-tab ${activeTab === 'stats' ? 'active' : ''}`} onClick={() => setActiveTab('stats')}>
            Stats
          </button>
          
          {isLoggedIn && (
            <button className={`nav-tab ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
              Profile
            </button>
          )}
        </nav>

        <main>
          {activeTab === 'login' && <Login onLogin={handleLogin} />}
          {activeTab === 'history' && <History />}
          {activeTab === 'stats' && <Stats />}
          {activeTab === 'daily' && (
             <Daily currentUser={currentUser} onGoToLogin={() => setActiveTab('login')} />
          )}
          {activeTab === 'profile' && isLoggedIn && (
            <Profile 
              currentUser={currentUser} 
              onProfileUpdate={(newToken, newUsername) => {
                localStorage.setItem('moosic_token', newToken);
                const updatedUser = { ...currentUser, username: newUsername };
                localStorage.setItem('moosic_user', JSON.stringify(updatedUser));
                setToken(newToken);
                setCurrentUser(updatedUser);
              }} 
            />
          )}
        </main>

      </div>
    </div>
  );
}
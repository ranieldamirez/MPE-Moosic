import { useState } from 'react';
import Login from './Login';
import Daily from './Daily';
import History from './History';
import Stats from './Stats';
import Profile from './Profile';
import './index.css';

export default function App() {
  const [token, setToken] = useState(() => {
    return localStorage.getItem('moosic_token');
  });

  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('moosic_user');

      if (!saved) {
        return null;
      }

      return JSON.parse(saved);
    } catch {
      localStorage.removeItem('moosic_user');
      return null;
    }
  });

  const [activeTab, setActiveTab] = useState('daily');

  const isLoggedIn = Boolean(
    token &&
      currentUser &&
      currentUser.id &&
      currentUser.username
  );

  const handleLogin = (newToken, userObj) => {
    localStorage.setItem(
      'moosic_token',
      newToken
    );

    localStorage.setItem(
      'moosic_user',
      JSON.stringify(userObj)
    );

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

  const handleProfileUpdate = (
    newToken,
    newUsername
  ) => {
    const updatedUser = {
      ...currentUser,
      username: newUsername
    };

    localStorage.setItem(
      'moosic_token',
      newToken
    );

    localStorage.setItem(
      'moosic_user',
      JSON.stringify(updatedUser)
    );

    setToken(newToken);
    setCurrentUser(updatedUser);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-primary)',
        color: 'var(--text-main)',
        padding: '2rem'
      }}
    >
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto'
        }}
      >
        {/* HEADER */}
        <header
          style={{
            display: 'flex',
            justifyContent:
              'space-between',
            alignItems: 'center',
            marginBottom: '2rem',
            borderBottom:
              '1px solid var(--border-color)',
            paddingBottom: '1rem'
          }}
        >
          {/* LOGO + TITLE */}
          <button
            onClick={() =>
              setActiveTab('daily')
            }
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              background: 'transparent',
              border: 'none',
              padding: 0,
              margin: 0,
              color: 'inherit',
              cursor: 'pointer'
            }}
            aria-label="Go to Moosic home"
          >
            <img
              src="./public/hamster.png"
              alt="MPE Moosic logo"
              style={{
                width: '52px',
                height: '52px',
                objectFit: 'contain',
                display: 'block'
              }}
            />

            <h1
              style={{
                fontSize: '1.8rem',
                fontWeight: 'bold',
                letterSpacing:
                  '-0.5px',
                margin: 0
              }}
            >
              MPE Moosic
            </h1>
          </button>

          {/* LOGIN / USER */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem'
            }}
          >
            {isLoggedIn ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem'
                }}
              >
                <span
                  style={{
                    color:
                      'var(--text-muted)',
                    fontSize: '0.9rem'
                  }}
                >
                  Logged in as{' '}
                  <strong
                    style={{
                      color:
                        'var(--text-main)'
                    }}
                  >
                    {currentUser.username}
                  </strong>
                </span>

                <button
                  onClick={
                    handleLogout
                  }
                  style={{
                    background:
                      'transparent',
                    color: '#ff4757',
                    border:
                      '1px solid #ff4757',
                    padding:
                      '0.4rem 1rem',
                    borderRadius: '6px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    fontSize:
                      '0.85rem'
                  }}
                >
                  Logout
                </button>
              </div>
            ) : (
              <button
                onClick={() =>
                  setActiveTab('login')
                }
                style={{
                  background:
                    'var(--accent-green)',
                  color: '#000',
                  border: 'none',
                  padding:
                    '0.5rem 1.2rem',
                  borderRadius: '6px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Login
              </button>
            )}
          </div>
        </header>

        {/* NAVIGATION */}
        <nav
          className="nav-tabs"
          style={{
            display: 'flex',
            gap: '1rem',
            marginBottom: '2rem'
          }}
        >
          <button
            className={`nav-tab ${
              activeTab === 'daily'
                ? 'active'
                : ''
            }`}
            onClick={() =>
              setActiveTab('daily')
            }
          >
            Vote
          </button>

          <button
            className={`nav-tab ${
              activeTab === 'history'
                ? 'active'
                : ''
            }`}
            onClick={() =>
              setActiveTab('history')
            }
          >
            History
          </button>

          <button
            className={`nav-tab ${
              activeTab === 'stats'
                ? 'active'
                : ''
            }`}
            onClick={() =>
              setActiveTab('stats')
            }
          >
            Stats
          </button>

          {isLoggedIn && (
            <button
              className={`nav-tab ${
                activeTab === 'profile'
                  ? 'active'
                  : ''
              }`}
              onClick={() =>
                setActiveTab('profile')
              }
            >
              Profile
            </button>
          )}
        </nav>

        {/* CONTENT */}
        <main>
          {activeTab === 'login' && (
            <Login
              onLogin={handleLogin}
            />
          )}

          {activeTab === 'history' && (
            <History />
          )}

          {activeTab === 'stats' && (
            <Stats />
          )}

          {activeTab === 'daily' && (
            <Daily
              currentUser={
                currentUser
              }
              onGoToLogin={() =>
                setActiveTab('login')
              }
              onLogout={
                handleLogout
              }
            />
          )}

          {activeTab === 'profile' &&
            isLoggedIn && (
              <Profile
                currentUser={
                  currentUser
                }
                onProfileUpdate={
                  handleProfileUpdate
                }
              />
            )}
        </main>
      </div>
    </div>
  );
}
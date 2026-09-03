import { useState, useEffect, useCallback } from 'react';
import './index.css';

const USER_COLORS = {
  'alappatjoe': '#4ade80',      
  'danram': '#60a5fa',          
  'loganworsdell': '#fde047',   
  'samuelbattista': '#9ca3af',  
  'currydestroyer27': '#ffb085' 
};

const getUserColor = (username) => USER_COLORS[username?.toLowerCase()] || '#ffffff';

const getScoreColor = (score) => {
  const validScore = Math.max(1, Math.min(5, score));
  const hue = 120 - ((validScore - 1) * 30);
  return `hsl(${hue}, 80%, 60%)`;
};

export default function Daily({ currentUser, onGoToLogin }) {
  const getTodayString = () => {
    const today = new Date();
    return new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
  };

  const [selectedDate, setSelectedDate] = useState(getTodayString());
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [previewData, setPreviewData] = useState(null);
  const [submitStatus, setSubmitStatus] = useState(null);
  const [voteError, setVoteError] = useState(null);
  
  const [targetSongs, setTargetSongs] = useState([]);
  const [myVotes, setMyVotes] = useState({}); 
  const [savedVotes, setSavedVotes] = useState({}); 
  const [totalUserCount, setTotalUserCount] = useState(5); 
  const [isLoadingSongs, setIsLoadingSongs] = useState(true);
  const [isSubmittingVotes, setIsSubmittingVotes] = useState(false);

  const getToken = () => localStorage.getItem('moosic_token') || localStorage.getItem('token');

  const fetchDataForDate = useCallback(async () => {
    if (!selectedDate) return;
    setIsLoadingSongs(true);
    setVoteError(null);
    const token = getToken();
    
    try {
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

      const [songsRes, votesRes, statsRes] = await Promise.all([
        fetch(`${import.meta.env.VITE_API_URL}/api/songs/daily/${selectedDate}`),
        fetch(`${import.meta.env.VITE_API_URL}/api/votes/me/${selectedDate}`, { headers }),
        fetch(`${import.meta.env.VITE_API_URL}/api/stats`)
      ]);
      
      if (songsRes.ok) {
        setTargetSongs(await songsRes.json());
      }
      if (votesRes.ok) {
        const vData = await votesRes.json();
        setMyVotes(vData);
        setSavedVotes(vData);
      }
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        if (statsData.usernames) {
          setTotalUserCount(statsData.usernames.length);
        }
      }
    } catch (err) {
      console.error("Failed to load data for date:", err);
    } finally {
      setIsLoadingSongs(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    if (currentUser) {
      fetchDataForDate();
    }
  }, [currentUser, selectedDate, fetchDataForDate]);

  if (!currentUser) {
    return (
      <div style={{ textAlign: 'center', marginTop: '3rem', padding: '2rem', background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
        <h2 style={{ marginBottom: '1rem' }}>Ready to vote?</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>You must be logged in to submit tracks and cast your votes.</p>
        <button onClick={onGoToLogin} style={{
          background: 'var(--accent-green)', color: '#000', border: 'none', padding: '0.8rem 2rem', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer'
        }}>
          Go to Login
        </button>
      </div>
    );
  }

  const handlePreview = async (e) => {
    e.preventDefault();
    if (!spotifyUrl) return;
    setSubmitStatus(null); 

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/songs/fetch-metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: spotifyUrl })
      });
      
      if (response.ok) {
        setPreviewData(await response.json());
      } else {
        const errData = await response.json();
        setSubmitStatus(errData.detail || "Failed to fetch metadata.");
      }
    } catch (err) {
      setSubmitStatus("Error connecting to server.");
    }
  };

  const handleDatabaseSubmit = async () => {
    const token = getToken();
    const submitterId = typeof currentUser === 'object' ? currentUser?.id : 1;

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/songs`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({
          title: previewData.title,
          artist: previewData.artist,
          submitter_id: submitterId, 
          submission_date: selectedDate
        })
      });

      if (response.ok) {
        setSubmitStatus(`Success! Track added for ${selectedDate}.`);
        setSpotifyUrl('');
        setPreviewData(null);
        fetchDataForDate(); 
      } else {
        const errJson = await response.json().catch(() => ({}));
        setSubmitStatus(errJson.detail || "Error saving track. Please try again.");
      }
    } catch (err) {
      setSubmitStatus("Error saving track.");
    }
  };

  const handleScoreClick = (songId, score) => {
    setVoteError(null);
    setMyVotes(prev => {
      const currentAssignedScore = prev[songId];

      if (currentAssignedScore === score) {
        const updated = { ...prev };
        delete updated[songId];
        return updated;
      }

      const isScoreTakenElsewhere = Object.entries(prev).some(
        ([sId, sScore]) => Number(sId) !== Number(songId) && sScore === score
      );

      if (isScoreTakenElsewhere) {
        setVoteError(`Score ${score} is already assigned to another track.`);
        return prev;
      }

      return { ...prev, [songId]: score };
    });
  };

  const allSongsHaveScores = targetSongs.length > 0 && targetSongs.every(song => myVotes[song.id] !== undefined);
  const allSongsPosted = targetSongs.length === totalUserCount;
  const hasChanges = JSON.stringify(myVotes) !== JSON.stringify(savedVotes);
  const hasExistingSaves = Object.keys(savedVotes).length > 0;

  const canSubmit = allSongsPosted && allSongsHaveScores && (hasChanges || !hasExistingSaves);

  const handleSubmitBatchVotes = async () => {
    if (!canSubmit) return;
    setVoteError(null);
    setIsSubmittingVotes(true);
    const token = getToken();

    try {
      for (const song of targetSongs) {
        const targetScore = myVotes[song.id];
        const previousScore = savedVotes[song.id];

        if (targetScore !== previousScore) {
          if (targetScore === undefined) {
            await fetch(`${import.meta.env.VITE_API_URL}/api/votes/${song.id}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${token}` }
            });
          } else {
            await fetch(`${import.meta.env.VITE_API_URL}/api/votes`, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
              },
              body: JSON.stringify({ song_id: song.id, score: targetScore })
            });
          }
        }
      }

      setSavedVotes({ ...myVotes });
    } catch (err) {
      setVoteError("Failed to sync votes with server.");
    } finally {
      setIsSubmittingVotes(false);
    }
  };

  const handleClearAllVotesLocally = () => {
    setMyVotes({});
    setVoteError(null);
  };

  const displayUsername = typeof currentUser === 'string' ? currentUser : (currentUser?.username || 'User');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Date Selector Header */}
      <div style={{ background: 'var(--bg-card)', padding: '1.5rem 2rem', borderRadius: 'var(--border-radius-lg)', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', margin: 0 }}>Manage Day</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.2rem 0 0 0' }}>Select a past or present date to submit or update votes.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <input 
            type="date" 
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{ padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-main)', fontSize: '1rem', cursor: 'pointer' }}
          />
          <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            As <strong style={{ color: 'var(--text-main)' }}>{displayUsername}</strong>
          </span>
        </div>
      </div>

      {/* Track Submission Panel for Selected Date */}
      <div style={{ background: 'var(--bg-card)', padding: '2rem', borderRadius: 'var(--border-radius-lg)', border: '1px solid var(--border-color)' }}>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Post Track for {selectedDate}</h3>
        
        <form onSubmit={handlePreview} style={{ display: 'flex', gap: '1rem' }}>
          <input 
            type="text" placeholder="Paste Spotify Link here..." value={spotifyUrl} onChange={(e) => setSpotifyUrl(e.target.value)}
            style={{ flex: 1, padding: '0.8rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-main)', fontSize: '1rem' }}
          />
          <button type="submit" style={{ background: 'var(--bg-secondary)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '0 1.5rem', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
            Preview
          </button>
        </form>

        {previewData && (
          <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--accent-green)' }}>
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
              <img src={previewData.cover_art_url} alt="Cover" style={{ width: '80px', height: '80px', borderRadius: '8px' }} />
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{previewData.title}</h3>
                <p style={{ margin: '0.3rem 0 0 0', color: 'var(--text-muted)' }}>{previewData.artist}</p>
              </div>
            </div>
            <button onClick={handleDatabaseSubmit} style={{ background: 'var(--accent-green)', color: '#000', border: 'none', padding: '0.8rem 2rem', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
              Submit for {selectedDate}
            </button>
          </div>
        )}

        {submitStatus && (
          <div style={{ marginTop: '1.5rem', padding: '1rem', borderRadius: '8px', textAlign: 'center', fontWeight: 'bold', background: submitStatus.includes("Success") ? 'rgba(46, 213, 115, 0.1)' : 'rgba(255, 71, 87, 0.1)', color: submitStatus.includes("Success") ? '#2ed573' : '#ff4757' }}>
            {submitStatus}
          </div>
        )}
      </div>

      {/* Voting Panel for Selected Date */}
      <div style={{ background: 'var(--bg-card)', padding: '2rem', borderRadius: 'var(--border-radius-lg)', border: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Votes & Tracks for {selectedDate} ({targetSongs.length}/{totalUserCount} Songs Posted)</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
              {!allSongsPosted 
                ? `Waiting for all ${totalUserCount} managers to post their songs before voting can unlock.`
                : !allSongsHaveScores 
                ? "Assign a unique score (1-5) to every track to unlock submission." 
                : "All songs scored. Ready to submit!"}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.8rem' }}>
            {targetSongs.length > 0 && (
              <button onClick={handleClearAllVotesLocally} style={{ background: 'transparent', color: '#ff4757', border: '1px solid #ff4757', padding: '0.5rem 1rem', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.85rem' }}>
                Clear Selection
              </button>
            )}
            
            <button 
              onClick={handleSubmitBatchVotes}
              disabled={!canSubmit || isSubmittingVotes}
              style={{
                background: canSubmit ? 'var(--accent-green)' : 'var(--bg-secondary)',
                color: canSubmit ? '#000' : 'var(--text-muted)',
                border: '1px solid var(--border-color)',
                padding: '0.5rem 1.5rem',
                borderRadius: '8px',
                fontWeight: 'bold',
                cursor: canSubmit && !isSubmittingVotes ? 'pointer' : 'not-allowed',
                opacity: canSubmit ? 1 : 0.6,
                fontSize: '0.9rem',
                boxShadow: canSubmit ? '0 0 12px rgba(29, 185, 84, 0.3)' : 'none'
              }}
            >
              {isSubmittingVotes ? 'Saving...' : hasExistingSaves && !hasChanges ? 'Submitted' : hasExistingSaves ? 'Re-submit' : 'Submit Votes'}
            </button>
          </div>
        </div>

        {voteError && (
          <div style={{ marginBottom: '1.5rem', padding: '1rem', borderRadius: '8px', textAlign: 'center', fontWeight: 'bold', background: 'rgba(255, 71, 87, 0.1)', color: '#ff4757' }}>
            {voteError}
          </div>
        )}
        
        {isLoadingSongs ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>Loading tracks...</p>
        ) : targetSongs.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>No tracks found for this date.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {targetSongs.map(song => {
              const submitterColor = getUserColor(song.submittedBy);
              
              return (
                <div key={song.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '1.5rem' }}>
                  <div>
                    <h3 style={{ fontSize: '1.15rem', margin: 0, color: submitterColor }}>{song.title}</h3>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: '0.3rem 0 0 0' }}>
                      {song.artist} <span style={{ opacity: 0.8, marginLeft: '0.5rem' }}>• Submitted by <strong style={{ color: submitterColor }}>{song.submittedBy}</strong></span>
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {[1, 2, 3, 4, 5].map(score => {
                      const isSelected = myVotes[song.id] === score;
                      const baseColor = getScoreColor(score);
                      
                      return (
                        <button 
                          key={score}
                          onClick={() => handleScoreClick(song.id, score)}
                          style={{
                            background: isSelected ? baseColor : 'transparent',
                            color: isSelected ? '#000' : baseColor,
                            border: `2px solid ${isSelected ? baseColor : `${baseColor}40`}`,
                            padding: '0.5rem 1rem',
                            borderRadius: '8px',
                            fontWeight: 'bold',
                            fontSize: '1.1rem',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease-in-out',
                            boxShadow: isSelected ? `0 0 12px ${baseColor}60` : 'none'
                          }}
                        >
                          {score}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
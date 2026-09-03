import { useState, useEffect, useCallback } from 'react';
import './index.css';

const USER_COLORS = {
  alappatjoe: '#4ade80',
  danram: '#60a5fa',
  loganworsdell: '#fde047',
  samuelbattista: '#9ca3af',
  currydestroyer27: '#ffb085'
};

const getUserColor = (username) =>
  USER_COLORS[username?.toLowerCase()] || '#ffffff';

const getScoreColor = (score) => {
  const validScore = Math.max(1, Math.min(5, score));
  const hue = 120 - ((validScore - 1) * 30);

  return `hsl(${hue}, 80%, 60%)`;
};

export default function Daily({
  currentUser,
  onGoToLogin
}) {
  const getTodayString = () => {
    const today = new Date();

    return new Date(
      today.getTime() -
        (today.getTimezoneOffset() * 60000)
    )
      .toISOString()
      .split('T')[0];
  };

  const [selectedDate, setSelectedDate] =
    useState(getTodayString());

  const [spotifyUrl, setSpotifyUrl] =
    useState('');

  const [previewData, setPreviewData] =
    useState(null);

  const [submitStatus, setSubmitStatus] =
    useState(null);

  const [voteError, setVoteError] =
    useState(null);

  const [targetSongs, setTargetSongs] =
    useState([]);

  const [myVotes, setMyVotes] =
    useState({});

  const [savedVotes, setSavedVotes] =
    useState({});

  const [totalUserCount, setTotalUserCount] =
    useState(5);

  const [isLoadingSongs, setIsLoadingSongs] =
    useState(true);

  const [isSubmittingVotes, setIsSubmittingVotes] =
    useState(false);

  // ==========================================================
  // EDIT STATE
  // ==========================================================

  const [editingSong, setEditingSong] =
    useState(null);

  const [editSpotifyUrl, setEditSpotifyUrl] =
    useState('');

  const [editPreviewData, setEditPreviewData] =
    useState(null);

  const [isUpdatingSong, setIsUpdatingSong] =
    useState(false);

  const [isPreviewing, setIsPreviewing] =
    useState(false);

  const [isPreviewingEdit, setIsPreviewingEdit] =
    useState(false);

  // ==========================================================
  // AUTH
  // ==========================================================

  const handleUnauthorized = useCallback(() => {
    localStorage.removeItem('moosic_token');
    localStorage.removeItem('moosic_user');

    onGoToLogin();
  }, [onGoToLogin]);

  // ==========================================================
  // LOAD DATA
  // ==========================================================

  const fetchDataForDate = useCallback(async () => {
    if (!selectedDate || !currentUser) {
      return;
    }

    setIsLoadingSongs(true);
    setVoteError(null);

    const token =
      localStorage.getItem('moosic_token');

    if (!token) {
      handleUnauthorized();
      return;
    }

    try {
      const [
        songsRes,
        votesRes,
        statsRes
      ] = await Promise.all([
        fetch(
          `${import.meta.env.VITE_API_URL}/api/songs/daily/${selectedDate}`
        ),

        fetch(
          `${import.meta.env.VITE_API_URL}/api/votes/me/${selectedDate}`,
          {
            headers: {
              Authorization:
                `Bearer ${token}`
            }
          }
        ),

        fetch(
          `${import.meta.env.VITE_API_URL}/api/stats`
        )
      ]);

      if (votesRes.status === 401) {
        handleUnauthorized();
        return;
      }

      if (songsRes.ok) {
        const songs =
          await songsRes.json();

        setTargetSongs(songs);
      } else {
        setTargetSongs([]);
      }

      if (votesRes.ok) {
        const voteData =
          await votesRes.json();

        setMyVotes(voteData);
        setSavedVotes(voteData);
      } else {
        setMyVotes({});
        setSavedVotes({});
      }

      if (statsRes.ok) {
        const statsData =
          await statsRes.json();

        if (
          Array.isArray(
            statsData.usernames
          )
        ) {
          setTotalUserCount(
            statsData.usernames.length
          );
        }
      }

    } catch (err) {
      console.error(
        'Failed to load data for date:',
        err
      );

      setVoteError(
        'Failed to load the voting data.'
      );

    } finally {
      setIsLoadingSongs(false);
    }
  }, [
    selectedDate,
    currentUser,
    handleUnauthorized
  ]);

  useEffect(() => {
    if (currentUser) {
      fetchDataForDate();
    }
  }, [
    currentUser,
    selectedDate,
    fetchDataForDate
  ]);

  // ==========================================================
  // LOGGED OUT
  // ==========================================================

  if (!currentUser) {
    return (
      <div
        style={{
          textAlign: 'center',
          marginTop: '3rem',
          padding: '2rem',
          background: 'var(--bg-card)',
          borderRadius: '12px',
          border:
            '1px solid var(--border-color)'
        }}
      >
        <h2
          style={{
            marginBottom: '1rem'
          }}
        >
          Ready to vote?
        </h2>

        <p
          style={{
            color: 'var(--text-muted)',
            marginBottom: '1.5rem'
          }}
        >
          You must be logged in to submit
          tracks and cast your votes.
        </p>

        <button
          onClick={onGoToLogin}
          style={{
            background:
              'var(--accent-green)',
            color: '#000',
            border: 'none',
            padding:
              '0.8rem 2rem',
            borderRadius: '8px',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          Go to Login
        </button>
      </div>
    );
  }

  // ==========================================================
  // CURRENT USER'S SONG
  // ==========================================================

  const mySong = targetSongs.find(
    (song) =>
      Number(song.submitter_id) ===
      Number(currentUser.id)
  );

  // ==========================================================
  // SPOTIFY PREVIEW FOR NEW SUBMISSION
  // ==========================================================

  const handlePreview = async (e) => {
    e.preventDefault();

    if (!spotifyUrl) {
      return;
    }

    const token =
      localStorage.getItem('moosic_token');

    if (!token) {
      handleUnauthorized();
      return;
    }

    setSubmitStatus(null);
    setIsPreviewing(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/songs/fetch-metadata`,
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
            Authorization:
              `Bearer ${token}`
          },
          body: JSON.stringify({
            url: spotifyUrl
          })
        }
      );

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      const data =
        await response.json();

      if (response.ok) {
        setPreviewData(data);
      } else {
        setSubmitStatus(
          data.detail ||
          'Failed to fetch metadata.'
        );
      }

    } catch (err) {
      console.error(err);

      setSubmitStatus(
        'Error connecting to Spotify.'
      );

    } finally {
      setIsPreviewing(false);
    }
  };

  // ==========================================================
  // CREATE NEW SONG
  // ==========================================================

  const handleDatabaseSubmit = async () => {
    if (!previewData) {
      return;
    }

    const token =
      localStorage.getItem('moosic_token');

    if (!token) {
      handleUnauthorized();
      return;
    }

    setSubmitStatus(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/songs`,
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
            Authorization:
              `Bearer ${token}`
          },
          body: JSON.stringify({
            title:
              previewData.title,
            artist:
              previewData.artist,

            spotify_url:
              previewData.spotify_url ||
              spotifyUrl,

            spotify_track_id:
              previewData.spotify_track_id ||
              null,

            submission_date:
              selectedDate
          })
        }
      );

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      const data =
        await response.json();

      if (response.ok) {
        setSubmitStatus(
          `Success! "${data.title}" added for ${selectedDate}.`
        );

        setSpotifyUrl('');
        setPreviewData(null);

        await fetchDataForDate();

      } else {
        setSubmitStatus(
          data.detail ||
          'Error saving track.'
        );
      }

    } catch (err) {
      console.error(err);

      setSubmitStatus(
        'Error saving track.'
      );
    }
  };

  // ==========================================================
  // BEGIN EDITING
  // ==========================================================

  const startEditingSong = (song) => {
    setEditingSong(song);

    setEditSpotifyUrl(
      song.spotify_url || ''
    );

    setEditPreviewData({
      title: song.title,
      artist: song.artist,
      cover_art_url: null,
      spotify_url:
        song.spotify_url || '',
      spotify_track_id:
        song.spotify_track_id || null
    });

    setSubmitStatus(null);
  };

  const cancelEditingSong = () => {
    setEditingSong(null);
    setEditSpotifyUrl('');
    setEditPreviewData(null);
    setSubmitStatus(null);
  };

  // ==========================================================
  // PREVIEW EDITED SPOTIFY TRACK
  // ==========================================================

  const handleEditPreview = async (e) => {
    e.preventDefault();

    if (!editSpotifyUrl) {
      return;
    }

    const token =
      localStorage.getItem('moosic_token');

    if (!token) {
      handleUnauthorized();
      return;
    }

    setSubmitStatus(null);
    setIsPreviewingEdit(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/songs/fetch-metadata`,
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
            Authorization:
              `Bearer ${token}`
          },
          body: JSON.stringify({
            url: editSpotifyUrl
          })
        }
      );

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      const data =
        await response.json();

      if (response.ok) {
        setEditPreviewData(data);
      } else {
        setSubmitStatus(
          data.detail ||
          'Failed to fetch metadata.'
        );
      }

    } catch (err) {
      console.error(err);

      setSubmitStatus(
        'Error connecting to Spotify.'
      );

    } finally {
      setIsPreviewingEdit(false);
    }
  };

  // ==========================================================
  // SAVE EDIT
  // ==========================================================

  const handleUpdateSong = async () => {
    if (
      !editingSong ||
      !editPreviewData
    ) {
      return;
    }

    const token =
      localStorage.getItem('moosic_token');

    if (!token) {
      handleUnauthorized();
      return;
    }

    setIsUpdatingSong(true);
    setSubmitStatus(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/songs/${editingSong.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type':
              'application/json',
            Authorization:
              `Bearer ${token}`
          },
          body: JSON.stringify({
            title:
              editPreviewData.title,

            artist:
              editPreviewData.artist,

            spotify_url:
              editPreviewData.spotify_url ||
              editSpotifyUrl,

            spotify_track_id:
              editPreviewData.spotify_track_id ||
              null
          })
        }
      );

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      const data =
        await response.json();

      if (!response.ok) {
        setSubmitStatus(
          data.detail ||
          'Failed to update song.'
        );

        return;
      }

      if (data.votes_reset) {
        setSubmitStatus(
          'Song updated. Votes for the old song were reset.'
        );
      } else {
        setSubmitStatus(
          'Song updated successfully!'
        );
      }

      setEditingSong(null);
      setEditSpotifyUrl('');
      setEditPreviewData(null);

      await fetchDataForDate();

    } catch (err) {
      console.error(err);

      setSubmitStatus(
        'Error updating song.'
      );

    } finally {
      setIsUpdatingSong(false);
    }
  };

  // ==========================================================
  // VOTING
  // ==========================================================

  const handleScoreClick = (
    songId,
    score
  ) => {
    setVoteError(null);

    setMyVotes((prev) => {
      const currentAssignedScore =
        prev[songId];

      if (
        currentAssignedScore ===
        score
      ) {
        const updated = {
          ...prev
        };

        delete updated[songId];

        return updated;
      }

      const isScoreTakenElsewhere =
        Object.entries(prev).some(
          ([existingSongId, existingScore]) =>
            Number(existingSongId) !==
              Number(songId) &&
            existingScore === score
        );

      if (isScoreTakenElsewhere) {
        setVoteError(
          `Score ${score} is already assigned to another track.`
        );

        return prev;
      }

      return {
        ...prev,
        [songId]: score
      };
    });
  };

  const allSongsHaveScores =
    targetSongs.length > 0 &&
    targetSongs.every(
      (song) =>
        myVotes[song.id] !==
        undefined
    );

  const allSongsPosted =
    targetSongs.length ===
    totalUserCount;

  const hasChanges =
    JSON.stringify(myVotes) !==
    JSON.stringify(savedVotes);

  const hasExistingSaves =
    Object.keys(savedVotes).length >
    0;

  const canSubmit =
    allSongsPosted &&
    allSongsHaveScores &&
    (
      hasChanges ||
      !hasExistingSaves
    );

  // ==========================================================
  // SAVE VOTES
  // ==========================================================

  const handleSubmitBatchVotes =
    async () => {
      if (!canSubmit) {
        return;
      }

      const token =
        localStorage.getItem(
          'moosic_token'
        );

      if (!token) {
        handleUnauthorized();
        return;
      }

      setVoteError(null);
      setIsSubmittingVotes(true);

      try {
        for (const song of targetSongs) {
          const targetScore =
            myVotes[song.id];

          const previousScore =
            savedVotes[song.id];

          if (
            targetScore ===
            previousScore
          ) {
            continue;
          }

          let response;

          if (
            targetScore ===
            undefined
          ) {
            response = await fetch(
              `${import.meta.env.VITE_API_URL}/api/votes/${song.id}`,
              {
                method: 'DELETE',
                headers: {
                  Authorization:
                    `Bearer ${token}`
                }
              }
            );

          } else {
            response = await fetch(
              `${import.meta.env.VITE_API_URL}/api/votes`,
              {
                method: 'POST',
                headers: {
                  'Content-Type':
                    'application/json',
                  Authorization:
                    `Bearer ${token}`
                },
                body: JSON.stringify({
                  song_id:
                    song.id,
                  score:
                    targetScore
                })
              }
            );
          }

          if (
            response.status === 401
          ) {
            handleUnauthorized();
            return;
          }

          if (!response.ok) {
            const errorData =
              await response.json()
                .catch(() => ({}));

            throw new Error(
              errorData.detail ||
              'Failed to save votes.'
            );
          }
        }

        setSavedVotes({
          ...myVotes
        });

      } catch (err) {
        console.error(err);

        setVoteError(
          err.message ||
          'Failed to sync votes with server.'
        );

      } finally {
        setIsSubmittingVotes(false);
      }
    };

  const handleClearAllVotesLocally =
    () => {
      setMyVotes({});
      setVoteError(null);
    };

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '2rem'
      }}
    >
      {/* ==================================================== */}
      {/* DATE SELECTOR */}
      {/* ==================================================== */}

      <div
        style={{
          background:
            'var(--bg-card)',
          padding:
            '1.5rem 2rem',
          borderRadius:
            'var(--border-radius-lg)',
          border:
            '1px solid var(--border-color)',
          display: 'flex',
          justifyContent:
            'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem'
        }}
      >
        <div>
          <h2
            style={{
              fontSize: '1.3rem',
              margin: 0
            }}
          >
            Manage Day
          </h2>

          <p
            style={{
              color:
                'var(--text-muted)',
              fontSize: '0.85rem',
              margin:
                '0.2rem 0 0 0'
            }}
          >
            Select a past or present
            date to submit, edit, or
            vote.
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem'
          }}
        >
          <input
            type="date"
            value={selectedDate}
            onChange={(e) =>
              setSelectedDate(
                e.target.value
              )
            }
            style={{
              padding:
                '0.6rem 1rem',
              borderRadius: '8px',
              border:
                '1px solid var(--border-color)',
              background:
                'var(--bg-secondary)',
              color:
                'var(--text-main)',
              fontSize: '1rem',
              cursor: 'pointer'
            }}
          />

          <span
            style={{
              fontSize: '0.9rem',
              color:
                'var(--text-muted)'
            }}
          >
            As{' '}
            <strong
              style={{
                color:
                  'var(--text-main)'
              }}
            >
              {currentUser.username}
            </strong>
          </span>
        </div>
      </div>

      {/* ==================================================== */}
      {/* MY CURRENT SUBMISSION / NEW SUBMISSION */}
      {/* ==================================================== */}

      <div
        style={{
          background:
            'var(--bg-card)',
          padding: '2rem',
          borderRadius:
            'var(--border-radius-lg)',
          border:
            '1px solid var(--border-color)'
        }}
      >
        {mySong ? (
          <>
            <div
              style={{
                display: 'flex',
                justifyContent:
                  'space-between',
                alignItems:
                  'center',
                gap: '1rem',
                flexWrap:
                  'wrap'
              }}
            >
              <div>
                <h3
                  style={{
                    fontSize:
                      '1.1rem',
                    margin: 0
                  }}
                >
                  Your Song for{' '}
                  {selectedDate}
                </h3>

                <p
                  style={{
                    margin:
                      '0.5rem 0 0 0',
                    color:
                      'var(--text-muted)'
                  }}
                >
                  <strong
                    style={{
                      color:
                        'var(--text-main)'
                    }}
                  >
                    {mySong.title}
                  </strong>
                  {' — '}
                  {mySong.artist}
                </p>

                {mySong.spotify_url && (
                  <a
                    href={
                      mySong.spotify_url
                    }
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display:
                        'inline-block',
                      marginTop:
                        '0.5rem',
                      color:
                        'var(--accent-green)',
                      fontSize:
                        '0.85rem'
                    }}
                  >
                    Open in Spotify
                  </a>
                )}
              </div>

              <button
                onClick={() =>
                  startEditingSong(
                    mySong
                  )
                }
                style={{
                  background:
                    'transparent',
                  color:
                    'var(--accent-green)',
                  border:
                    '1px solid var(--accent-green)',
                  padding:
                    '0.6rem 1.2rem',
                  borderRadius:
                    '8px',
                  fontWeight:
                    'bold',
                  cursor:
                    'pointer'
                }}
              >
                Edit My Song
              </button>
            </div>
          </>
        ) : (
          <>
            <h3
              style={{
                fontSize:
                  '1.1rem',
                marginBottom:
                  '1rem'
              }}
            >
              Post Track for{' '}
              {selectedDate}
            </h3>

            <form
              onSubmit={
                handlePreview
              }
              style={{
                display: 'flex',
                gap: '1rem',
                flexWrap:
                  'wrap'
              }}
            >
              <input
                type="text"
                placeholder="Paste Spotify Link here..."
                value={
                  spotifyUrl
                }
                onChange={(e) =>
                  setSpotifyUrl(
                    e.target.value
                  )
                }
                style={{
                  flex: 1,
                  minWidth:
                    '250px',
                  padding:
                    '0.8rem 1rem',
                  borderRadius:
                    '8px',
                  border:
                    '1px solid var(--border-color)',
                  background:
                    'var(--bg-secondary)',
                  color:
                    'var(--text-main)',
                  fontSize:
                    '1rem'
                }}
                required
              />

              <button
                type="submit"
                disabled={
                  isPreviewing
                }
                style={{
                  background:
                    'var(--bg-secondary)',
                  color:
                    'var(--text-main)',
                  border:
                    '1px solid var(--border-color)',
                  padding:
                    '0 1.5rem',
                  borderRadius:
                    '8px',
                  fontWeight:
                    'bold',
                  cursor:
                    isPreviewing
                      ? 'not-allowed'
                      : 'pointer',
                  opacity:
                    isPreviewing
                      ? 0.6
                      : 1
                }}
              >
                {isPreviewing
                  ? 'Loading...'
                  : 'Preview'}
              </button>
            </form>

            {previewData && (
              <div
                style={{
                  marginTop:
                    '2rem',
                  display:
                    'flex',
                  justifyContent:
                    'space-between',
                  alignItems:
                    'center',
                  gap: '1rem',
                  flexWrap:
                    'wrap',
                  background:
                    'var(--bg-primary)',
                  padding:
                    '1.5rem',
                  borderRadius:
                    '12px',
                  border:
                    '1px solid var(--accent-green)'
                }}
              >
                <div
                  style={{
                    display:
                      'flex',
                    gap:
                      '1.5rem',
                    alignItems:
                      'center'
                  }}
                >
                  {previewData.cover_art_url && (
                    <img
                      src={
                        previewData.cover_art_url
                      }
                      alt="Album artwork"
                      style={{
                        width:
                          '80px',
                        height:
                          '80px',
                        borderRadius:
                          '8px',
                        objectFit:
                          'cover'
                      }}
                    />
                  )}

                  <div>
                    <h3
                      style={{
                        margin: 0,
                        fontSize:
                          '1.2rem'
                      }}
                    >
                      {
                        previewData.title
                      }
                    </h3>

                    <p
                      style={{
                        margin:
                          '0.3rem 0 0 0',
                        color:
                          'var(--text-muted)'
                      }}
                    >
                      {
                        previewData.artist
                      }
                    </p>

                    {previewData.album && (
                      <p
                        style={{
                          margin:
                            '0.25rem 0 0 0',
                          color:
                            'var(--text-muted)',
                          fontSize:
                            '0.8rem'
                        }}
                      >
                        {
                          previewData.album
                        }
                      </p>
                    )}
                  </div>
                </div>

                <button
                  onClick={
                    handleDatabaseSubmit
                  }
                  style={{
                    background:
                      'var(--accent-green)',
                    color: '#000',
                    border:
                      'none',
                    padding:
                      '0.8rem 2rem',
                    borderRadius:
                      '8px',
                    fontWeight:
                      'bold',
                    cursor:
                      'pointer'
                  }}
                >
                  Submit for{' '}
                  {selectedDate}
                </button>
              </div>
            )}
          </>
        )}

        {submitStatus && (
          <div
            style={{
              marginTop:
                '1.5rem',
              padding:
                '1rem',
              borderRadius:
                '8px',
              textAlign:
                'center',
              fontWeight:
                'bold',
              background:
                submitStatus.includes(
                  'Success'
                ) ||
                submitStatus.includes(
                  'successfully'
                )
                  ? 'rgba(46, 213, 115, 0.1)'
                  : 'rgba(255, 71, 87, 0.1)',
              color:
                submitStatus.includes(
                  'Success'
                ) ||
                submitStatus.includes(
                  'successfully'
                )
                  ? '#2ed573'
                  : '#ff4757'
            }}
          >
            {submitStatus}
          </div>
        )}
      </div>

      {/* ==================================================== */}
      {/* EDIT PANEL */}
      {/* ==================================================== */}

      {editingSong && (
        <div
          style={{
            background:
              'var(--bg-card)',
            padding: '2rem',
            borderRadius:
              'var(--border-radius-lg)',
            border:
              '1px solid var(--accent-green)'
          }}
        >
          <div
            style={{
              display:
                'flex',
              justifyContent:
                'space-between',
              alignItems:
                'center',
              gap: '1rem',
              marginBottom:
                '1.5rem'
            }}
          >
            <div>
              <h3
                style={{
                  fontSize:
                    '1.1rem',
                  margin: 0
                }}
              >
                Edit Your Song
              </h3>

              <p
                style={{
                  margin:
                    '0.4rem 0 0 0',
                  color:
                    'var(--text-muted)',
                  fontSize:
                    '0.85rem'
                }}
              >
                Replace it with a
                different Spotify
                track.
              </p>
            </div>

            <button
              onClick={
                cancelEditingSong
              }
              style={{
                background:
                  'transparent',
                color:
                  'var(--text-muted)',
                border:
                  '1px solid var(--border-color)',
                padding:
                  '0.4rem 0.8rem',
                borderRadius:
                  '6px',
                cursor:
                  'pointer'
              }}
            >
              Cancel
            </button>
          </div>

          <form
            onSubmit={
              handleEditPreview
            }
            style={{
              display:
                'flex',
              gap: '1rem',
              flexWrap:
                'wrap'
            }}
          >
            <input
              type="text"
              placeholder="Paste new Spotify link..."
              value={
                editSpotifyUrl
              }
              onChange={(e) =>
                setEditSpotifyUrl(
                  e.target.value
                )
              }
              style={{
                flex: 1,
                minWidth:
                  '250px',
                padding:
                  '0.8rem 1rem',
                borderRadius:
                  '8px',
                border:
                  '1px solid var(--border-color)',
                background:
                  'var(--bg-secondary)',
                color:
                  'var(--text-main)',
                fontSize:
                  '1rem'
              }}
              required
            />

            <button
              type="submit"
              disabled={
                isPreviewingEdit
              }
              style={{
                background:
                  'var(--bg-secondary)',
                color:
                  'var(--text-main)',
                border:
                  '1px solid var(--border-color)',
                padding:
                  '0 1.5rem',
                borderRadius:
                  '8px',
                fontWeight:
                  'bold',
                cursor:
                  isPreviewingEdit
                    ? 'not-allowed'
                    : 'pointer',
                opacity:
                  isPreviewingEdit
                    ? 0.6
                    : 1
              }}
            >
              {isPreviewingEdit
                ? 'Loading...'
                : 'Preview New Song'}
            </button>
          </form>

          {editPreviewData && (
            <div
              style={{
                marginTop:
                  '1.5rem',
                padding:
                  '1.5rem',
                background:
                  'var(--bg-primary)',
                borderRadius:
                  '12px'
              }}
            >
              <div
                style={{
                  display:
                    'flex',
                  justifyContent:
                    'space-between',
                  alignItems:
                    'center',
                  gap: '1rem',
                  flexWrap:
                    'wrap'
                }}
              >
                <div
                  style={{
                    display:
                      'flex',
                    gap:
                      '1rem',
                    alignItems:
                      'center'
                  }}
                >
                  {editPreviewData.cover_art_url && (
                    <img
                      src={
                        editPreviewData.cover_art_url
                      }
                      alt="New album artwork"
                      style={{
                        width:
                          '80px',
                        height:
                          '80px',
                        borderRadius:
                          '8px',
                        objectFit:
                          'cover'
                      }}
                    />
                  )}

                  <div>
                    <h3
                      style={{
                        margin: 0
                      }}
                    >
                      {
                        editPreviewData.title
                      }
                    </h3>

                    <p
                      style={{
                        margin:
                          '0.3rem 0 0 0',
                        color:
                          'var(--text-muted)'
                      }}
                    >
                      {
                        editPreviewData.artist
                      }
                    </p>

                    {editPreviewData.album && (
                      <p
                        style={{
                          margin:
                            '0.25rem 0 0 0',
                          color:
                            'var(--text-muted)',
                          fontSize:
                            '0.8rem'
                        }}
                      >
                        {
                          editPreviewData.album
                        }
                      </p>
                    )}
                  </div>
                </div>

                <button
                  onClick={
                    handleUpdateSong
                  }
                  disabled={
                    isUpdatingSong
                  }
                  style={{
                    background:
                      'var(--accent-green)',
                    color:
                      '#000',
                    border:
                      'none',
                    padding:
                      '0.8rem 1.5rem',
                    borderRadius:
                      '8px',
                    fontWeight:
                      'bold',
                    cursor:
                      isUpdatingSong
                        ? 'not-allowed'
                        : 'pointer',
                    opacity:
                      isUpdatingSong
                        ? 0.6
                        : 1
                  }}
                >
                  {isUpdatingSong
                    ? 'Saving...'
                    : 'Save Changes'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================================================== */}
      {/* VOTING PANEL */}
      {/* ==================================================== */}

      <div
        style={{
          background:
            'var(--bg-card)',
          padding: '2rem',
          borderRadius:
            'var(--border-radius-lg)',
          border:
            '1px solid var(--border-color)'
        }}
      >
        <div
          style={{
            display:
              'flex',
            justifyContent:
              'space-between',
            alignItems:
              'center',
            marginBottom:
              '1rem',
            flexWrap:
              'wrap',
            gap:
              '1rem'
          }}
        >
          <div>
            <h3
              style={{
                fontSize:
                  '1.1rem',
                margin: 0
              }}
            >
              Votes & Tracks for{' '}
              {selectedDate}{' '}
              (
              {targetSongs.length}/
              {totalUserCount}{' '}
              Songs Posted)
            </h3>

            <p
              style={{
                fontSize:
                  '0.85rem',
                color:
                  'var(--text-muted)',
                margin:
                  '0.2rem 0 0 0'
              }}
            >
              {!allSongsPosted
                ? `Waiting for all ${totalUserCount} managers to post their songs before voting can unlock.`
                : !allSongsHaveScores
                  ? 'Assign a unique score (1-5) to every track to unlock submission.'
                  : 'All songs scored. Ready to submit!'}
            </p>
          </div>

          <div
            style={{
              display:
                'flex',
              gap:
                '0.8rem'
            }}
          >
            {targetSongs.length >
              0 && (
              <button
                onClick={
                  handleClearAllVotesLocally
                }
                style={{
                  background:
                    'transparent',
                  color:
                    '#ff4757',
                  border:
                    '1px solid #ff4757',
                  padding:
                    '0.5rem 1rem',
                  borderRadius:
                    '8px',
                  fontWeight:
                    'bold',
                  cursor:
                    'pointer',
                  fontSize:
                    '0.85rem'
                }}
              >
                Clear Selection
              </button>
            )}

            <button
              onClick={
                handleSubmitBatchVotes
              }
              disabled={
                !canSubmit ||
                isSubmittingVotes
              }
              style={{
                background:
                  canSubmit
                    ? 'var(--accent-green)'
                    : 'var(--bg-secondary)',
                color:
                  canSubmit
                    ? '#000'
                    : 'var(--text-muted)',
                border:
                  '1px solid var(--border-color)',
                padding:
                  '0.5rem 1.5rem',
                borderRadius:
                  '8px',
                fontWeight:
                  'bold',
                cursor:
                  canSubmit &&
                  !isSubmittingVotes
                    ? 'pointer'
                    : 'not-allowed',
                opacity:
                  canSubmit
                    ? 1
                    : 0.6,
                fontSize:
                  '0.9rem',
                boxShadow:
                  canSubmit
                    ? '0 0 12px rgba(29, 185, 84, 0.3)'
                    : 'none'
              }}
            >
              {isSubmittingVotes
                ? 'Saving...'
                : hasExistingSaves &&
                    !hasChanges
                  ? 'Submitted'
                  : hasExistingSaves
                    ? 'Re-submit'
                    : 'Submit Votes'}
            </button>
          </div>
        </div>

        {voteError && (
          <div
            style={{
              marginBottom:
                '1.5rem',
              padding:
                '1rem',
              borderRadius:
                '8px',
              textAlign:
                'center',
              fontWeight:
                'bold',
              background:
                'rgba(255, 71, 87, 0.1)',
              color:
                '#ff4757'
            }}
          >
            {voteError}
          </div>
        )}

        {isLoadingSongs ? (
          <p
            style={{
              color:
                'var(--text-muted)',
              textAlign:
                'center'
            }}
          >
            Loading tracks...
          </p>
        ) : targetSongs.length ===
          0 ? (
          <p
            style={{
              color:
                'var(--text-muted)',
              textAlign:
                'center',
              padding:
                '1rem'
            }}
          >
            No tracks found for this
            date.
          </p>
        ) : (
          <div
            style={{
              display:
                'flex',
              flexDirection:
                'column',
              gap:
                '1.5rem'
            }}
          >
            {targetSongs.map(
              (song) => {
                const submitterColor =
                  getUserColor(
                    song.submittedBy
                  );

                const isMySong =
                  Number(
                    song.submitter_id
                  ) ===
                  Number(
                    currentUser.id
                  );

                return (
                  <div
                    key={
                      song.id
                    }
                    style={{
                      display:
                        'flex',
                      justifyContent:
                        'space-between',
                      alignItems:
                        'center',
                      borderBottom:
                        '1px solid var(--border-color)',
                      paddingBottom:
                        '1.5rem',
                      gap:
                        '1rem',
                      flexWrap:
                        'wrap'
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        minWidth:
                          '240px'
                      }}
                    >
                      <h3
                        style={{
                          fontSize:
                            '1.15rem',
                          margin: 0,
                          color:
                            submitterColor
                        }}
                      >
                        {song.title}
                      </h3>

                      <p
                        style={{
                          fontSize:
                            '0.9rem',
                          color:
                            'var(--text-muted)',
                          margin:
                            '0.3rem 0 0 0'
                        }}
                      >
                        {song.artist}

                        <span
                          style={{
                            opacity:
                              0.8,
                            marginLeft:
                              '0.5rem'
                          }}
                        >
                          • Submitted by{' '}
                          <strong
                            style={{
                              color:
                                submitterColor
                            }}
                          >
                            {
                              song.submittedBy
                            }
                          </strong>
                        </span>
                      </p>

                      <div
                        style={{
                          display:
                            'flex',
                          alignItems:
                            'center',
                          gap:
                            '0.8rem',
                          marginTop:
                            '0.6rem',
                          flexWrap:
                            'wrap'
                        }}
                      >
                        {song.spotify_url && (
                          <a
                            href={
                              song.spotify_url
                            }
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              color:
                                'var(--accent-green)',
                              fontSize:
                                '0.8rem',
                              textDecoration:
                                'none'
                            }}
                          >
                            Open in Spotify
                          </a>
                        )}

                        {isMySong && (
                          <button
                            onClick={() =>
                              startEditingSong(
                                song
                              )
                            }
                            style={{
                              background:
                                'transparent',
                              color:
                                'var(--accent-green)',
                              border:
                                '1px solid var(--accent-green)',
                              padding:
                                '0.3rem 0.7rem',
                              borderRadius:
                                '6px',
                              fontWeight:
                                'bold',
                              cursor:
                                'pointer',
                              fontSize:
                                '0.75rem'
                            }}
                          >
                            Edit My Song
                          </button>
                        )}
                      </div>
                    </div>

                    <div
                      style={{
                        display:
                          'flex',
                        gap:
                          '0.5rem'
                      }}
                    >
                      {[1, 2, 3, 4, 5].map(
                        (score) => {
                          const isSelected =
                            myVotes[
                              song.id
                            ] ===
                            score;

                          const baseColor =
                            getScoreColor(
                              score
                            );

                          return (
                            <button
                              key={
                                score
                              }
                              onClick={() =>
                                handleScoreClick(
                                  song.id,
                                  score
                                )
                              }
                              style={{
                                background:
                                  isSelected
                                    ? baseColor
                                    : 'transparent',
                                color:
                                  isSelected
                                    ? '#000'
                                    : baseColor,
                                border:
                                  `2px solid ${
                                    isSelected
                                      ? baseColor
                                      : `${baseColor}40`
                                  }`,
                                padding:
                                  '0.5rem 1rem',
                                borderRadius:
                                  '8px',
                                fontWeight:
                                  'bold',
                                fontSize:
                                  '1.1rem',
                                cursor:
                                  'pointer',
                                transition:
                                  'all 0.15s ease-in-out',
                                boxShadow:
                                  isSelected
                                    ? `0 0 12px ${baseColor}60`
                                    : 'none'
                              }}
                            >
                              {score}
                            </button>
                          );
                        }
                      )}
                    </div>
                  </div>
                );
              }
            )}
          </div>
        )}
      </div>
    </div>
  );
}
from fastapi import FastAPI, Depends
from sqlmodel import Session, select, create_engine
from migrate_history import User, Song, Vote
from datetime import date
from statistics import mean, stdev
from fastapi import HTTPException
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
from pydantic import BaseModel

# Connect to the local database we just created
sqlite_url = "sqlite:///moosic_local.db"
engine = create_engine(sqlite_url, connect_args={"check_same_thread": False})

app = FastAPI(title="Moosic Ranks API")

# Helper function to get the database session
def get_session():
    with Session(engine) as session:
        yield session

@app.get("/")
def read_root():
    return {"message": "Welcome to the Moosic Ranks API!"}

# Our first real endpoint: Fetching all players
@app.get("/api/users")
def get_users(session: Session = Depends(get_session)):
    users = session.exec(select(User)).all()
    return users

@app.get("/api/results/{target_date}")

def get_daily_results(target_date: date, session: Session = Depends(get_session)):
    # 1. Find all songs submitted on this specific date
    songs = session.exec(select(Song).where(Song.submission_date == target_date)).all()
    
    if not songs:
        return {"status": "empty", "message": "No songs were submitted on this day."}

    # 2. Determine how many votes are required (Total Active Users)
    # We query this dynamically so if you add a 6th friend later, the logic automatically adapts!
    total_users = len(session.exec(select(User)).all())
    
    results = []
    
    # 3. Check vote counts and calculate metrics
    for song in songs:
        votes = session.exec(select(Vote).where(Vote.song_id == song.id)).all()
        
        # THE GATEKEEPER: If any song is missing votes, stop and return pending status
        if len(votes) < total_users:
            return {
                "status": "pending",
                "message": f"Waiting on votes! '{song.title}' only has {len(votes)} out of {total_users} votes."
            }
            
        # If all votes are in, calculate the Excel-style metrics
        scores = [v.score for v in votes]
        avg_score = mean(scores)
        
        # Standard deviation requires at least 2 data points
        std_dev = stdev(scores) if len(scores) > 1 else 0.0 
        
        results.append({
            "song_id": song.id,
            "title": song.title,
            "artist": song.artist,
            "average": round(avg_score, 4),
            "stdev": round(std_dev, 4)
        })

    # 4. THE TIE-BREAKER LOGIC
    # Python's sort is brilliant here. We sort primary by "average", then secondary by "stdev".
    # Because 1 is the best score, we want ascending order (lowest numbers first).
    results.sort(key=lambda x: (x["average"], x["stdev"]))
    
    winner = results[0]

    return {
        "status": "complete",
        "date": target_date,
        "winner": winner,
        "leaderboard": results
    }

# You will set these as Environment Variables on Render later!
SPOTIPY_CLIENT_ID = '6146d5c225de42ff8e463bd8a627d14a'
SPOTIPY_CLIENT_SECRET = 'c9549ae97e2343719d12bb7abd6a0525'

# Initialize the Spotify client
spotify = spotipy.Spotify(client_credentials_manager=SpotifyClientCredentials(
    client_id=SPOTIPY_CLIENT_ID, 
    client_secret=SPOTIPY_CLIENT_SECRET
))

class SpotifyLink(BaseModel):
    url: str

@app.post("/api/songs/fetch-metadata")
def fetch_spotify_metadata(link: SpotifyLink):
    try:
        # Extract the track ID from the URL (e.g., https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT)
        track_id = link.url.split("/")[-1].split("?")[0]
        
        # Fetch the data from Spotify
        track_info = spotify.track(track_id)
        
        return {
            "title": track_info['name'],
            "artist": ", ".join([artist['name'] for artist in track_info['artists']]),
            "spotify_uri": track_info['uri'],
            "cover_art_url": track_info['album']['images'][0]['url'] if track_info['album']['images'] else None,
            "preview_url": track_info['preview_url'] # A 30-second audio clip if available!
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid Spotify URL or Track ID")
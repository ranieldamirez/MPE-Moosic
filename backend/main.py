import statistics
from datetime import datetime, date, timedelta
from typing import Optional
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl
from jose import JWTError, jwt
import bcrypt
from sqlmodel import SQLModel, Field, Session, create_engine, select
import os

SECRET_KEY = os.getenv("SECRET_KEY", "fallback-dev-key-for-local-testing")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 30

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

sqlite_file_name = "moosic_local.db"
sqlite_url = f"sqlite:///{sqlite_file_name}"
engine = create_engine(sqlite_url, connect_args={"check_same_thread": False})

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(unique=True, index=True)
    hashed_password: str

class Song(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    artist: str
    submitter_id: int
    submission_date: date

class Vote(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    song_id: int
    voter_id: int
    score: int

class SongCreate(BaseModel):
    title: str
    artist: str
    submitter_id: int
    submission_date: Optional[date] = None

class VoteCreate(BaseModel):
    song_id: int
    score: int

class ProfileUpdate(BaseModel):
    new_username: str
    new_password: Optional[str] = None

class SpotifyUrlRequest(BaseModel):
    url: HttpUrl

def get_session():
    with Session(engine) as session:
        yield session

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def verify_password(plain_password, hashed_password):
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_password_hash(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login")

def get_current_user(token: str = Depends(oauth2_scheme), session: Session = Depends(get_session)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = session.exec(select(User).where(User.username == username)).first()
    if user is None:
        raise credentials_exception
    return user

@app.on_event("startup")
def on_startup():
    SQLModel.metadata.create_all(engine)

@app.post("/api/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.username == form_data.username)).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    
    access_token = create_access_token(data={"sub": user.username})
    return {
        "access_token": access_token, 
        "token_type": "bearer", 
        "user_id": user.id, 
        "username": user.username
    }

@app.put("/api/users/update-profile")
def update_profile(update_data: ProfileUpdate, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    current_user.username = update_data.new_username
    if update_data.new_password:
        current_user.hashed_password = get_password_hash(update_data.new_password)
    
    session.add(current_user)
    session.commit()
    
    new_token = create_access_token(data={"sub": current_user.username})
    return {"status": "success", "message": "Profile updated!", "access_token": new_token, "username": current_user.username}

@app.get("/api/songs/daily/{target_date}")
def get_daily_songs(target_date: date, session: Session = Depends(get_session)):
    songs = session.exec(select(Song).where(Song.submission_date == target_date)).all()
    users = session.exec(select(User)).all()
    id_to_username = {u.id: u.username for u in users}
    
    result = []
    for s in songs:
        result.append({
            "id": s.id,
            "title": s.title,
            "artist": s.artist,
            "submitter_id": s.submitter_id,
            "submittedBy": id_to_username.get(s.submitter_id, "Unknown"),
            "submission_date": s.submission_date
        })
    return result

@app.get("/api/votes/me/{target_date}")
def get_my_votes_for_date(target_date: date, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    songs = session.exec(select(Song).where(Song.submission_date == target_date)).all()
    song_ids = [s.id for s in songs]
    
    if not song_ids:
        return {}
        
    votes = session.exec(
        select(Vote).where(Vote.voter_id == current_user.id, Vote.song_id.in_(song_ids))
    ).all()
    
    return {v.song_id: v.score for v in votes}

@app.post("/api/songs/fetch-metadata")
def fetch_spotify_metadata(req: SpotifyUrlRequest):
    return {
        "title": "Sample Track",
        "artist": "Sample Artist",
        "cover_art_url": "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&h=300&fit=crop"
    }

@app.post("/api/songs")
def create_song(song_in: SongCreate, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    target_date = song_in.submission_date if song_in.submission_date else date.today()
    
    existing = session.exec(
        select(Song).where(Song.submitter_id == song_in.submitter_id, Song.submission_date == target_date)
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="User has already submitted a song for this date.")
        
    db_song = Song(
        title=song_in.title,
        artist=song_in.artist,
        submitter_id=song_in.submitter_id,
        submission_date=target_date
    )
    session.add(db_song)
    session.commit()
    session.refresh(db_song)
    return db_song

@app.post("/api/votes")
def cast_vote(vote: VoteCreate, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    target_song = session.get(Song, vote.song_id)
    if not target_song:
        raise HTTPException(status_code=404, detail="Song not found")
    
    date_songs = session.exec(select(Song).where(Song.submission_date == target_song.submission_date)).all()
    date_song_ids = [s.id for s in date_songs]
    
    if date_song_ids:
        existing_score_vote = session.exec(
            select(Vote).where(
                Vote.voter_id == current_user.id,
                Vote.score == vote.score,
                Vote.song_id.in_(date_song_ids),
                Vote.song_id != vote.song_id
            )
        ).first()
        
        if existing_score_vote:
            raise HTTPException(status_code=400, detail=f"Score {vote.score} is already assigned to another track on this day.")

    existing_vote = session.exec(
        select(Vote).where(Vote.song_id == vote.song_id, Vote.voter_id == current_user.id)
    ).first()
    
    if existing_vote:
        existing_vote.score = vote.score
        session.add(existing_vote)
    else:
        new_vote = Vote(song_id=vote.song_id, voter_id=current_user.id, score=vote.score)
        session.add(new_vote)
        
    session.commit()
    return {"status": "success", "message": "Vote recorded"}

@app.delete("/api/votes/{song_id}")
def delete_vote(song_id: int, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    existing_vote = session.exec(
        select(Vote).where(Vote.song_id == song_id, Vote.voter_id == current_user.id)
    ).first()
    
    if existing_vote:
        session.delete(existing_vote)
        session.commit()
        
    return {"status": "success", "message": "Vote removed"}

@app.delete("/api/votes/date/{target_date}")
def clear_date_votes(target_date: date, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    songs = session.exec(select(Song).where(Song.submission_date == target_date)).all()
    song_ids = [s.id for s in songs]
    
    if song_ids:
        votes_to_delete = session.exec(
            select(Vote).where(Vote.voter_id == current_user.id, Vote.song_id.in_(song_ids))
        ).all()
        for v in votes_to_delete:
            session.delete(v)
        session.commit()
        
    return {"status": "success", "message": "All votes cleared"}

@app.get("/api/stats")
def get_global_stats(days: int = 28, session: Session = Depends(get_session)):
    users = session.exec(select(User)).all()
    songs = session.exec(select(Song)).all()
    votes = session.exec(select(Vote)).all()

    usernames = [u.username for u in users]
    id_to_username = {u.id: u.username for u in users}
    
    votes_by_song = {s.id: [] for s in songs}
    for v in votes:
        if v.song_id in votes_by_song:
            votes_by_song[v.song_id].append(v)

    songs_by_date = {}
    for s in songs:
        songs_by_date.setdefault(s.submission_date, []).append(s)

    sorted_dates = sorted(list(songs_by_date.keys()))
    
    cumulative_wins = {u.username: 0 for u in users}
    chart_data = []
    
    user_place_counts = {u.username: {1: 0, 2: 0, 3: 0, 4: 0, 5: 0} for u in users}
    user_sum_avg = {u.username: 0.0 for u in users}
    user_submissions = {u.username: 0 for u in users}

    for d in sorted_dates:
        day_songs = songs_by_date[d]
        day_results = []
        for s in day_songs:
            song_votes = votes_by_song[s.id]
            if len(song_votes) == len(users):
                scores = [v.score for v in song_votes]
                avg = sum(scores) / len(scores) if scores else 0
                stdev = statistics.stdev(scores) if len(scores) > 1 else 0
                day_results.append({
                    "submitter": id_to_username[s.submitter_id],
                    "average": avg,
                    "stdev": stdev
                })
        
        if len(day_results) == len(day_songs) and len(day_songs) > 0:
            day_results.sort(key=lambda x: (x["average"], x["stdev"]))
            winner = day_results[0]["submitter"]
            cumulative_wins[winner] += 1
            
            data_point = {"date": d.isoformat()}
            data_point.update(cumulative_wins)
            chart_data.append(data_point)
            
            for rank, res in enumerate(day_results):
                place = rank + 1
                submitter = res["submitter"]
                user_place_counts[submitter][place] += 1
                user_sum_avg[submitter] += res["average"]
                user_submissions[submitter] += 1

    manager_stats = []
    for u in users:
        uname = u.username
        wins = cumulative_wins[uname]
        sum_avg = user_sum_avg[uname]
        subs = user_submissions[uname]
        overall_avg = (sum_avg / subs) if subs > 0 else 0.0
        
        manager_stats.append({
            "manager": uname,
            "wins": wins,
            "sum_avg": round(sum_avg, 2),
            "overall_avg": round(overall_avg, 2)
        })
    manager_stats.sort(key=lambda x: x["wins"], reverse=True)
    
    for idx, stat in enumerate(manager_stats):
        stat["place"] = idx + 1

    target_dates = sorted_dates[-days:] if days > 0 else sorted_dates
    raw_matrix = {p: {v: [] for v in usernames} for p in usernames}
    
    for d in target_dates:
        for s in songs_by_date[d]:
            poster = id_to_username[s.submitter_id]
            for v in votes_by_song[s.id]:
                voter = id_to_username[v.voter_id]
                raw_matrix[poster][voter].append(v.score)

    matrices = {
        "average": {p: {} for p in usernames},
        "median": {p: {} for p in usernames},
        "stdev": {p: {} for p in usernames},
        "mode": {p: {} for p in usernames},
        "best": {p: {} for p in usernames},
        "worst": {p: {} for p in usernames},
    }

    def safe_mode(lst):
        try: return statistics.mode(lst)
        except: return lst[0] if lst else 0

    for p in usernames:
        for v in usernames:
            scores = raw_matrix[p][v]
            if scores:
                matrices["average"][p][v] = round(sum(scores) / len(scores), 2)
                matrices["median"][p][v] = round(statistics.median(scores), 2)
                matrices["stdev"][p][v] = round(statistics.stdev(scores), 2) if len(scores) > 1 else 0.0
                matrices["mode"][p][v] = round(safe_mode(scores), 2)
                matrices["best"][p][v] = round(min(scores), 2)
                matrices["worst"][p][v] = round(max(scores), 2)
            else:
                for k in matrices:
                    matrices[k][p][v] = 0.0

    return {
        "chart_data": chart_data,
        "manager_stats": manager_stats,
        "rank_counts": user_place_counts,
        "matrices": matrices,
        "usernames": usernames
    }
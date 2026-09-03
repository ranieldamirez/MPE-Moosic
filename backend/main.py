import os
import re
import statistics
from datetime import datetime, date, timedelta
from typing import Optional

import bcrypt
import httpx

from fastapi import (
    FastAPI,
    Depends,
    HTTPException,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import (
    OAuth2PasswordBearer,
    OAuth2PasswordRequestForm,
)

from jose import JWTError, jwt
from pydantic import BaseModel, HttpUrl
from sqlalchemy import inspect, text
from sqlmodel import (
    SQLModel,
    Field,
    Session,
    create_engine,
    select,
)


# ============================================================
# CONFIGURATION
# ============================================================

from dotenv import load_dotenv

load_dotenv()


SECRET_KEY = os.getenv(
    "SECRET_KEY",
    "fallback-dev-key-for-local-testing",
)

ALGORITHM = "HS256"

ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 30

SPOTIFY_CLIENT_ID = os.getenv(
    "SPOTIFY_CLIENT_ID"
)

SPOTIFY_CLIENT_SECRET = os.getenv(
    "SPOTIFY_CLIENT_SECRET"
)

SPOTIFY_MARKET = os.getenv(
    "SPOTIFY_MARKET",
    "US",
)


# ============================================================
# FASTAPI APP
# ============================================================

app = FastAPI()


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# DATABASE
# ============================================================

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///moosic_local.db",
)

# Some hosted Postgres services use postgres://
# while SQLAlchemy expects postgresql://

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace(
        "postgres://",
        "postgresql://",
        1,
    )


# SQLite requires check_same_thread=False.
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL,
        connect_args={
            "check_same_thread": False,
        },
    )
else:
    engine = create_engine(
        DATABASE_URL,
    )


# ============================================================
# DATABASE MODELS
# ============================================================

class User(SQLModel, table=True):
    id: Optional[int] = Field(
        default=None,
        primary_key=True,
    )

    username: str = Field(
        unique=True,
        index=True,
    )

    hashed_password: str


class Song(SQLModel, table=True):
    id: Optional[int] = Field(
        default=None,
        primary_key=True,
    )

    title: str

    artist: str

    submitter_id: int

    submission_date: date

    # Spotify information
    spotify_url: Optional[str] = None

    spotify_track_id: Optional[str] = None


class Vote(SQLModel, table=True):
    id: Optional[int] = Field(
        default=None,
        primary_key=True,
    )

    song_id: int

    voter_id: int

    score: int


# ============================================================
# REQUEST MODELS
# ============================================================

class SongCreate(BaseModel):
    title: str
    artist: str

    spotify_url: Optional[str] = None
    spotify_track_id: Optional[str] = None

    submission_date: Optional[date] = None


class SongUpdate(BaseModel):
    title: str
    artist: str

    spotify_url: Optional[str] = None
    spotify_track_id: Optional[str] = None


class VoteCreate(BaseModel):
    song_id: int
    score: int


class ProfileUpdate(BaseModel):
    new_username: str
    new_password: Optional[str] = None


class SpotifyUrlRequest(BaseModel):
    url: HttpUrl


# ============================================================
# DATABASE SESSION
# ============================================================

def get_session():
    with Session(engine) as session:
        yield session


# ============================================================
# DATABASE MIGRATION / SETUP
# ============================================================

def ensure_database_columns():
    """
    SQLModel.metadata.create_all() creates missing tables,
    but it does not add new columns to an existing table.

    This function adds the Spotify columns to existing
    installations automatically.
    """

    inspector = inspect(engine)

    if not inspector.has_table("song"):
        return

    existing_columns = {
        column["name"]
        for column in inspector.get_columns("song")
    }

    backend = engine.url.get_backend_name()

    with engine.begin() as connection:
        if "spotify_url" not in existing_columns:
            if backend == "postgresql":
                connection.execute(
                    text(
                        "ALTER TABLE song "
                        "ADD COLUMN IF NOT EXISTS "
                        "spotify_url TEXT"
                    )
                )
            else:
                connection.execute(
                    text(
                        "ALTER TABLE song "
                        "ADD COLUMN spotify_url TEXT"
                    )
                )

        if "spotify_track_id" not in existing_columns:
            if backend == "postgresql":
                connection.execute(
                    text(
                        "ALTER TABLE song "
                        "ADD COLUMN IF NOT EXISTS "
                        "spotify_track_id TEXT"
                    )
                )
            else:
                connection.execute(
                    text(
                        "ALTER TABLE song "
                        "ADD COLUMN spotify_track_id TEXT"
                    )
                )


# ============================================================
# AUTHENTICATION HELPERS
# ============================================================

def create_access_token(data: dict):
    to_encode = data.copy()

    expire = (
        datetime.utcnow()
        + timedelta(
            minutes=ACCESS_TOKEN_EXPIRE_MINUTES
        )
    )

    to_encode.update(
        {
            "exp": expire,
        }
    )

    return jwt.encode(
        to_encode,
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


def verify_password(
    plain_password,
    hashed_password,
):
    return bcrypt.checkpw(
        plain_password.encode("utf-8"),
        hashed_password.encode("utf-8"),
    )


def get_password_hash(password):
    return bcrypt.hashpw(
        password.encode("utf-8"),
        bcrypt.gensalt(),
    ).decode("utf-8")


oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/login",
)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: Session = Depends(get_session),
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={
            "WWW-Authenticate": "Bearer",
        },
    )

    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
        )

        username: str = payload.get("sub")

        if username is None:
            raise credentials_exception

    except JWTError:
        raise credentials_exception

    user = session.exec(
        select(User).where(
            User.username == username
        )
    ).first()

    if user is None:
        raise credentials_exception

    return user


# ============================================================
# SPOTIFY HELPERS
# ============================================================

def extract_spotify_track_id(
    url: str,
) -> str:
    """
    Supports:

    https://open.spotify.com/track/TRACK_ID
    https://open.spotify.com/track/TRACK_ID?si=...
    spotify:track:TRACK_ID
    """

    spotify_uri_match = re.match(
        r"^spotify:track:([A-Za-z0-9]+)$",
        url,
    )

    if spotify_uri_match:
        return spotify_uri_match.group(1)

    spotify_web_match = re.search(
        r"open\.spotify\.com/track/([A-Za-z0-9]+)",
        url,
    )

    if spotify_web_match:
        return spotify_web_match.group(1)

    raise HTTPException(
        status_code=400,
        detail=(
            "Invalid Spotify track URL. "
            "Please paste a Spotify track link."
        ),
    )


def get_spotify_access_token() -> str:
    """
    Uses Spotify's Client Credentials flow.
    """

    if (
        not SPOTIFY_CLIENT_ID
        or not SPOTIFY_CLIENT_SECRET
    ):
        raise HTTPException(
            status_code=500,
            detail=(
                "Spotify API credentials are not "
                "configured on the server."
            ),
        )

    try:
        response = httpx.post(
            "https://accounts.spotify.com/api/token",
            data={
                "grant_type": "client_credentials",
            },
            auth=(
                SPOTIFY_CLIENT_ID,
                SPOTIFY_CLIENT_SECRET,
            ),
            timeout=10.0,
        )

    except httpx.RequestError:
        raise HTTPException(
            status_code=502,
            detail=(
                "Unable to connect to Spotify."
            ),
        )

    if response.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=(
                "Spotify authentication failed."
            ),
        )

    data = response.json()

    access_token = data.get(
        "access_token"
    )

    if not access_token:
        raise HTTPException(
            status_code=502,
            detail=(
                "Spotify did not return "
                "an access token."
            ),
        )

    return access_token


# ============================================================
# STARTUP
# ============================================================

@app.on_event("startup")
def on_startup():
    SQLModel.metadata.create_all(
        engine
    )

    ensure_database_columns()


# ============================================================
# LOGIN
# ============================================================

@app.post("/api/login")
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: Session = Depends(
        get_session
    ),
):
    user = session.exec(
        select(User).where(
            User.username ==
            form_data.username
        )
    ).first()

    if (
        not user
        or not verify_password(
            form_data.password,
            user.hashed_password,
        )
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Incorrect username or password"
            ),
        )

    access_token = create_access_token(
        data={
            "sub": user.username,
        }
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user_id": user.id,
        "username": user.username,
    }


# ============================================================
# PROFILE UPDATE
# ============================================================

@app.put("/api/users/update-profile")
def update_profile(
    update_data: ProfileUpdate,
    current_user: User = Depends(
        get_current_user
    ),
    session: Session = Depends(
        get_session
    ),
):
    # Don't allow the username to collide with another account.
    existing_user = session.exec(
        select(User).where(
            User.username ==
            update_data.new_username
        )
    ).first()

    if (
        existing_user
        and existing_user.id != current_user.id
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Username is already taken."
            ),
        )

    current_user.username = (
        update_data.new_username
    )

    if update_data.new_password:
        current_user.hashed_password = (
            get_password_hash(
                update_data.new_password
            )
        )

    session.add(current_user)
    session.commit()

    new_token = create_access_token(
        data={
            "sub":
                current_user.username,
        }
    )

    return {
        "status": "success",
        "message": "Profile updated!",
        "access_token": new_token,
        "username":
            current_user.username,
    }


# ============================================================
# DAILY SONGS
# ============================================================

@app.get("/api/songs/daily/{target_date}")
def get_daily_songs(
    target_date: date,
    session: Session = Depends(
        get_session
    ),
):
    songs = session.exec(
        select(Song).where(
            Song.submission_date ==
            target_date
        )
    ).all()

    users = session.exec(
        select(User)
    ).all()

    id_to_username = {
        u.id: u.username
        for u in users
    }

    result = []

    for song in songs:
        result.append(
            {
                "id": song.id,
                "title": song.title,
                "artist": song.artist,
                "submitter_id":
                    song.submitter_id,
                "submittedBy":
                    id_to_username.get(
                        song.submitter_id,
                        "Unknown",
                    ),
                "submission_date":
                    song.submission_date,
                "spotify_url":
                    song.spotify_url,
                "spotify_track_id":
                    song.spotify_track_id,
            }
        )

    return result


# ============================================================
# CURRENT USER'S VOTES
# ============================================================

@app.get("/api/votes/me/{target_date}")
def get_my_votes_for_date(
    target_date: date,
    current_user: User = Depends(
        get_current_user
    ),
    session: Session = Depends(
        get_session
    ),
):
    songs = session.exec(
        select(Song).where(
            Song.submission_date ==
            target_date
        )
    ).all()

    song_ids = [
        song.id
        for song in songs
    ]

    if not song_ids:
        return {}

    votes = session.exec(
        select(Vote).where(
            Vote.voter_id ==
                current_user.id,
            Vote.song_id.in_(
                song_ids
            ),
        )
    ).all()

    return {
        vote.song_id: vote.score
        for vote in votes
    }


# ============================================================
# SPOTIFY METADATA
# ============================================================

@app.post("/api/songs/fetch-metadata")
def fetch_spotify_metadata(
    req: SpotifyUrlRequest,
    current_user: User = Depends(get_current_user),
):
    try:
        print("=== SPOTIFY DEBUG START ===")
        print("Incoming URL:", str(req.url))
        print(
            "Client ID configured:",
            bool(SPOTIFY_CLIENT_ID)
        )
        print(
            "Client Secret configured:",
            bool(SPOTIFY_CLIENT_SECRET)
        )

        spotify_url = str(req.url)

        track_id = extract_spotify_track_id(
            spotify_url
        )

        print("Extracted track ID:", track_id)

        access_token = get_spotify_access_token()

        print(
            "Spotify access token obtained:",
            bool(access_token)
        )

        response = httpx.get(
            f"https://api.spotify.com/v1/tracks/{track_id}",
            headers={
                "Authorization":
                    f"Bearer {access_token}"
            },
            params={
                "market":
                    SPOTIFY_MARKET
            },
            timeout=10.0
        )

        print(
            "Spotify track response:",
            response.status_code
        )

        print(
            "Spotify response:",
            response.text[:1000]
        )

        if response.status_code == 401:
            raise HTTPException(
                status_code=502,
                detail="Spotify authorization was rejected."
            )

        if response.status_code == 403:
            raise HTTPException(
                status_code=403,
                detail="Spotify denied access to this track."
            )

        if response.status_code == 404:
            raise HTTPException(
                status_code=404,
                detail="Spotify track not found."
            )

        if response.status_code == 429:
            raise HTTPException(
                status_code=429,
                detail="Spotify is temporarily rate limiting requests."
            )

        if response.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail=(
                    f"Spotify returned HTTP "
                    f"{response.status_code}."
                )
            )

        track = response.json()

        artists = track.get("artists") or []

        artist_names = ", ".join(
            artist.get("name", "")
            for artist in artists
            if artist.get("name")
        )

        album = track.get("album") or {}

        album_images = (
            album.get("images") or []
        )

        cover_art_url = (
            album_images[0].get("url")
            if album_images
            else None
        )

        print("Track name:", track.get("name"))
        print("Artist:", artist_names)
        print("=== SPOTIFY DEBUG END ===")

        return {
            "title": track.get("name"),
            "artist": artist_names,
            "cover_art_url": cover_art_url,
            "spotify_url": spotify_url,
            "spotify_track_id": track_id,
            "album": album.get("name"),
            "duration_ms": track.get("duration_ms"),
            "external_url": (
                track.get("external_urls", {})
                .get("spotify")
            ),
        }

    except HTTPException:
        raise

    except Exception as e:
        print("=== SPOTIFY UNEXPECTED ERROR ===")
        print(type(e).__name__)
        print(str(e))
        print("================================")

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )

# ============================================================
# CREATE SONG
# ============================================================

@app.post("/api/songs")
def create_song(
    song_in: SongCreate,
    current_user: User = Depends(
        get_current_user
    ),
    session: Session = Depends(
        get_session
    ),
):
    target_date = (
        song_in.submission_date
        if song_in.submission_date
        else date.today()
    )

    # IMPORTANT:
    # Ownership comes from the JWT, NOT from
    # anything supplied by the browser.

    existing = session.exec(
        select(Song).where(
            Song.submitter_id ==
                current_user.id,
            Song.submission_date ==
                target_date,
        )
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail=(
                "You have already submitted "
                "a song for this date. "
                "Edit your existing submission instead."
            ),
        )

    db_song = Song(
        title=song_in.title,
        artist=song_in.artist,
        submitter_id=current_user.id,
        submission_date=target_date,
        spotify_url=
            song_in.spotify_url,
        spotify_track_id=
            song_in.spotify_track_id,
    )

    session.add(db_song)
    session.commit()
    session.refresh(db_song)

    return db_song


# ============================================================
# EDIT SONG
# ============================================================

@app.put("/api/songs/{song_id}")
def update_song(
    song_id: int,
    song_in: SongUpdate,
    current_user: User = Depends(
        get_current_user
    ),
    session: Session = Depends(
        get_session
    ),
):
    song = session.get(
        Song,
        song_id
    )

    if not song:
        raise HTTPException(
            status_code=404,
            detail="Song not found.",
        )

    # Only the person who submitted this song
    # may edit it.

    if (
        song.submitter_id !=
        current_user.id
    ):
        raise HTTPException(
            status_code=403,
            detail=(
                "You can only edit your own song."
            ),
        )

    # If the actual Spotify track changed,
    # existing votes are no longer valid because
    # they were votes for the old song.
    track_changed = (
        song.spotify_track_id !=
        song_in.spotify_track_id
    )

    if track_changed:
        existing_votes = session.exec(
            select(Vote).where(
                Vote.song_id ==
                song.id
            )
        ).all()

        for vote in existing_votes:
            session.delete(vote)

    song.title = song_in.title
    song.artist = song_in.artist
    song.spotify_url = (
        song_in.spotify_url
    )
    song.spotify_track_id = (
        song_in.spotify_track_id
    )

    session.add(song)
    session.commit()
    session.refresh(song)

    return {
        "id": song.id,
        "title": song.title,
        "artist": song.artist,
        "submitter_id":
            song.submitter_id,
        "submission_date":
            song.submission_date,
        "spotify_url":
            song.spotify_url,
        "spotify_track_id":
            song.spotify_track_id,
        "votes_reset":
            track_changed,
    }


# ============================================================
# CAST / UPDATE VOTE
# ============================================================

@app.post("/api/votes")
def cast_vote(
    vote: VoteCreate,
    current_user: User = Depends(
        get_current_user
    ),
    session: Session = Depends(
        get_session
    ),
):
    # Validate the score server-side.
    if vote.score < 1 or vote.score > 5:
        raise HTTPException(
            status_code=400,
            detail=(
                "Score must be between 1 and 5."
            ),
        )

    target_song = session.get(
        Song,
        vote.song_id
    )

    if not target_song:
        raise HTTPException(
            status_code=404,
            detail="Song not found",
        )

    date_songs = session.exec(
        select(Song).where(
            Song.submission_date ==
            target_song.submission_date
        )
    ).all()

    date_song_ids = [
        song.id
        for song in date_songs
    ]

    if date_song_ids:
        existing_score_vote = session.exec(
            select(Vote).where(
                Vote.voter_id ==
                    current_user.id,
                Vote.score ==
                    vote.score,
                Vote.song_id.in_(
                    date_song_ids
                ),
                Vote.song_id !=
                    vote.song_id,
            )
        ).first()

        if existing_score_vote:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Score {vote.score} is "
                    "already assigned to another "
                    "track on this day."
                ),
            )

    existing_vote = session.exec(
        select(Vote).where(
            Vote.song_id ==
                vote.song_id,
            Vote.voter_id ==
                current_user.id,
        )
    ).first()

    if existing_vote:
        existing_vote.score = (
            vote.score
        )

        session.add(existing_vote)

    else:
        new_vote = Vote(
            song_id=vote.song_id,
            voter_id=current_user.id,
            score=vote.score,
        )

        session.add(new_vote)

    session.commit()

    return {
        "status": "success",
        "message": "Vote recorded",
    }


# ============================================================
# DELETE ONE VOTE
# ============================================================

@app.delete("/api/votes/{song_id}")
def delete_vote(
    song_id: int,
    current_user: User = Depends(
        get_current_user
    ),
    session: Session = Depends(
        get_session
    ),
):
    existing_vote = session.exec(
        select(Vote).where(
            Vote.song_id ==
                song_id,
            Vote.voter_id ==
                current_user.id,
        )
    ).first()

    if existing_vote:
        session.delete(
            existing_vote
        )

        session.commit()

    return {
        "status": "success",
        "message": "Vote removed",
    }


# ============================================================
# DELETE ALL VOTES FOR DATE
# ============================================================

@app.delete("/api/votes/date/{target_date}")
def clear_date_votes(
    target_date: date,
    current_user: User = Depends(
        get_current_user
    ),
    session: Session = Depends(
        get_session
    ),
):
    songs = session.exec(
        select(Song).where(
            Song.submission_date ==
            target_date
        )
    ).all()

    song_ids = [
        song.id
        for song in songs
    ]

    if song_ids:
        votes_to_delete = session.exec(
            select(Vote).where(
                Vote.voter_id ==
                    current_user.id,
                Vote.song_id.in_(
                    song_ids
                ),
            )
        ).all()

        for vote in votes_to_delete:
            session.delete(vote)

        session.commit()

    return {
        "status": "success",
        "message":
            "All votes cleared",
    }


# ============================================================
# HISTORY
# ============================================================

@app.get("/api/history")
def get_history(
    skip: int = 0,
    limit: int = 10,
    specific_date: Optional[str] = None,
    session: Session = Depends(
        get_session
    ),
):
    users = session.exec(
        select(User)
    ).all()

    id_to_username = {
        u.id: u.username
        for u in users
    }

    if specific_date:
        try:
            target = date.fromisoformat(
                specific_date
            )

            songs = session.exec(
                select(Song).where(
                    Song.submission_date ==
                    target
                )
            ).all()

        except ValueError:
            songs = session.exec(
                select(Song)
            ).all()

    else:
        songs = session.exec(
            select(Song)
        ).all()

    songs_by_date = {}

    for song in songs:
        songs_by_date.setdefault(
            song.submission_date,
            []
        ).append(song)

    sorted_dates = sorted(
        list(songs_by_date.keys()),
        reverse=True,
    )

    paginated_dates = sorted_dates[
        skip:
        skip + limit
    ]

    history_feed = []

    for d in paginated_dates:
        day_songs = songs_by_date[d]

        song_ids = [
            song.id
            for song in day_songs
        ]

        if song_ids:
            day_votes = session.exec(
                select(Vote).where(
                    Vote.song_id.in_(
                        song_ids
                    )
                )
            ).all()

        else:
            day_votes = []

        votes_by_song = {
            song_id: []
            for song_id in song_ids
        }

        for vote in day_votes:
            votes_by_song[
                vote.song_id
            ].append(vote)

        leaderboard = []

        for song in day_songs:
            song_votes = (
                votes_by_song[song.id]
            )

            scores = [
                vote.score
                for vote in song_votes
            ]

            avg = (
                sum(scores) /
                len(scores)
                if scores
                else 0
            )

            stdev = (
                statistics.stdev(scores)
                if len(scores) > 1
                else 0
            )

            formatted_votes = [
                {
                    "username":
                        id_to_username.get(
                            vote.voter_id,
                            "Unknown",
                        ),
                    "score":
                        vote.score,
                }
                for vote in song_votes
            ]

            leaderboard.append(
                {
                    "song_id":
                        song.id,
                    "title":
                        song.title,
                    "artist":
                        song.artist,
                    "submittedBy":
                        id_to_username.get(
                            song.submitter_id,
                            "Unknown",
                        ),
                    "average":
                        avg,
                    "stdev":
                        stdev,
                    "votes":
                        formatted_votes,
                    "spotify_url":
                        song.spotify_url,
                    "spotify_track_id":
                        song.spotify_track_id,
                }
            )

        if leaderboard:
            leaderboard.sort(
                key=lambda item: (
                    item["average"],
                    item["stdev"],
                )
            )

            winner = {
                "submittedBy":
                    leaderboard[0][
                        "submittedBy"
                    ]
            }

        else:
            winner = {
                "submittedBy":
                    "No votes cast"
            }

        history_feed.append(
            {
                "date":
                    d.isoformat(),
                "winner":
                    winner,
                "leaderboard":
                    leaderboard,
            }
        )

    return history_feed


# ============================================================
# GLOBAL STATS
# ============================================================

@app.get("/api/stats")
def get_global_stats(
    days: int = 28,
    session: Session = Depends(
        get_session
    ),
):
    users = session.exec(
        select(User)
    ).all()

    songs = session.exec(
        select(Song)
    ).all()

    votes = session.exec(
        select(Vote)
    ).all()

    usernames = [
        user.username
        for user in users
    ]

    id_to_username = {
        user.id: user.username
        for user in users
    }

    votes_by_song = {
        song.id: []
        for song in songs
    }

    for vote in votes:
        if vote.song_id in votes_by_song:
            votes_by_song[
                vote.song_id
            ].append(vote)

    songs_by_date = {}

    for song in songs:
        songs_by_date.setdefault(
            song.submission_date,
            []
        ).append(song)

    sorted_dates = sorted(
        list(songs_by_date.keys())
    )

    cumulative_wins = {
        user.username: 0
        for user in users
    }

    chart_data = []

    user_place_counts = {
        user.username: {
            1: 0,
            2: 0,
            3: 0,
            4: 0,
            5: 0,
        }
        for user in users
    }

    user_sum_avg = {
        user.username: 0.0
        for user in users
    }

    user_submissions = {
        user.username: 0
        for user in users
    }

    for d in sorted_dates:
        day_songs = songs_by_date[d]

        day_results = []

        for song in day_songs:
            song_votes = (
                votes_by_song[song.id]
            )

            if (
                len(song_votes) ==
                len(users)
            ):
                scores = [
                    vote.score
                    for vote in song_votes
                ]

                avg = (
                    sum(scores) /
                    len(scores)
                    if scores
                    else 0
                )

                stdev = (
                    statistics.stdev(
                        scores
                    )
                    if len(scores) > 1
                    else 0
                )

                day_results.append(
                    {
                        "submitter":
                            id_to_username[
                                song.submitter_id
                            ],
                        "average":
                            avg,
                        "stdev":
                            stdev,
                    }
                )

        if (
            len(day_results) ==
            len(day_songs)
            and len(day_songs) > 0
        ):
            day_results.sort(
                key=lambda item: (
                    item["average"],
                    item["stdev"],
                )
            )

            winner = (
                day_results[0][
                    "submitter"
                ]
            )

            cumulative_wins[
                winner
            ] += 1

            data_point = {
                "date":
                    d.isoformat()
            }

            data_point.update(
                cumulative_wins
            )

            chart_data.append(
                data_point
            )

            for rank, result in enumerate(
                day_results
            ):
                place = rank + 1

                submitter = (
                    result["submitter"]
                )

                if place in user_place_counts[
                    submitter
                ]:
                    user_place_counts[
                        submitter
                    ][place] += 1

                user_sum_avg[
                    submitter
                ] += result["average"]

                user_submissions[
                    submitter
                ] += 1

    manager_stats = []

    for user in users:
        username = user.username

        wins = (
            cumulative_wins[
                username
            ]
        )

        sum_avg = (
            user_sum_avg[
                username
            ]
        )

        submissions = (
            user_submissions[
                username
            ]
        )

        overall_avg = (
            sum_avg /
            submissions
            if submissions > 0
            else 0.0
        )

        manager_stats.append(
            {
                "manager":
                    username,
                "wins":
                    wins,
                "sum_avg":
                    round(
                        sum_avg,
                        2,
                    ),
                "overall_avg":
                    round(
                        overall_avg,
                        2,
                    ),
            }
        )

    manager_stats.sort(
        key=lambda item: item["wins"],
        reverse=True,
    )

    for index, stat in enumerate(
        manager_stats
    ):
        stat["place"] = index + 1

    target_dates = (
        sorted_dates[-days:]
        if days > 0
        else sorted_dates
    )

    raw_matrix = {
        poster: {
            voter: []
            for voter in usernames
        }
        for poster in usernames
    }

    for d in target_dates:
        for song in songs_by_date[d]:
            poster = id_to_username[
                song.submitter_id
            ]

            for vote in votes_by_song[
                song.id
            ]:
                voter = id_to_username[
                    vote.voter_id
                ]

                raw_matrix[
                    poster
                ][voter].append(
                    vote.score
                )

    matrices = {
        "average": {
            poster: {}
            for poster in usernames
        },
        "median": {
            poster: {}
            for poster in usernames
        },
        "stdev": {
            poster: {}
            for poster in usernames
        },
        "mode": {
            poster: {}
            for poster in usernames
        },
        "best": {
            poster: {}
            for poster in usernames
        },
        "worst": {
            poster: {}
            for poster in usernames
        },
    }

    def safe_mode(values):
        try:
            return statistics.mode(
                values
            )
        except statistics.StatisticsError:
            return (
                values[0]
                if values
                else 0
            )

    for poster in usernames:
        for voter in usernames:
            scores = raw_matrix[
                poster
            ][voter]

            if scores:
                matrices[
                    "average"
                ][poster][voter] = round(
                    sum(scores) /
                    len(scores),
                    2,
                )

                matrices[
                    "median"
                ][poster][voter] = round(
                    statistics.median(
                        scores
                    ),
                    2,
                )

                matrices[
                    "stdev"
                ][poster][voter] = round(
                    statistics.stdev(
                        scores
                    ),
                    2,
                ) if len(scores) > 1 else 0.0

                matrices[
                    "mode"
                ][poster][voter] = round(
                    safe_mode(scores),
                    2,
                )

                matrices[
                    "best"
                ][poster][voter] = round(
                    min(scores),
                    2,
                )

                matrices[
                    "worst"
                ][poster][voter] = round(
                    max(scores),
                    2,
                )

            else:
                for key in matrices:
                    matrices[
                        key
                    ][poster][voter] = 0.0

    return {
        "chart_data":
            chart_data,
        "manager_stats":
            manager_stats,
        "rank_counts":
            user_place_counts,
        "matrices":
            matrices,
        "usernames":
            usernames,
    }
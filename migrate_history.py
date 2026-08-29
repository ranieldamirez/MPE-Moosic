import os
import pandas as pd
from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field, Session, create_engine, select

# --- 1. DEFINE THE DATABASE MODELS ---
class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)

class Song(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    artist: str
    submission_date: datetime = Field(index=True)
    submitter_id: int = Field(foreign_key="user.id")
    # Placeholders for future Spotify API integration
    spotify_uri: str = Field(default="migrated_from_excel") 
    cover_art_url: Optional[str] = None

class Vote(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    score: float = Field(ge=1, le=5)
    song_id: int = Field(foreign_key="song.id")
    voter_id: int = Field(foreign_key="user.id")

# --- 2. CONFIGURATION ---
# For safety, let's test with a local SQLite database first. 
# When ready for Render, swap this to your Render Postgres URL.
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///moosic_local.db")
EXCEL_FILE = "MPE_Moosic_Ranks.xlsx"

engine = create_engine(DATABASE_URL, echo=False)

def migrate_data():
    print("Creating database tables...")
    SQLModel.metadata.create_all(engine)
    
    print(f"Reading {EXCEL_FILE}...")
    df = pd.read_excel(EXCEL_FILE, sheet_name="Rankings")
    
    # Identify the continuous date column
    date_col = 'Date.1' if 'Date.1' in df.columns else 'Date'
    df_clean = df.dropna(subset=[date_col, 'Poster', 'Song Title'])
    
    usernames = ['alappatjoe', 'danram', 'loganworsdell', 'samuelbattista', 'currydestroyer27']
    
    with Session(engine) as session:
        # 1. Create Users
        print("Migrating users...")
        user_map = {}
        for username in usernames:
            user = User(username=username)
            session.add(user)
            session.commit()
            session.refresh(user)
            user_map[username] = user.id
            
        # 2. Iterate through rows and create Songs and Votes
        print("Migrating songs and votes...")
        for index, row in df_clean.iterrows():
            poster = str(row['Poster']).strip()
            
            # Skip if poster isn't recognized (handles weird excel data)
            if poster not in user_map:
                continue
                
            # Create the Song record
            song = Song(
                title=str(row['Song Title']).strip(),
                artist=str(row['Artist']).strip(),
                submission_date=row[date_col],
                submitter_id=user_map[poster]
            )
            session.add(song)
            session.commit()
            session.refresh(song)
            
            # Create the Vote records for this song
            for voter_name in usernames:
                if pd.notna(row.get(voter_name)):
                    score = float(row[voter_name])
                    vote = Vote(
                        score=score,
                        song_id=song.id,
                        voter_id=user_map[voter_name]
                    )
                    session.add(vote)
                    
            # Commit votes in batches per song
            session.commit()

    print("Migration complete! You can now query your SQL database.")

if __name__ == "__main__":
    migrate_data()
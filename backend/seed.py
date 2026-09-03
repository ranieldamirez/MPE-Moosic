import pandas as pd
from datetime import datetime
from sqlmodel import Session, select
from main import engine, User, Song, Vote, get_password_hash, SQLModel

def run_seed():
    print("Resetting database for a clean migration...")
    # This wipes the messy clumped data so we get a fresh start
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)
    
    print("Loading Excel file...")
    df = pd.read_excel('MPE_Moosic_Ranks.xlsx', sheet_name='Rankings')
    
    song_col = 'Song Title'
    artist_col = 'Artist'
    submitter_col = 'Poster'
    date_col = 'Date'
    
    # MAGIC FIX: Forward-fill the dates so blank cells inherit the date above them!
    df[date_col] = df[date_col].ffill()
    
    # Filter out excluded records
    excluded_users = ["Boots McGee"]
    unique_users = [u for u in df[submitter_col].dropna().unique() if u not in excluded_users]
    
    with Session(engine) as session:
        user_ids = {}
        
        print("Creating user accounts...")
        for username in unique_users:
            user = session.exec(select(User).where(User.username == username)).first()
            if not user:
                user = User(
                    username=username,
                    hashed_password=get_password_hash("Moosic2026!")
                )
                session.add(user)
                session.commit()
                session.refresh(user)
            user_ids[username] = user.id
            
        print("Migrating historical songs and votes...")
        for _, row in df.iterrows():
            submitter = row[submitter_col]
            
            if pd.isna(submitter) or submitter in excluded_users:
                continue
                
            parsed_date = pd.to_datetime(row[date_col], errors='coerce')
            if pd.isna(parsed_date):
                sub_date = datetime.today().date()
            else:
                sub_date = parsed_date.date()
                
            new_song = Song(
                title=row[song_col],
                artist=row[artist_col],
                submitter_id=user_ids[submitter],
                submission_date=sub_date
            )
            session.add(new_song)
            session.commit()
            session.refresh(new_song)
            
            for username in unique_users:
                if username in df.columns and pd.notna(row[username]):
                    vote = Vote(
                        song_id=new_song.id,
                        voter_id=user_ids[username],
                        score=int(row[username])
                    )
                    session.add(vote)
                    
        session.commit()
        print("Migration complete!")

if __name__ == "__main__":
    run_seed()
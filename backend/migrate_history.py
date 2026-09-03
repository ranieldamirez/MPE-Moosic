from sqlmodel import SQLModel, Field
from datetime import date
from typing import Optional

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str
    hashed_password: str = Field(default="")

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
    score: float
import sqlite3

# Connect to the database
conn = sqlite3.connect("moosic_local.db")
cursor = conn.cursor()

# This tells SQLite to update the song table and chop off everything after the 10th character (YYYY-MM-DD)
cursor.execute("""
    UPDATE song 
    SET submission_date = substr(submission_date, 1, 10)
    WHERE length(submission_date) > 10
""")

conn.commit()
conn.close()

print("Success! All dates have been cleaned up.")
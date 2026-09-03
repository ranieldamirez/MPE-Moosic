import sqlite3
import bcrypt

# Generate the hash directly with bcrypt
password = "Moosic2026!".encode('utf-8')
temp_password_hash = bcrypt.hashpw(password, bcrypt.gensalt()).decode('utf-8')

# Connect to database and update schema
conn = sqlite3.connect("moosic_local.db")
cursor = conn.cursor()

try:
    cursor.execute("ALTER TABLE user ADD COLUMN hashed_password VARCHAR;")
    print("Added hashed_password column.")
except sqlite3.OperationalError:
    print("Column already exists. Skipping.")

# Update all existing users with the temporary password
cursor.execute("UPDATE user SET hashed_password = ? WHERE hashed_password IS NULL OR hashed_password = ''", (temp_password_hash,))
conn.commit()
conn.close()

print("Success! All users now have the temporary password: Moosic2026!")
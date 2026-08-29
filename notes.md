


Analyzing
# Moosic Ranks: Web Application Architecture & Feature Specification

## 1. System Overview
The goal of this project is to migrate the "Moosic Ranks" daily song voting system from a complex, macro-heavy Excel spreadsheet into a sleek, dedicated web application. The new system will automate data entry, handle tie-breaking logic deterministically, and provide an interactive, dark-mode-optimized user experience for all participants.

---

## 2. Technology Stack & Infrastructure

The architecture is designed to be lightweight, maintainable, and highly responsive. 

### Frontend: UI & Client-Side Logic
* **Framework:** React (bootstrapped with Vite for fast builds), providing a modular component architecture.
* **Styling:** HTML and custom CSS. The design system will utilize custom CSS variables to enforce a cohesive, deep dark-mode aesthetic across all components, ensuring the sleek look you envisioned.
* **Media:** Spotify Embed Widget for inline track playback.

### Backend: API & Business Logic
* **Language/Framework:** Python (FastAPI or Flask). Python will handle all the complex data transformations, API routing, and statistical calculations (Average, Standard Deviation) that were previously managed by Excel formulas.
* **External Integration:** Spotify Web API (Spotipy library) to fetch track metadata (Artist, Title, Album Art, Genres) automatically from a pasted link.

### Data & Persistence
* **Database:** PostgreSQL. A relational database perfectly mirrors the structured nature of the historical Excel data, allowing for lightning-fast queries for leaderboards and dashboards.
* **ORM (Object-Relational Mapper):** SQLAlchemy or SQLModel (Python) to bridge the database and backend logic.

### Hosting & Deployment
* **Version Control:** GitHub to manage the repository, track issues, and collaborate.
* **Deployment Platform:** Render. The Python web service backend and the PostgreSQL database can both be deployed seamlessly on the Render platform, providing a stable, unified hosting environment outside the work network. The frontend can be deployed statically on Vercel or alongside the backend on Render.

---

## 3. Core Feature Specifications

### A. The "Smart" Submission Form
* **Functionality:** Users paste a Spotify track URL into a single input field.
* **Automation:** The backend intercepts the URL, pings the Spotify API, and retrieves the Song Title, Artist(s), Cover Art, and Release Year.
* **Benefit:** Completely eliminates manual data entry and typos, ensuring clean data for the analytics dashboards.

### B. Daily Voting Dashboard
* **Interface:** A dynamic feed displaying the day's submitted tracks as interactive cards. Each card includes the album art and an embedded Spotify player so users can listen without leaving the app.
* **Voting Mechanism:** A clean 1-5 slider or button group beneath each track. 
* **State Management:** Once a user casts a vote, the card visually updates (e.g., dims or displays a checkmark) to confirm the submission. 
* **Visibility Rules:** Current day averages and scores remain hidden until all users have voted or a specific time deadline is reached, preventing voting bias.

### C. Automated Tie-Breaker Engine
The backend will execute a strict, deterministic sorting algorithm to declare the daily winner:
1. **Primary Sort:** Lowest Average Score (1 is best, 5 is worst).
2. **Secondary Sort:** Lowest Standard Deviation (rewards consensus over polarized ratings).
3. **Tertiary Sort:** A designated manual override or predefined "friend tie-breaker" flag, triggered only if metrics 1 and 2 are identical.

### D. Leaderboards & Analytics Dashboards
* **Overall Standings:** Visual representation of total wins, overall average score, and "Constructors" points.
* **Artist/Genre Breakdown:** Python data processing will parse the Spotify metadata to show which artists and genres are most frequently submitted and which perform the best.
* **Historical Migration:** A one-time data seed will import all historical records from the `MPE_Moosic_Ranks.xlsx` file, ensuring no past wins or stats are lost.

### E. Theme Thursdays
* **Submission System:** A dedicated page where users can submit theme ideas (e.g., "A Cappella", "Released in 2016").
* **Voting:** A simple "In Favor" / "Opposed" voting system.
* **Tracking:** Themes that pass are queued up and flagged in the calendar so the UI can highlight the theme on the designated Thursday.

### F. Tournament Brackets (Song of the Month/Year)
* **Bracket Generation:** The database automatically pulls the top-performing songs of the month/year based on predefined seeding logic (highest average score, most wins).
* **Interactive UI:** A visual bracket component (Seed 1 vs Seed 16, etc.) where users vote in head-to-head matchups until a champion is crowned.

---

## 4. Database Schema Design (High-Level)

To support these features, the PostgreSQL database will require the following core tables:

* **Users:** `user_id`, `username`, `email`, `role`
* **Songs:** `song_id`, `spotify_uri`, `title`, `artist`, `cover_art_url`, `submitter_id`, `submission_date`
* **Votes:** `vote_id`, `song_id`, `voter_id`, `score`, `timestamp`
* **Themes:** `theme_id`, `proponent_id`, `title`, `description`, `proposed_date`, `passed_status`
* **Daily_Results (Materialized View or Cache):** Caches the daily aggregations (Avg, Stdev, Winner) to keep dashboard loading instantaneous.

---

## 5. Next Steps for Development
1. **Initialize GitHub Repository:** Set up the project structure for both frontend and backend.
2. **Database Initialization:** Spin up a PostgreSQL instance on Render and execute the initial schema migrations.
3. **Historical Data Migration:** Run a Python script (`pandas`) to clean and insert the Excel data into the new database.
4. **Spotify API Setup:** Register an application in the Spotify Developer Dashboard to get client credentials for backend metadata fetching.
5. **API Routing:** Build the foundational Python API endpoints (GET daily songs, POST vote, GET leaderboards).
6. **Frontend Prototyping:** Build the custom CSS variables for the dark mode theme and sketch the component architecture for the Daily Voting Dashboard.
Moosic_Ranks_Architecture.md
Displaying Moosic_Ranks_Architecture.md.
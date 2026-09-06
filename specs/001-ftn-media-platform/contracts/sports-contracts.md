# FTN Sports Hub & Standings API Contracts

## 1. `GET /api/sports/leagues`
Lists active sports leagues and racing series.
- **Response 200 OK**:
  ```json
  {
    "leagues": [
      {
        "id": "lg_001",
        "name": "Ro-State Premier Hockey League",
        "slug": "rphl-2026",
        "sport_type": "Hockey",
        "season": "2026",
        "scoring_type": "standard_match",
        "scoring_config": { "win": 2, "ot_loss": 1, "loss": 0 }
      }
    ]
  }
  ```

---

## 2. `POST /api/sports/leagues`
Creates a new sports league or racing series.
- **Permission Required**: `sports_division` or `site_admin`
- **Request Body**:
  ```json
  {
    "name": "Ro-State Cup Series",
    "slug": "rcs-2026",
    "sport_type": "Motorsport",
    "season": "2026",
    "scoring_type": "racing_points",
    "scoring_config": {
      "1": 25, "2": 18, "3": 15, "4": 12, "5": 10, "6": 8, "7": 6, "8": 4, "9": 2, "10": 1
    }
  }
  ```
- **Response 201 Created**:
  ```json
  { "id": "lg_002", "slug": "rcs-2026" }
  ```

---

## 3. `GET /api/sports/fixtures`
Fetches upcoming matches/races and recent results.
- **Query Parameters**:
  - `league_id` (string, optional)
  - `status` (string, optional: `scheduled`, `in_progress`, `completed`)
- **Response 200 OK**:
  ```json
  {
    "fixtures": [
      {
        "id": "fix_901",
        "league_id": "lg_001",
        "home_team": { "id": "tm_1", "name": "Capital Knights", "short_name": "CK" },
        "away_team": { "id": "tm_2", "name": "Liberty Wolves", "short_name": "LW" },
        "scheduled_at": 1771234567890,
        "venue": "Capital Arena",
        "status": "completed",
        "home_score": 4,
        "away_score": 2
      }
    ]
  }
  ```

---

## 4. `PUT /api/sports/fixtures/:id/score`
Inputs final match score or race results and triggers atomic standings recalculation.
- **Permission Required**: `sports_division` or `site_admin`
- **Request Body**:
  ```json
  {
    "status": "completed",
    "home_score": 4,
    "away_score": 2,
    "results_json": null
  }
  ```
- **Response 200 OK**:
  ```json
  {
    "success": true,
    "fixture_id": "fix_901",
    "standings_updated": true
  }
  ```

---

## 5. `GET /api/sports/standings`
Returns calculated standings for a league.
- **Query Parameters**:
  - `league_id` (string, required)
- **Response 200 OK**:
  ```json
  {
    "standings": [
      {
        "rank": 1,
        "team": { "id": "tm_1", "name": "Capital Knights", "short_name": "CK" },
        "played": 10,
        "won": 8,
        "lost": 1,
        "tied": 0,
        "overtime_loss": 1,
        "points": 17,
        "goals_for": 34,
        "goals_against": 18,
        "goal_difference": 16
      }
    ]
  }
  ```

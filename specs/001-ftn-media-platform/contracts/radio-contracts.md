# FTN Web Radio API Contracts

## 1. `GET /api/radio/metadata`
Proxies and caches Icecast live broadcast metadata with a 15-second edge TTL.
- **Response 200 OK**:
  ```json
  {
    "is_live": true,
    "current_show": "The Evening Drive with Alpha",
    "now_playing": "Capital Synth - Neon Waves",
    "listeners_count": 84,
    "stream_url": "https://stream.ftnmediagroup.com/live"
  }
  ```

---

## 2. `GET /api/radio/shows`
Returns the weekly radio program timetable.
- **Query Parameters**:
  - `day_of_week` (number, 0-6, optional)
- **Response 200 OK**:
  ```json
  {
    "shows": [
      {
        "id": "show_1",
        "title": "State Affairs Weekly",
        "host_name": "Marcus Vance",
        "description": "In-depth political analysis and debate.",
        "day_of_week": 1,
        "start_time_utc": "18:00",
        "end_time_utc": "20:00",
        "is_recurring": true
      }
    ]
  }
  ```

---

## 3. `POST /api/radio/shows`
Adds or updates a radio show schedule entry.
- **Permission Required**: `broadcast_division` or `site_admin`
- **Request Body**:
  ```json
  {
    "title": "State Affairs Weekly",
    "host_name": "Marcus Vance",
    "description": "In-depth political analysis and debate.",
    "day_of_week": 1,
    "start_time_utc": "18:00",
    "end_time_utc": "20:00",
    "is_recurring": true
  }
  ```
- **Response 201 Created**:
  ```json
  { "id": "show_1" }
  ```

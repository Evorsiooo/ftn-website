# FTN+ OTT Video Streaming & YouTube Sync Contracts

## 1. `GET /api/plus/videos`
Retrieves aggregated video media items sorted by publication date or live status.
- **Query Parameters**:
  - `status` (string, optional: `live`, `upcoming`, `completed`)
  - `category` (string, optional)
  - `is_podcast` (boolean, optional)
  - `limit` (number, default: 24)
  - `offset` (number, default: 0)
- **Response 200 OK**:
  ```json
  {
    "videos": [
      {
        "id": "vid_001",
        "youtube_video_id": "dQw4w9WgXcQ",
        "title": "State Hockey Championship: Finals Live Coverage",
        "description": "Live broadcast from Capital Arena.",
        "thumbnail_url": "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
        "duration": "PT2H15M",
        "published_at": 1771234567890,
        "live_broadcast_status": "live",
        "category": "Sports",
        "is_podcast": false,
        "view_count": 1420
      }
    ],
    "total": 128
  }
  ```

---

## 2. `POST /api/sync/youtube`
Triggers automated channel sync against YouTube Data API v3.
- **Headers**: Authorization Bearer (Cron secret) or Admin session
- **Response 200 OK**:
  ```json
  {
    "synced_channels": 2,
    "new_videos_added": 3,
    "updated_status_count": 1,
    "timestamp": 1771234567890
  }
  ```

---

## 3. `GET /api/plus/watchlist`
Returns saved video items for the current user.
- **Permission Required**: Authenticated Roblox user
- **Response 200 OK**:
  ```json
  {
    "watchlist": [
      {
        "id": "vid_001",
        "youtube_video_id": "dQw4w9WgXcQ",
        "title": "State Hockey Championship: Finals Live Coverage",
        "thumbnail_url": "https://i.ytimg.com/...",
        "added_at": 1771234600000
      }
    ]
  }
  ```

---

## 4. `POST /api/plus/watchlist`
Adds or removes a video from the user's watchlist.
- **Permission Required**: Authenticated Roblox user
- **Request Body**:
  ```json
  { "video_id": "vid_001" }
  ```
- **Response 200 OK**:
  ```json
  { "saved": true, "video_id": "vid_001" }
  ```

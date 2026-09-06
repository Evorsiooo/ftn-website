# Advertising & Anonymous Tipline API Contracts

## 1. `GET /api/ads`
Fetches an active ad campaign banner for a specific slot based on rotation and weight.
- **Query Parameters**:
  - `slot_id` (string, required: `header_leaderboard`, `article_sidebar`, `feed_banner`, `footer_banner`)
- **Response 200 OK**:
  ```json
  {
    "ad": {
      "id": "ad_88",
      "slot_id": "header_leaderboard",
      "banner_image_url": "https://...",
      "target_url": "https://roblox.com/games/..."
    }
  }
  ```

---

## 2. `POST /api/ads/:id/click`
Registers a click event increment in D1.
- **Response 200 OK**:
  ```json
  { "success": true, "target_url": "https://roblox.com/games/..." }
  ```

---

## 3. `POST /api/admin/ads`
Creates or updates an ad campaign.
- **Permission Required**: `advertising_commercial_division` or `site_admin`
- **Request Body**:
  ```json
  {
    "name": "State Bank Sponsorship",
    "slot_id": "header_leaderboard",
    "banner_image_url": "https://...",
    "target_url": "https://...",
    "weight": 3,
    "start_date": 1771234567890,
    "end_date": 1773234567890
  }
  ```
- **Response 201 Created**:
  ```json
  { "id": "ad_88" }
  ```

---

## 4. `POST /api/tips`
Submits a confidential anonymous news tip. Zero user identity or IP headers are logged.
- **Request Body**:
  ```json
  {
    "tip_text": "Governor signed executive order on port tariffs today.",
    "media_urls": ["https://..."]
  }
  ```
- **Response 201 Created**:
  ```json
  {
    "success": true,
    "reference_id": "tip_992144"
  }
  ```

---

## 5. `GET /api/admin/tips`
Fetches submitted anonymous tips for editorial review.
- **Permission Required**: `digital_publishing_division`, `manager`, or `site_admin`
- **Response 200 OK**:
  ```json
  {
    "tips": [
      {
        "id": "tip_992144",
        "tip_text": "Governor signed executive order on port tariffs today.",
        "media_urls": ["https://..."],
        "status": "new",
        "created_at": 1771234567890
      }
    ]
  }
  ```

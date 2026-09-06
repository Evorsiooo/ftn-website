# Editorial & News Publishing API Contracts

## 1. `GET /api/articles`
Fetches published news articles.
- **Query Parameters**:
  - `category` (string, optional)
  - `search` (string, optional)
  - `limit` (number, default: 20)
  - `offset` (number, default: 0)
- **Response 200 OK**:
  ```json
  {
    "articles": [
      {
        "id": "art_100",
        "slug": "state-senate-passes-infrastructure-bill",
        "title": "State Senate Passes Infrastructure Bill",
        "summary": "Key road and transit projects approved in bipartisan vote.",
        "category": "Politics",
        "cover_image_url": "https://...",
        "author": {
          "roblox_username": "alphaze1",
          "avatar_url": "https://..."
        },
        "published_at": 1771234567890
      }
    ],
    "total": 42
  }
  ```

---

## 2. `GET /api/articles/:slug`
Fetches a single article with full rich text body content.
- **Response 200 OK**:
  ```json
  {
    "article": {
      "id": "art_100",
      "slug": "state-senate-passes-infrastructure-bill",
      "title": "State Senate Passes Infrastructure Bill",
      "summary": "Key road and transit projects approved in bipartisan vote.",
      "content_html": "<p>Content rendered here...</p>",
      "content_json": "{\"type\":\"doc\",...}",
      "category": "Politics",
      "cover_image_url": "https://...",
      "visibility": "public",
      "author": {
        "roblox_username": "alphaze1",
        "avatar_url": "https://..."
      },
      "published_at": 1771234567890
    }
  }
  ```

---

## 3. `POST /api/articles`
Creates a new article.
- **Permission Required**: `digital_publishing_division` or `site_admin`
- **Request Body**:
  ```json
  {
    "title": "State Senate Passes Infrastructure Bill",
    "slug": "state-senate-passes-infrastructure-bill",
    "summary": "Key road and transit projects approved.",
    "content_html": "<p>Full content...</p>",
    "content_json": "{\"type\":\"doc\"}",
    "category": "Politics",
    "cover_image_url": "https://...",
    "visibility": "public",
    "status": "published",
    "published_at": 1771234567890
  }
  ```
- **Response 201 Created**:
  ```json
  { "id": "art_100", "slug": "state-senate-passes-infrastructure-bill" }
  ```

---

## 4. `POST /api/articles/:id/comments`
Posts a comment on an article.
- **Permission Required**: Authenticated Roblox user
- **Request Body**:
  ```json
  { "content": "Important update for transit routes." }
  ```
- **Response 201 Created**:
  ```json
  {
    "id": "cmt_501",
    "content": "Important update for transit routes.",
    "created_at": 1771234600000,
    "user": {
      "roblox_username": "ro_citizen42",
      "avatar_url": "https://..."
    }
  }
  ```

# Authentication & RBAC API Contracts

## 1. `GET /api/auth/roblox`
Initiates the Roblox OAuth2 authorization code workflow.
- **Query Parameters**: None (or optional `return_url`)
- **Response**: `302 Redirect` to `https://apis.roblox.com/oauth/v1/authorize?client_id=...&response_type=code&scope=openid+profile`

---

## 2. `GET /api/auth/callback`
Handles OAuth callback from Roblox, validates state, issues session JWT.
- **Query Parameters**:
  - `code` (string, required)
  - `state` (string, required)
- **Response**:
  - `302 Redirect` to `/` or requested return path with `Set-Cookie: ftn_session=...; HttpOnly; Secure; SameSite=Lax; Path=/`

---

## 3. `GET /api/auth/session`
Returns current visitor authentication status and granted division roles.
- **Headers**: Cookie `ftn_session`
- **Response 200 OK**:
  ```json
  {
    "authenticated": true,
    "user": {
      "id": "usr_123456",
      "roblox_user_id": "18492049",
      "roblox_username": "alphaze1",
      "roblox_display_name": "Alpha",
      "avatar_url": "https://tr.rbxcdn.com/...",
      "roles": ["site_admin", "manager", "digital_publishing_division"]
    }
  }
  ```
- **Response 200 OK (Unauthenticated)**:
  ```json
  {
    "authenticated": false,
    "user": null
  }
  ```

---

## 4. `POST /api/auth/logout`
Terminates current session.
- **Response 200 OK**: `Set-Cookie: ftn_session=; Max-Age=0; Path=/`
  ```json
  { "success": true }
  ```

---

## 5. `GET /api/admin/users`
Retrieves list of users and active division roles.
- **Permission Required**: `site_admin` or `manager`
- **Response 200 OK**:
  ```json
  {
    "users": [
      {
        "id": "usr_123456",
        "roblox_username": "alphaze1",
        "roblox_display_name": "Alpha",
        "avatar_url": "https://...",
        "roles": ["site_admin"]
      }
    ]
  }
  ```

---

## 6. `POST /api/admin/roles/assign`
Assigns a divisional role to a user.
- **Permission Required**: `site_admin` or `manager` (Managers cannot grant `site_admin`)
- **Request Body**:
  ```json
  {
    "user_id": "usr_789012",
    "role": "sports_division"
  }
  ```
- **Response 200 OK**:
  ```json
  {
    "success": true,
    "role": "sports_division",
    "user_id": "usr_789012"
  }
  ```

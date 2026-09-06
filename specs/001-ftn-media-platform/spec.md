# Feature Specification: FTN Media Group Platform

**Feature Branch**: `001-ftn-media-platform`

**Created**: 2026-08-18

**Status**: Draft

**Input**: User description: "I want a website for FTN Media Group, a news agency in Roblox ro-states. It should have the following features: An articles system where people can view articles like any news site; A games section for specific games people can play, like crosswords (games themselves will be added afterall, just ensure the website is made with this in mind and it's easy to add games). Do NOT make games yet. Do not plan for making games. This is a future feature and you will not build any game like crosswords or whatever; An 'FTN Sports' section where can people can see the latest results for matches or races in various leagues/series, or championship standings. Also a calendar for all upcoming matches/races and so on; An FTN Radio player (uses icecast, I can hand the metadata thing and broadcast URL) that is a widget on the website, and also a dedicated page. The dedicated page should also have a planning for any upcoming shows. Also popout player; A tipline for anonymous tips; A full modern OTT platform for FTN. Something branded 'FTN+'. You can open it, and it is a full on OTT platform (like netflix, BBC iPlayer,...)...; A complete advertising system. Banners on the website with link; A roblox authentication system...; When making the navbar, not everything is legal...; Now from the administrative side: alphaze1 is default administrator..."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Core News & Editorial Publishing (Priority: P1)

Visitors can browse, filter, and read news articles across various categories. Authenticated users can leave comments under articles. Members of the Digital Publishing Division can access a rich text editorial console to create, update, schedule, and change visibility (public, unlisted, private) for articles.

**Why this priority**: News publication is the foundational mission of FTN Media Group as a primary ro-state journalism agency.

**Independent Test**: Can be tested end-to-end by creating a draft article as an editorial user, publishing it, viewing it on the public site as a guest, and submitting a comment as an authenticated Roblox user.

**Acceptance Scenarios**:
1. **Given** a published article, **When** an anonymous visitor navigates to the articles index or specific article URL, **Then** they can view the full title, author metadata, publication date, category, and formatted body content.
2. **Given** an unauthenticated visitor viewing an article, **When** they scroll to the discussion section, **Then** they see published comments and a prompt to sign in with Roblox to participate.
3. **Given** a user with the `Digital Publishing Division` role, **When** they access the publishing suite, **Then** they can create or edit articles using a rich text editor, set thumbnail images, choose categories, assign visibility states (public, unlisted, private), and publish or schedule release dates.
4. **Given** an article set to `private` or `unlisted`, **When** an anonymous visitor attempts to browse the public index, **Then** the article does not appear in public listings or search results.

---

### User Story 2 - Roblox Authentication & Role-Based Access Control (Priority: P1)

Users authenticate via their Roblox accounts. Unauthenticated users browse as visitors. Authenticated users gain community features (article commenting, video bookmarking). The default root administrator (`alphaze1`) and designated Managers can grant division-specific roles to manage permissions.

**Why this priority**: Authentication and role security are required to protect administrative dashboards, segment staff permissions, and enable identity-based community interactions.

**Independent Test**: Can be tested by signing in with a Roblox account, verifying visitor vs. authenticated states, and logging in as `alphaze1` to assign division roles to other users.

**Acceptance Scenarios**:
1. **Given** an unauthenticated visitor, **When** they click the login button, **Then** they are guided through Roblox authentication and returned to the site as an authenticated user with their Roblox username and avatar displayed.
2. **Given** the default administrator `alphaze1`, **When** they access the administration control panel, **Then** they can view all registered users and assign or revoke any staff division role.
3. **Given** a user with the `Manager` role, **When** they access the staff management console, **Then** they can assign and manage division roles for staff members below the root administrator tier.
4. **Given** an authenticated user without administrative roles, **When** they attempt to access protected management routes, **Then** access is denied with a clear unauthorized status.

---

### User Story 3 - FTN+ OTT Video & Livestream Streaming Hub (Priority: P2)

Users can access "FTN+", a dedicated full-page dark-mode OTT streaming interface inspired by modern platforms (e.g., Netflix, BBC iPlayer). The hub automatically ingests and displays video uploads, podcasts, and livestreams from configured YouTube channels with metadata (titles, descriptions, thumbnails, status). Authenticated users can save videos to their personal watchlist.

**Why this priority**: FTN+ delivers video journalism, sports broadcasts, and podcasts through a centralized, immersive viewing experience without requiring manual posting workflows.

**Independent Test**: Can be tested by navigating to `/plus` (FTN+), observing automatic channel sync displays, watching an embedded video/livestream, and saving videos to a user's watchlist while logged in.

**Acceptance Scenarios**:
1. **Given** configured YouTube channels for FTN Media Group, **When** new videos or livestreams are published or scheduled on YouTube, **Then** the platform automatically synchronizes and presents them in curated OTT rows (e.g., Live Now, Latest Broadcasts, Sports Replays, Podcasts).
2. **Given** a live broadcast event (e.g., a Roblox hockey game), **When** a user clicks the live banner or card, **Then** the embedded livestream player loads with live status indicators and real-time metadata.
3. **Given** an authenticated user in FTN+, **When** they click "Save to Watchlist" on any video card, **Then** the video is stored in their personal watchlist section.
4. **Given** the global navigation bar, **When** rendered on any page, **Then** the FTN+ navigation link displays distinct visual emphasis while adhering strictly to component assembly guidelines without ad-hoc custom CSS.

---

### User Story 4 - FTN Sports Hub & Standings Engine (Priority: P2)

Sports fans can view match/race calendars, latest results, and automatically computed championship standings across various ro-state leagues and racing series. Members of the Sports Division can create leagues, define custom scoring rules, manage schedules, and record match/race scores.

**Why this priority**: Ro-state sports coverage is a core content pillar requiring dedicated data structures for schedules, results, and standings calculation.

**Independent Test**: Can be tested by creating a sports league, configuring a points system, adding fixtures, entering results, and verifying that the public standings table automatically recalculates points and ranks correctly.

**Acceptance Scenarios**:
1. **Given** an ongoing sports league or racing series, **When** a visitor navigates to the FTN Sports section, **Then** they can view dynamic championship standings, recent game/race results, and an upcoming event calendar.
2. **Given** a user with the `Sports Division` role, **When** they access the Sports Administration panel, **Then** they can create new leagues/series, define sport-specific scoring formulas (e.g., win/loss/draw points, racing position point allocations), and create fixtures.
3. **Given** completed matches or races, **When** a Sports Division member enters the final scores or finishing positions, **Then** the system recalculates standings, goal/point differentials, and ranks immediately for public display.

---

### User Story 5 - FTN Radio Web Player, Schedule & Popout (Priority: P3)

Visitors can listen to the 24/7 FTN Radio stream via an unobtrusive persistent audio player widget accessible across the site, a dedicated radio hub page with upcoming show schedules, and a detachable popout player window. Members of the Broadcast Division can manage show lineups and scheduling.

**Why this priority**: Web radio provides continuous broadcast media and ambient engagement for visitors while browsing articles or sports updates.

**Independent Test**: Can be tested by starting playback on the persistent player, navigating between pages without audio interruption, launching the popout player, and updating the show schedule as a Broadcast Division staff member.

**Acceptance Scenarios**:
1. **Given** a visitor browsing any page on the website, **When** they interact with the FTN Radio widget, **Then** audio streams continuously from the Icecast endpoint, displaying live stream metadata (track/show title).
2. **Given** the dedicated FTN Radio page, **When** visited, **Then** it presents the stream player, current show information, and a schedule of upcoming broadcasts.
3. **Given** the radio player, **When** a user clicks the popout action, **Then** a compact, dedicated popout window opens to continue playback independently of the main browser tab.
4. **Given** a user with the `Broadcast Division` role, **When** they access the broadcast management dashboard, **Then** they can update the weekly show timetable and special broadcast announcements.

---

### User Story 6 - Advertising Banner Management System (Priority: P3)

Visitors are served non-intrusive banner advertisements across defined site zones (e.g., leaderboard banners, sidebar placements). Members of the Advertising & Commercial Division can upload ad creatives, set destination URLs, define active date ranges, and configure impression/display frequency.

**Why this priority**: Advertising management enables commercial operations, ro-state business sponsorship showcases, and promotional campaigns.

**Independent Test**: Can be tested by creating an advertising campaign with an active schedule, verifying its appearance in designated banner slots on the public site, clicking the banner to verify redirection, and checking impression counts.

**Acceptance Scenarios**:
1. **Given** an active ad campaign assigned to a placement zone, **When** visitors load a page containing that ad slot, **Then** the banner graphic is displayed with its linked redirection URL.
2. **Given** a user with the `Advertising & Commercial Division` role, **When** they access the Ad Console, **Then** they can upload banners, specify redirect links, set campaign start/end dates, and set display weights or frequency caps.
3. **Given** an expired or deactivated campaign, **When** pages are served, **Then** the expired banner is automatically withheld from rotation.

---

### User Story 7 - Anonymous Tipline & Extensible Games Hub (Priority: P4)

Visitors can submit confidential, anonymous news tips to the editorial team without identity tracking or account requirements. An extensible Games section exists as an organized portal structure ready for future interactive minigames without implementing active game instances in the current phase.

**Why this priority**: Anonymous whistleblowing strengthens investigative journalism; reserving the games architecture ensures forward compatibility without building out game logic prematurely.

**Independent Test**: Can be tested by submitting an anonymous tip form and verifying receipt in the editorial inbox; navigating to the Games section displays a clean placeholder hub without loading playable game logic.

**Acceptance Scenarios**:
1. **Given** an anonymous source, **When** they submit a tip via the tipline form with narrative text and optional media links/uploads, **Then** the tip is recorded for editorial review with zero visitor-identifying metadata retained.
2. **Given** the global site navigation, **When** rendered, **Then** secondary utilities such as the Tipline and Games hub are housed appropriately in menus/footers rather than crowding primary top-level navigation space.
3. **Given** the Games section, **When** accessed by visitors, **Then** it displays an organized catalog layout ready for future game module integration without executing any playable games.

---

### Edge Cases

- **Roblox API Outages / Rate Limits**: If Roblox authentication experiences downtime, existing authenticated sessions remain valid until token expiry; unauthenticated visitors can continue reading articles and watching streams seamlessly in guest mode.
- **YouTube API Quotas / Channel Sync Failures**: If YouTube API limits are reached, the OTT platform serves cached video records and displays fallback offline notices for active livestreams until sync recovers.
- **Icecast Stream Interruption**: If the Icecast radio broadcast disconnects or restarts, the audio widget transitions gracefully to a reconnection state without crashing the client UI.
- **Simultaneous Multiple Role Assignments**: Users assigned multiple division roles receive the union of all granted permissions without privilege conflicts.
- **Deleted or Private YouTube Videos**: If a synchronized YouTube video is subsequently deleted or set to private on YouTube, the automated sync detects and flags or unlists the entry on FTN+.
- **Excessive Comment Submissions**: Rate limiting prevents automated comment spam under news articles.

## Requirements *(mandatory)*

### Functional Requirements

#### Core Publishing & Articles
- **FR-001**: System MUST provide a responsive public news feed categorized by topics (e.g., Politics, Ro-State Affairs, Business, Entertainment, Sports).
- **FR-002**: System MUST allow users with the `Digital Publishing Division` role to create, edit, save drafts, publish, schedule, and change visibility (`public`, `unlisted`, `private`) of news articles.
- **FR-003**: System MUST provide a rich text editor supporting headings, lists, blockquotes, images, embedded media, and links for article authoring.
- **FR-004**: System MUST allow authenticated Roblox users to post comments on public articles where comments are enabled.

#### Roblox Authentication & Permissions
- **FR-005**: System MUST allow users to authenticate securely using their Roblox identity.
- **FR-006**: System MUST treat unauthenticated users as visitors with full read access to public content.
- **FR-007**: System MUST initialize the Roblox account `alphaze1` as the root Site Administrator with immutable superuser privileges.
- **FR-008**: System MUST support the following hierarchical and divisional roles:
  - `Site Administrator`: Unrestricted access across all platform configurations and settings.
  - `Manager`: User role assignment and moderation capabilities.
  - `Broadcast Division`: Management of radio show schedules and broadcast metadata.
  - `Digital Publishing Division`: Full article authoring, editing, and publishing rights.
  - `Advertising & Commercial Division`: Ad campaign, banner, and scheduling management.
  - `Graphic Design Division`: Standard asset access (non-functional/reserved role currently).
  - `Sports Division`: League/series configuration, scoring rules, schedule entry, and match/race results management.
- **FR-009**: System MUST restrict all management panels and mutating administrative endpoints using role-based access control.

#### FTN+ OTT Platform & YouTube Synchronization
- **FR-010**: System MUST provide a full-page, dark-mode OTT streaming portal interface ("FTN+") presenting curated categories, hero banners, and horizontal media carousels.
- **FR-011**: System MUST automatically synchronize videos, podcasts, and livestreams from one or more configured YouTube channels without requiring manual staff publishing.
- **FR-012**: System MUST extract and store video title, description, thumbnail URLs, duration, publication date, and live broadcast status during synchronization.
- **FR-013**: System MUST embed the appropriate YouTube player for on-demand playback and active live stream viewing within the FTN+ interface.
- **FR-014**: System MUST allow authenticated users to add and remove videos from their personal watchlist.

#### FTN Sports Hub & Standings Engine
- **FR-015**: System MUST allow `Sports Division` staff to create and manage sports leagues and racing series.
- **FR-016**: System MUST allow configurable scoring systems per league/series (e.g., points for win/loss/tie/overtime, or points allocated by finishing race positions).
- **FR-017**: System MUST allow staff to schedule upcoming fixtures/races and input final scores, results, and statistics.
- **FR-018**: System MUST automatically compute and update championship standings, tiebreakers, and rankings upon match/race score confirmation.
- **FR-019**: System MUST display public sports calendars, recent match/race summaries, and live-updated league standings tables.

#### FTN Web Radio & Player
- **FR-020**: System MUST provide a persistent audio player widget that streams live audio from a designated Icecast broadcast endpoint.
- **FR-021**: System MUST poll and display now-playing track/show metadata from the Icecast stream.
- **FR-022**: System MUST provide a dedicated radio page featuring the audio player, station information, and an upcoming broadcast timetable.
- **FR-023**: System MUST provide a detached popout player mode allowing users to listen in a separate window.
- **FR-024**: System MUST allow `Broadcast Division` staff to manage the weekly show schedule displayed on the radio page.

#### Advertising & Monetization
- **FR-025**: System MUST provide designated ad banner slots across key layout zones without disrupting core content readability.
- **FR-026**: System MUST allow `Advertising & Commercial Division` staff to upload banners, set destination URLs, specify start/end dates, and set display weights.
- **FR-027**: System MUST track ad impressions and click-through counts for active campaigns.

#### Anonymous Tipline & Extensible Games Hub
- **FR-028**: System MUST provide a secure anonymous tipline submission form that captures tip text and media attachments without recording IP addresses, session cookies, or user identifiers.
- **FR-029**: System MUST present an extensible Games section interface structured to accommodate future game additions without implementing active game logic or playable games in this release.

#### Navigation & UI Assembly Discipline
- **FR-030**: Global navigation bar MUST prioritize primary destinations (Home, Articles, FTN Sports, FTN Radio, FTN+, and Auth status) while delegating secondary utilities (Tipline, Games, Legal) to menus or footers.
- **FR-031**: All UI interfaces MUST adhere to project constitutional laws: pre-built component assembly via `shadcn` MCP, strict reliance on standard Aceternity UI components, zero ad-hoc styling overrides, no patronizing copy or parenthetical meta-labels, and no emojis in navigation, headings, or buttons.

### Key Entities *(include if feature involves data)*

- **User**: Represents a visitor or staff member. Attributes include Roblox User ID, username, avatar URL, assigned roles, watchlist items, and creation timestamp.
- **Article**: Represents an editorial news item. Attributes include title, slug, rich text content, author ID, category, tags, featured image URL, visibility state (`public`, `unlisted`, `private`), scheduled publication date, and timestamps.
- **Comment**: Represents a discussion entry under an article. Attributes include article ID, user ID, comment body, creation timestamp, and moderation status.
- **VideoItem**: Represents an ingested YouTube video, podcast, or livestream. Attributes include YouTube video ID, channel ID, title, description, thumbnail URLs, published timestamp, live broadcast status (`upcoming`, `live`, `completed`, `none`), category, and duration.
- **WatchlistItem**: Links a User to a saved VideoItem. Attributes include user ID, video ID, and added timestamp.
- **SportsLeague**: Represents a sports league or racing series. Attributes include league name, sport type, season identifier, scoring rules schema, and active status.
- **SportsFixture**: Represents a scheduled match or race event. Attributes include league ID, participants/teams/racers, scheduled datetime, venue, status (`scheduled`, `in_progress`, `completed`), results data, and scores.
- **SportsStanding**: Represents computed team or racer rankings within a league. Attributes include league ID, participant ID, games played/races run, wins, losses, ties/points, and rank position.
- **RadioScheduleEntry**: Represents a scheduled show on the FTN Radio timetable. Attributes include show title, host name, description, day of week, start time, end time, and recurring flag.
- **AdCampaign**: Represents a commercial advertisement. Attributes include campaign name, banner image URL, target destination URL, placement slot identifier, start datetime, end datetime, active state, impression count, and click count.
- **AnonymousTip**: Represents an editorial tip submission. Attributes include tip content, attached media URLs, submission timestamp, and review status (`new`, `reviewed`, `archived`).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Visitors can load any public page (homepage, article, sports standings, radio hub) in under 2 seconds on standard broadband connections.
- **SC-002**: Editorial staff can draft, format, and publish a complete news article with rich text and media in under 3 minutes.
- **SC-003**: YouTube video synchronization automatically detects and indexes new uploads and livestream status changes within 5 minutes of release.
- **SC-004**: Sports championship standings recalculate and update publicly within 5 seconds of score entry confirmation.
- **SC-005**: 100% of administrative dashboard routes reject unauthorized or role-insufficient access attempts.
- **SC-006**: The Icecast persistent audio player initiates live streaming playback within 1.5 seconds of user interaction.
- **SC-007**: 100% of UI components across all pages comply strictly with the project constitution (zero emoji in headers/nav/buttons, zero parenthetical meta-labels, assembled via standard component registry blocks).

## Assumptions

- **Roblox Authentication**: Relies on Roblox OAuth2 or standard secure Roblox account verification workflows to authenticate users and obtain basic identity profiles (user ID, username, avatar).
- **YouTube API Ingestion**: Automated ingestion utilizes YouTube Data API v3 (or standard RSS/polling feeds) configured with FTN Media Group channel IDs.
- **Icecast Streaming**: The Icecast broadcast server endpoint and metadata feed URLs are hosted and provided by FTN Media Group operations.
- **Asset Branding**: Standard clean placeholders will be used for logos, icons, and sponsor graphics until production assets are supplied.
- **Future Games Architecture**: The Games hub will be implemented with modular registry routing to support pluggable minigames in subsequent releases without embedding game code in this feature.

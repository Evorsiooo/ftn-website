import * as broadcastsRoute from "@/app/api/admin/broadcasts/route";
import * as broadcastRoute from "@/app/api/admin/broadcasts/[id]/route";
import * as bulkRoute from "@/app/api/admin/broadcasts/bulk/route";
import * as showsRoute from "@/app/api/admin/radio/shows/route";
import * as showRoute from "@/app/api/admin/radio/shows/[id]/route";
import * as studioRoute from "@/app/api/admin/radio/studio/route";
import * as songsRoute from "@/app/api/admin/radio/songs/route";
import * as songRoute from "@/app/api/admin/radio/songs/[id]/route";
import * as importsRoute from "@/app/api/admin/radio/imports/route";
import * as importRoute from "@/app/api/admin/radio/imports/[id]/route";
import * as reviewRoute from "@/app/api/admin/radio/imports/[id]/review/route";
import * as checkRoute from "@/app/api/admin/radio/imports/check/route";
import * as playlistsRoute from "@/app/api/admin/radio/playlists/route";
import * as playlistRoute from "@/app/api/admin/radio/playlists/[id]/route";
import * as resyncRoute from "@/app/api/admin/radio/playlists/[id]/resync/route";
import * as ratingsRoute from "@/app/api/admin/radio/ratings/route";
import * as reportsRoute from "@/app/api/admin/radio/reports/route";
import * as replaysRoute from "@/app/api/admin/radio/replays/route";
import * as replayRoute from "@/app/api/admin/radio/replays/[id]/route";
import * as prepareRoute from "@/app/api/admin/radio/prepare/route";
import * as collectionsRoute from "@/app/api/admin/radio/collections/route";
import { songStatus } from "@/lib/radio/song-status";
import { LYRIC_SOURCE_IDS } from "@/lib/radio/lyrics-choice";
import { inArray } from "drizzle-orm";
import { radioSongs } from "@/db/schema";
import { lookUpGenres, mbGate, parseGenres } from "@/lib/radio/genres";
import { findInCatalog } from "@/lib/radio/metadata";
import { spotifyUrl, youtubeMusicUrl } from "@/lib/radio/song-links";
import { S, ToolDef, ToolError, pick } from "../types";

const RO_STATE_KEYS = ["harrison", "ridgeway", "madison", "clark", "firestone", "international"];

const broadcastFields = {
  kind: S.enum(["weekly", "once"], "weekly: repeats every week (dayOfWeek + startTime + durationMinutes in timezone). once: a single airing (startsAt + endsAt)."),
  showId: S.str("The show it belongs to (list_radio_shows). Leave out for a one-off with its own title."),
  title: S.str("Title, for one-offs without a show"),
  description: S.str("Description"),
  presenter: S.str("Presenter / DJ, for one-offs without a show"),
  artUrl: S.str("Cover art URL (upload_image with folder radio first)"),
  onRadio: S.bool("Airs on the radio"),
  onStream: S.bool("Airs on the FTN+ video stream"),
  tag: S.enum(["live", "simulcast", "rebroadcast"], "Label on the schedule"),
  status: S.enum(["scheduled", "cancelled"], "cancelled keeps it on the schedule, crossed out"),
  timezone: S.str("IANA time zone for weekly times, e.g. Europe/Paris or America/New_York"),
  dayOfWeek: S.int("Weekly: 0 = Sunday ... 6 = Saturday", { minimum: 0, maximum: 6 }),
  startTime: S.str("Weekly: start time HH:MM in `timezone`"),
  durationMinutes: S.int("Weekly: length in minutes"),
  startsAt: S.str("Once: start, ISO 8601 with time zone"),
  endsAt: S.str("Once: end, ISO 8601 (at most 24 hours after the start)"),
  youtubeId: S.str("YouTube video/stream id, for stream airings"),
  sportsEventId: S.str("Linked sports event id"),
  plays: S.enum(["hosted", "playlist", "stream"], "Radio airings: hosted (someone in the Studio), playlist (automatic), stream (relays an https stream)"),
  playlistId: S.str("plays=playlist: the playlist (list_playlists)"),
  streamUrl: S.str("plays=stream: the https stream URL"),
  notify: S.bool("Post a go-live message to Discord when it starts"),
  notifyMessage: S.str("Go-live message text"),
  notifyRoStates: { type: "array", items: { type: "string", enum: RO_STATE_KEYS }, description: "Which Ro-State feeds get the go-live message" },
};
const BROADCAST_KEYS = Object.keys(broadcastFields);

const STUDIO_ACTIONS = ["queueSong", "queueSongs", "queueUrl", "skip", "remove", "move", "onAir", "gain", "pause", "resume", "callIn", "end", "takeOff"] as const;

export const radioTools: ToolDef[] = [
  // ── schedule ──
  {
    name: "get_schedule",
    title: "Radio and stream schedule",
    description: "All shows and their airings (weekly and one-off), with ids, times, what the radio plays and Discord go-live settings.",
    input: {},
    kind: "read",
    run: (ctx) => ctx.call(broadcastsRoute.GET, { path: "/api/admin/broadcasts" }),
  },
  {
    name: "create_broadcast",
    title: "Schedule a show",
    description: "Adds an airing to the schedule: weekly (kind weekly) or a one-off (kind once).",
    input: broadcastFields,
    required: ["kind"],
    kind: "write",
    refs: { showId: "show", playlistId: "playlist" },
    summary: (a) => `Schedule ${a.kind === "once" ? `a one-off at ${a.startsAt}` : `weekly on day ${a.dayOfWeek} at ${a.startTime}`}${a.title ? ` "${a.title}"` : ""}`,
    run: (ctx, a) => ctx.call(broadcastsRoute.POST, { method: "POST", path: "/api/admin/broadcasts", body: pick(a, BROADCAST_KEYS) }),
  },
  {
    name: "update_broadcast",
    title: "Change a scheduled airing",
    description: "Changes an airing: only the fields given (the rest stay).",
    input: { id: S.str("The airing's id (get_schedule)"), ...broadcastFields },
    required: ["id"],
    kind: "write",
    refs: { id: "broadcast", showId: "show", playlistId: "playlist" },
    summary: (a) => `Change airing ${a.id}`,
    run: (ctx, a) => ctx.call(broadcastRoute.PATCH, { method: "PATCH", path: `/api/admin/broadcasts/${a.id}`, params: { id: a.id }, body: pick(a, BROADCAST_KEYS) }),
  },
  {
    name: "delete_broadcast",
    title: "Remove an airing",
    description: "Deletes an airing from the schedule (to keep it visible but crossed out, use update_broadcast with status cancelled).",
    input: { id: S.str("The airing's id") },
    required: ["id"],
    kind: "danger",
    refs: { id: "broadcast" },
    summary: (a) => `Delete airing ${a.id}`,
    run: (ctx, a) => ctx.call(broadcastRoute.DELETE, { method: "DELETE", path: `/api/admin/broadcasts/${a.id}`, params: { id: a.id } }),
  },
  {
    name: "bulk_change_broadcasts",
    title: "Change many airings at once",
    description: "cancel / restore / delete several airings, move them by N minutes (shift), or set their tag.",
    input: {
      ids: S.strArr("Airing ids (up to 200)"),
      action: S.enum(["cancel", "restore", "delete", "shift", "setTag"], "What to do"),
      minutes: S.int("shift: minutes to move by (negative = earlier, at most 7 days)"),
      tag: S.enum(["live", "simulcast", "rebroadcast"], "setTag: the new tag"),
    },
    required: ["ids", "action"],
    kind: "write",
    refs: { ids: "broadcast" },
    dangerIf: (a) => a.action === "delete",
    summary: (a) => `${a.action} ${Array.isArray(a.ids) ? a.ids.length : 0} airing(s)${a.action === "shift" ? ` by ${a.minutes} min` : ""}`,
    run: (ctx, a) => ctx.call(bulkRoute.POST, { method: "POST", path: "/api/admin/broadcasts/bulk", body: pick(a, ["ids", "action", "minutes", "tag"]) }),
  },
  {
    name: "list_radio_shows",
    title: "List radio shows",
    description: "Shows (name, presenter, description, art) that airings belong to.",
    input: {},
    kind: "read",
    run: (ctx) => ctx.call(showsRoute.GET, { path: "/api/admin/radio/shows" }),
  },
  {
    name: "create_radio_show",
    title: "Create a show",
    description: "Creates a show. Then schedule it with create_broadcast.",
    input: { name: S.str("Show name"), presenter: S.str("Presenter / DJ"), description: S.str("Description"), artUrl: S.str("Cover art URL") },
    required: ["name", "presenter"],
    kind: "write",
    summary: (a) => `Create show "${a.name}"`,
    run: (ctx, a) => ctx.call(showsRoute.POST, { method: "POST", path: "/api/admin/radio/shows", body: pick(a, ["name", "presenter", "description", "artUrl"]) }),
  },
  {
    name: "update_radio_show",
    title: "Edit a show",
    description: "Changes a show: only the fields given.",
    input: { id: S.str("The show's id"), name: S.str("Show name"), presenter: S.str("Presenter / DJ"), description: S.str("Description"), artUrl: S.str("Cover art URL") },
    required: ["id"],
    kind: "write",
    refs: { id: "show" },
    summary: (a) => `Edit show ${a.name || a.id}`,
    run: (ctx, a) =>
      ctx.call(showRoute.PATCH, { method: "PATCH", path: `/api/admin/radio/shows/${a.id}`, params: { id: a.id }, body: pick(a, ["name", "presenter", "description", "artUrl"]) }),
  },
  {
    name: "delete_radio_show",
    title: "Delete a show",
    description: "Deletes a show.",
    input: { id: S.str("The show's id") },
    required: ["id"],
    kind: "danger",
    refs: { id: "show" },
    summary: (a) => `Delete show ${a.id}`,
    run: (ctx, a) => ctx.call(showRoute.DELETE, { method: "DELETE", path: `/api/admin/radio/shows/${a.id}`, params: { id: a.id } }),
  },
  // ── Studio (live show) ──
  {
    name: "get_studio",
    title: "Live Studio state",
    description: "The show on air now (if any): who is on air, the song queue, call-ins and this month's voice usage.",
    input: {},
    kind: "read",
    run: (ctx) => ctx.call(studioRoute.GET, { path: "/api/admin/radio/studio" }),
  },
  {
    name: "studio_control",
    title: "Control the live Studio",
    description:
      "Controls the show on air. Works only while the signed-in person is on air in the Studio. queueSong {key: library song key from search_songs}, queueSongs {keys: several keys in order, e.g. a playlist from get_collection}, queueUrl {url, autodj: also put it on the AutoDJ (default: only your collection)}, skip {k, key: the current song from get_studio}, remove/move/onAir/gain/takeOff {id, dir: 1|-1, gain}, pause, resume, callIn {on}, end.",
    input: {
      action: S.enum(STUDIO_ACTIONS, "What to do"),
      key: S.str("queueSong / skip: the song's key"),
      keys: S.strArr("queueSongs: song keys, in order"),
      url: S.str("queueUrl: a YouTube/Spotify/SoundCloud link"),
      autodj: S.bool("queueUrl: also add the song to the AutoDJ (default false: only your collection)"),
      k: S.int("skip: the playing song's position (from get_studio)"),
      id: S.str("remove / move / onAir / gain / takeOff: the queue item or person id"),
      dir: S.int("move: -1 up, 1 down"),
      gain: S.num("gain: volume for that person"),
      on: S.bool("callIn: open (true) or close (false) call-ins"),
    },
    required: ["action"],
    kind: "write",
    dangerIf: (a) => a.action === "end" || a.action === "takeOff",
    summary: (a) => `Studio: ${a.action}${a.url ? ` ${a.url}` : ""}${a.key ? ` ${a.key}` : ""}`,
    run: (ctx, a) => {
      if (!(STUDIO_ACTIONS as readonly string[]).includes(a.action)) throw new ToolError("Unknown Studio action.");
      return ctx.call(studioRoute.POST, { method: "POST", path: "/api/admin/radio/studio", body: { op: a.action, ...pick(a, ["key", "keys", "url", "autodj", "k", "id", "dir", "gain", "on"]) } });
    },
  },
  // ── song library ──
  {
    name: "search_songs",
    title: "Search the song library",
    description:
      "Finds songs in the radio library by title, artist or album, or by genre. Each song has a status: on-air (the AutoDJ may play it), getting-ready (waiting for Prepare: its mixing analysis and, for new songs, title check), missing (no audio file), failed (couldn't be prepared) or archived. Genre tags: genre (broad, from Apple), genres (detailed, from MusicBrainz), originalYear (year it first came out), genreCheckedAt (null: not looked up yet) and genreByHand (typed in by a person). Where to listen elsewhere: youtubeMusic (the exact song) and spotify (the exact track when spotifyId is set, otherwise a Spotify search; set it with update_song). Playlists (list_playlists, get_playlist) are the songs' show tags.",
    input: {
      query: S.str("Words to look for in title, artist or album (leave out to list)"),
      status: S.enum(["on-air", "getting-ready", "missing", "failed", "archived"], "Only songs with this status"),
      genre: S.str("Only songs whose genre or detailed genres contain this, e.g. disco or hip hop"),
      genreLookedUp: S.bool("true: only songs already looked up for genres; false: only songs not looked up yet"),
      archived: S.bool("true: only archived songs, false: only live ones"),
      limit: S.int("How many (default 50, at most 500)"),
      offset: S.int("Skip this many (paging)"),
    },
    kind: "read",
    run: async (ctx, a) => {
      const data = await ctx.call(songsRoute.GET, { path: "/api/admin/radio/songs" });
      let songs: Array<Record<string, any>> = ((data.songs || []) as Array<Record<string, any>>).map((s) => ({ ...s, status: songStatus(s as any) }));
      const q = String(a.query || "").toLowerCase().trim();
      if (q) songs = songs.filter((s) => [s.title, s.artist, s.album].some((v) => String(v || "").toLowerCase().includes(q)));
      if (typeof a.archived === "boolean") songs = songs.filter((s) => !!s.archived === a.archived);
      if (typeof a.status === "string") songs = songs.filter((s) => s.status === a.status);
      const g = String(a.genre || "").toLowerCase().trim();
      if (g) songs = songs.filter((s) => String(s.genre || "").toLowerCase().includes(g) || parseGenres(s.genres as string | null).some((x) => x.includes(g)));
      if (typeof a.genreLookedUp === "boolean") songs = songs.filter((s) => !!s.genreCheckedAt === a.genreLookedUp);
      // detailed genres as a list, not the stored JSON text
      songs = songs.map((s) => ({ ...s, genres: parseGenres(s.genres as string | null) }));
      const limit = Math.min(Math.max(Number(a.limit) || 50, 1), 500);
      const offset = Math.max(Number(a.offset) || 0, 0);
      const page = songs.slice(offset, offset + limit).map((s) => {
        const artist = String(s.artist || ""), title = String(s.title || "");
        const youtubeId = s.source === "youtube" ? (s.sourceId as string | null) : null;
        return { ...s, youtubeMusic: youtubeMusicUrl(youtubeId, artist, title), spotify: spotifyUrl(s.spotifyId as string | null, artist, title) };
      });
      return { total: songs.length, songs: page };
    },
  },
  {
    name: "get_library_status",
    title: "Song library status",
    description:
      "How many songs are on air (the AutoDJ plays only these) and how many are getting ready, songs that need a look (missing file, couldn't be prepared, video covers, kept as music videos, archived), and any Prepare run going on (whose PC, progress, time left). Prepare itself runs in an admin's browser (Library page, Prepare button: several songs analysed at once on that PC); an AI can't start it, but can follow it and stop it with stop_prepare. Only signed-in radio staff can save a song's analysis, so neither an AI nor a visitor can send one.",
    input: {},
    kind: "read",
    run: async (ctx) => {
      const [data, prep] = await Promise.all([
        ctx.call(songsRoute.GET, { path: "/api/admin/radio/songs" }),
        ctx.call(prepareRoute.GET, { path: "/api/admin/radio/prepare" }),
      ]);
      const songs = (data.songs || []) as Array<Record<string, any>>;
      const c = { onAir: 0, gettingReady: 0, needTitleCheck: 0, missingFile: 0, couldNotPrepare: 0, videoCovers: 0, keptAsMusicVideos: 0, archived: 0 };
      for (const s of songs) {
        const st = songStatus(s as any);
        if (st === "archived") {
          c.archived++;
          continue;
        }
        if (st === "on-air") c.onAir++;
        else if (st === "getting-ready") {
          c.gettingReady++;
          if (!s.metaCheckedAt) c.needTitleCheck++;
        } else if (st === "missing") c.missingFile++;
        else c.couldNotPrepare++;
        if (s.audioCheck === "unmatched") c.keptAsMusicVideos++;
        if (typeof s.thumbnail === "string" && /\.ytimg\.com\//.test(s.thumbnail)) c.videoCovers++;
      }
      const runs = ((prep.runs || []) as Array<Record<string, any>>).map((r) => {
        const left = Math.max(0, r.total - r.done - r.failed);
        return {
          id: r.id,
          on: `${r.userName}'s PC`,
          analysesAtOnce: r.workers,
          prepared: r.done,
          of: r.total,
          couldNotPrepare: r.failed,
          minutesLeft: r.perMin ? Math.max(1, Math.round(left / r.perMin)) : null,
          minutesLeftNote: r.perMin ? "measured from this run's pace" : "still measuring (first few minutes)",
          stopRequested: r.stopRequested,
        };
      });
      return { songs: c, prepareRuns: runs, note: runs.length ? null : c.gettingReady ? "Nothing is being prepared. Someone has to press Prepare on the Library page (in a browser)." : null };
    },
  },
  {
    name: "stop_prepare",
    title: "Stop a Prepare run",
    description: "Stops a Prepare run (get_library_status) on whichever PC it runs: that tab stops at its next song. Songs already done stay on air; the next run carries on with the rest.",
    input: { id: S.str("The run's id (get_library_status)") },
    required: ["id"],
    kind: "write",
    summary: (a) => `Stop Prepare run ${a.id}`,
    run: (ctx, a) => ctx.call(prepareRoute.POST, { method: "POST", path: "/api/admin/radio/prepare", body: { op: "stop", runId: a.id } }),
  },
  {
    name: "retry_unprepared_songs",
    title: "Try unprepared songs again",
    description: "Puts the songs that couldn't be prepared back in Getting ready, so the next Prepare run tries them again.",
    input: {},
    kind: "write",
    summary: () => "Put songs that couldn't be prepared back in Getting ready",
    run: (ctx) => ctx.call(prepareRoute.POST, { method: "POST", path: "/api/admin/radio/prepare", body: { op: "retry" } }),
  },
  {
    name: "redownload_missing_songs",
    title: "Download missing song files again",
    description: "For songs whose audio file is missing: downloads each again from its link (follow with list_imports). They go back to Getting ready.",
    input: {},
    kind: "write",
    openWorld: true,
    summary: () => "Download the songs whose file is missing again",
    run: (ctx) => ctx.call(prepareRoute.POST, { method: "POST", path: "/api/admin/radio/prepare", body: { op: "redownload" } }),
  },
  {
    name: "add_songs",
    title: "Add songs to the library",
    description:
      "Adds music by link: one song, or a whole playlist / album (YouTube, YouTube Music, SoundCloud or Spotify), which also becomes a library playlist. The FTN downloader fetches the files; follow progress with list_imports. Spotify tracks it isn't sure about wait in list_imports reviews. New songs arrive as Getting ready: the AutoDJ plays them once someone runs Prepare on the Library page (get_library_status). A broadcaster's songs queued in the Studio are prepared by their own browser. The songs always go into the person's own collection (get_collection); autodj false keeps them out of the AutoDJ.",
    input: { url: S.str("The link"), autodj: S.bool("Also put the songs on the AutoDJ (default true). false: only in the person's collection") },
    required: ["url"],
    kind: "write",
    openWorld: true,
    summary: (a) => `Add songs from ${a.url}`,
    run: (ctx, a) => ctx.call(importsRoute.POST, { method: "POST", path: "/api/admin/radio/imports", body: { url: a.url, autodj: a.autodj !== false } }),
  },
  {
    name: "get_collection",
    title: "A broadcaster's song collection",
    description:
      "The songs in the signed-in person's collection (every song they added), grouped by the playlists they imported, each with autodj (whether the AutoDJ plays it). Site admins and managers can read someone else's with userId; owners: true lists who has a collection.",
    input: { userId: S.str("Someone else's collection (site admins and managers)"), owners: S.bool("List everyone with a collection instead") },
    kind: "read",
    run: (ctx, a) => ctx.call(collectionsRoute.GET, { path: "/api/admin/radio/collections", query: a.owners ? { owners: "1" } : a.userId ? { user: a.userId } : {} }),
  },
  {
    name: "remove_from_collection",
    title: "Take a song out of a collection",
    description: "Removes a song from the signed-in person's collection (or, for site admins and managers, userId's). A song then in no collection and not on the AutoDJ is archived.",
    input: { songId: S.str("The song's id (get_collection)"), userId: S.str("Whose collection (site admins and managers)") },
    required: ["songId"],
    kind: "write",
    refs: { songId: "song" },
    summary: (a) => `Remove song ${a.songId} from ${a.userId ? "a" : "your"} collection`,
    run: (ctx, a) => ctx.call(collectionsRoute.DELETE, { method: "DELETE", path: "/api/admin/radio/collections", body: pick(a, ["songId", "userId"]) }),
  },
  {
    name: "check_link",
    title: "Check a music link",
    description: "Says what a link is (song or playlist, how many tracks) and which of its songs the library already has, before adding it.",
    input: { url: S.str("The link") },
    required: ["url"],
    kind: "read",
    openWorld: true,
    run: (ctx, a) => ctx.call(checkRoute.GET, { path: "/api/admin/radio/imports/check", query: { url: a.url } }),
  },
  {
    name: "list_imports",
    title: "Song imports in progress",
    description: "Recent imports with their progress, and Spotify tracks waiting for someone to choose the right match (reviews). Downloaded songs land in Getting ready (get_library_status).",
    input: {},
    kind: "read",
    openWorld: true,
    run: (ctx) => ctx.call(importsRoute.GET, { path: "/api/admin/radio/imports" }),
  },
  {
    name: "answer_import_review",
    title: "Choose a match for a Spotify track",
    description: "For a review from list_imports: download one of its candidate links, or skip the track (url null).",
    input: { importId: S.str("The import's id"), index: S.int("The review's index"), url: { type: ["string", "null"], description: "One of the review's candidate URLs, or null to skip" } },
    required: ["importId", "index", "url"],
    kind: "write",
    refs: { importId: "import" },
    openWorld: true,
    summary: (a) => (a.url ? `Pick ${a.url} for import ${a.importId}` : `Skip a track of import ${a.importId}`),
    run: (ctx, a) =>
      ctx.call(reviewRoute.POST, { method: "POST", path: `/api/admin/radio/imports/${a.importId}/review`, params: { id: a.importId }, body: { index: a.index, url: a.url } }),
  },
  {
    name: "cancel_import",
    title: "Cancel an import",
    description: "Stops an import that is still running.",
    input: { id: S.str("The import's id") },
    required: ["id"],
    kind: "danger",
    refs: { id: "import" },
    openWorld: true,
    summary: (a) => `Cancel import ${a.id}`,
    run: (ctx, a) => ctx.call(importRoute.DELETE, { method: "DELETE", path: `/api/admin/radio/imports/${a.id}`, params: { id: a.id } }),
  },
  {
    name: "update_song",
    title: "Edit a song",
    description:
      "Fixes a song's details, archives it (the radio stops playing it) or brings it back, or puts it on / takes it off the AutoDJ (autodj; it stays in collections either way). Lyrics: lyricsSource forces one lyrics provider (or none), lyricsOffsetMs shifts their timing. Genre tags: genre, genres, originalYear; setting any of them marks them as typed in by hand (genreByHand), so lookups no longer change them, unless genreByHand false is sent. spotify sets the song's Spotify track, which the Spotify button on listeners' Liked songs opens (without it, that button searches Spotify).",
    input: {
      id: S.str("The song's id (search_songs)"),
      title: S.str("Title"),
      artist: S.str("Artist"),
      album: S.str("Album"),
      releaseYear: S.int("Release year"),
      thumbnail: S.str("Cover image URL"),
      lyricsSource: { type: ["string", "null"], enum: [...LYRIC_SOURCE_IDS, "none", null], description: "A lyrics provider to always use, 'none' for no lyrics, or null for automatic" },
      lyricsOffsetMs: S.int("Lyrics timing shift: -5000 to 5000 ms in steps of 100 (positive = later)"),
      spotify: { type: ["string", "null"], description: "The song's Spotify track link (open.spotify.com/track/…), or null to clear it" },
      archived: S.bool("true archives it, false brings it back"),
      genre: { type: ["string", "null"], description: "Broad genre, e.g. R&B/Soul (null clears it)" },
      genres: { type: ["array", "null"], items: { type: "string" }, description: "Detailed genres, most fitting first, up to 8, e.g. [\"disco\", \"funk\"] (null clears them)" },
      originalYear: { type: ["integer", "null"], description: "Year the song first came out (null clears it)" },
      genreByHand: S.bool("false: let find_song_genres and the Library's lookup change the genre tags again"),
      autodj: S.bool("true: the AutoDJ plays it, false: only in broadcasters' collections"),
    },
    required: ["id"],
    kind: "write",
    refs: { id: "song" },
    summary: (a) => `Edit song ${a.title ? `"${a.title}"` : a.id}${a.archived === true ? " (archive)" : a.archived === false ? " (unarchive)" : ""}`,
    run: (ctx, a) =>
      ctx.call(songRoute.PATCH, {
        method: "PATCH",
        path: `/api/admin/radio/songs/${a.id}`,
        params: { id: a.id },
        body: {
          ...pick(a, ["title", "artist", "album", "releaseYear", "thumbnail", "lyricsSource", "lyricsOffsetMs", "archived", "autodj", "spotify", "genre", "genres", "originalYear", "genreByHand"]),
          // genre tags set by the AI count as typed in by hand, as in the Library's Edit form
          ...(["genre", "genres", "originalYear"].some((k) => a[k] !== undefined) && a.genreByHand === undefined ? { genreByHand: true } : {}),
        },
      }),
  },
  {
    name: "find_song_genres",
    title: "Look up songs' genres",
    description:
      "Looks up to 5 songs in MusicBrainz (detailed genres, the year each first came out) and, for songs with no genre yet, Apple's catalogue (broad genre), and saves what it finds. Takes about 4 seconds a song (MusicBrainz allows one request a second). Songs whose genres were typed in by hand are skipped. For the whole library, the Library page's ⋯ menu has \"Find genres and original years\".",
    input: { ids: S.strArr("Up to 5 song ids (search_songs; genreLookedUp false lists the ones not looked up yet)") },
    required: ["ids"],
    kind: "write",
    openWorld: true,
    summary: (a) => `Look up genres for ${Array.isArray(a.ids) ? a.ids.length : 0} song(s)`,
    run: async (ctx, a) => {
      const ids = Array.isArray(a.ids) ? [...new Set((a.ids as unknown[]).filter((x): x is string => typeof x === "string"))] : [];
      if (!ids.length || ids.length > 5) throw new ToolError("Give 1 to 5 song ids.");
      const rows = await ctx.db
        .select({ id: radioSongs.id, title: radioSongs.title, artist: radioSongs.artist, durationSec: radioSongs.durationSec, metadataSource: radioSongs.metadataSource, source: radioSongs.source, releaseYear: radioSongs.releaseYear, genre: radioSongs.genre, genreByHand: radioSongs.genreByHand })
        .from(radioSongs)
        .where(inArray(radioSongs.id, ids));
      const get = mbGate({ "User-Agent": `FTN-Radio/1.0 ( ${ctx.origin} )` });
      const stop = { current: false };
      const artistGenres = new Map<string, string[]>();
      const results: Record<string, unknown>[] = [];
      for (const id of ids) {
        const song = rows.find((r) => r.id === id);
        if (!song) {
          results.push({ id, result: "not found" });
          continue;
        }
        if (song.genreByHand) {
          results.push({ id, title: song.title, result: "skipped: genres typed in by hand" });
          continue;
        }
        const [m, apple] = await Promise.all([
          lookUpGenres(song, get, stop, artistGenres).catch(() => null),
          song.genre || song.source === "upload" ? null : findInCatalog(song.title, song.artist, song.durationSec).catch(() => null),
        ]);
        const patch: Record<string, unknown> = { genreChecked: true };
        if (m?.genres.length) patch.genres = m.genres;
        // only an earlier year than ours: a later one means a reissue or a bonus-track edition was matched
        if (m?.originalYear && (!song.releaseYear || m.originalYear < song.releaseYear)) patch.originalYear = m.originalYear;
        const g = apple?.primaryGenreName?.trim().slice(0, 60);
        if (g) patch.genre = g;
        await ctx.call(songRoute.PATCH, { method: "PATCH", path: `/api/admin/radio/songs/${id}`, params: { id }, body: patch });
        results.push({ id, title: song.title, genre: g || song.genre, genres: m?.genres ?? [], genresFrom: m?.from ?? null, originalYear: patch.originalYear ?? null, foundOnMusicBrainz: !!m });
      }
      return { songs: results };
    },
  },
  {
    name: "delete_song",
    title: "Delete a song",
    description: "Deletes a song and its file for good (archive it with update_song to only stop it playing).",
    input: { id: S.str("The song's id") },
    required: ["id"],
    kind: "danger",
    refs: { id: "song" },
    summary: (a) => `Delete song ${a.id} and its file`,
    run: (ctx, a) => ctx.call(songRoute.DELETE, { method: "DELETE", path: `/api/admin/radio/songs/${a.id}`, params: { id: a.id } }),
  },
  {
    name: "list_song_ratings",
    title: "Song ratings",
    description: "Listeners' up/down votes per song (a thumbs up also puts the song in that listener's Liked songs on FTN+ Saved).",
    input: {},
    kind: "read",
    run: (ctx) => ctx.call(ratingsRoute.GET, { path: "/api/admin/radio/ratings" }),
  },
  // ── problem reports (the flag on the radio player) ──
  {
    name: "list_reports",
    title: "List radio problem reports",
    description:
      "Problems listeners reported from the radio player, newest first (at most 300): song reports (too long, wrong song, wrong title or artist, bad sound, wrong lyrics, not for the radio) and bugs. Each says whether the sender was signed in (username) or not, and whether diagnostics were attached. Also returns how many reports have each status.",
    input: {
      status: S.enum(["new", "fixed", "dismissed", "all"], "Which reports (default new)"),
      kind: S.enum(["song", "bug"], "Only song reports or only bug reports"),
      q: S.str("Search in the reason, comment, song, artist and username"),
      diagnostics: S.bool("Include each report's diagnostics (browser, player state, sync, last player messages)"),
    },
    kind: "read",
    run: (ctx, a) =>
      ctx.call(reportsRoute.GET, { path: "/api/admin/radio/reports", query: { status: a.status, kind: a.kind, q: a.q, diagnostics: a.diagnostics ? "1" : undefined } }),
  },
  {
    name: "get_report",
    title: "Read a radio problem report",
    description: "One report with its diagnostics, if the listener attached them: browser and device, player state, how far from the station clock, longest freeze, songs lined up, and the player's last messages.",
    input: { id: S.str("The report's id (list_reports)") },
    required: ["id"],
    kind: "read",
    run: (ctx, a) => ctx.call(reportsRoute.GET, { path: "/api/admin/radio/reports", query: { id: a.id } }),
  },
  {
    name: "set_report_status",
    title: "Mark radio reports fixed or dismissed",
    description: "Changes the status of one or more reports: fixed, dismissed, or back to new.",
    input: { ids: S.strArr("The reports' ids (list_reports)"), status: S.enum(["new", "fixed", "dismissed"], "The new status") },
    required: ["ids", "status"],
    kind: "write",
    summary: (a) => `Mark ${Array.isArray(a.ids) ? a.ids.length : 0} radio report(s) ${a.status}`,
    run: (ctx, a) => ctx.call(reportsRoute.PUT, { method: "PUT", path: "/api/admin/radio/reports", body: { ids: a.ids, status: a.status } }),
  },
  {
    name: "block_report_sender",
    title: "Block a report sender",
    description:
      "Stops the sender of a report from sending more reports (their account if they were signed in, otherwise their network) and dismisses their new reports. unblock: true lifts it.",
    input: {
      id: S.str("A report they sent (list_reports)"),
      days: S.int("How long, in days (default 30; 0 = for good)", { minimum: 0, maximum: 3650 }),
      unblock: S.bool("Lift the block instead"),
    },
    required: ["id"],
    kind: "danger",
    summary: (a) => (a.unblock ? `Unblock the sender of report ${a.id}` : `Block the sender of report ${a.id}${a.days === 0 ? " for good" : ` for ${a.days ?? 30} days`}`),
    run: (ctx, a) =>
      ctx.call(reportsRoute.PUT, { method: "PUT", path: "/api/admin/radio/reports", body: a.unblock ? { action: "unblock", id: a.id } : { action: "block", id: a.id, days: a.days } }),
  },
  // ── playlists ──
  {
    name: "list_playlists",
    title: "List playlists",
    description: "Library playlists with their song counts and source links.",
    input: {},
    kind: "read",
    run: (ctx) => ctx.call(playlistsRoute.GET, { path: "/api/admin/radio/playlists" }),
  },
  {
    name: "get_playlist",
    title: "Read a playlist",
    description: "A playlist and its songs in order.",
    input: { id: S.str("The playlist's id") },
    required: ["id"],
    kind: "read",
    run: (ctx, a) => ctx.call(playlistRoute.GET, { path: `/api/admin/radio/playlists/${a.id}`, params: { id: a.id } }),
  },
  {
    name: "create_playlist",
    title: "Create a playlist",
    description: "Creates an empty playlist; add songs with update_playlist.",
    input: { name: S.str("Playlist name") },
    required: ["name"],
    kind: "write",
    summary: (a) => `Create playlist "${a.name}"`,
    run: (ctx, a) => ctx.call(playlistsRoute.POST, { method: "POST", path: "/api/admin/radio/playlists", body: { name: a.name } }),
  },
  {
    name: "update_playlist",
    title: "Edit a playlist",
    description: "Renames a playlist, changes its description, or sets its songs (songIds replaces the whole list, in order: get_playlist first to keep the current ones).",
    input: { id: S.str("The playlist's id"), name: S.str("Name"), description: S.str("Description"), songIds: S.strArr("Song ids in order (the full list)") },
    required: ["id"],
    kind: "write",
    refs: { id: "playlist" },
    summary: (a) => `Edit playlist ${a.name || a.id}${Array.isArray(a.songIds) ? ` (${a.songIds.length} songs)` : ""}`,
    run: (ctx, a) =>
      ctx.call(playlistRoute.PATCH, { method: "PATCH", path: `/api/admin/radio/playlists/${a.id}`, params: { id: a.id }, body: pick(a, ["name", "description", "songIds"]) }),
  },
  {
    name: "resync_playlist",
    title: "Re-sync a playlist from its source",
    description: "Fetches a linked playlist again from Spotify / YouTube and adds its new songs.",
    input: { id: S.str("The playlist's id") },
    required: ["id"],
    kind: "write",
    refs: { id: "playlist" },
    openWorld: true,
    summary: (a) => `Re-sync playlist ${a.id}`,
    run: (ctx, a) => ctx.call(resyncRoute.POST, { method: "POST", path: `/api/admin/radio/playlists/${a.id}/resync`, params: { id: a.id } }),
  },
  {
    name: "delete_playlist",
    title: "Delete a playlist",
    description: "Deletes a playlist (its songs stay in the library).",
    input: { id: S.str("The playlist's id") },
    required: ["id"],
    kind: "danger",
    refs: { id: "playlist" },
    summary: (a) => `Delete playlist ${a.id}`,
    run: (ctx, a) => ctx.call(playlistRoute.DELETE, { method: "DELETE", path: `/api/admin/radio/playlists/${a.id}`, params: { id: a.id } }),
  },
  // ── replays ──
  {
    name: "list_replays",
    title: "List radio replays",
    description: "Recorded shows listeners can replay on FTN+.",
    input: {},
    kind: "read",
    run: (ctx) => ctx.call(replaysRoute.GET, { path: "/api/admin/radio/replays" }),
  },
  {
    name: "update_replay",
    title: "Rename or hide a replay",
    description: "Renames a replay, or hides it from FTN+ (hidden true) / shows it again.",
    input: { id: S.str("The replay's id"), title: S.str("New title"), hidden: S.bool("Hide from FTN+") },
    required: ["id"],
    kind: "write",
    refs: { id: "replay" },
    summary: (a) => `Edit replay ${a.title || a.id}${a.hidden === true ? " (hide)" : a.hidden === false ? " (show)" : ""}`,
    run: (ctx, a) => ctx.call(replayRoute.PATCH, { method: "PATCH", path: `/api/admin/radio/replays/${a.id}`, params: { id: a.id }, body: pick(a, ["title", "hidden"]) }),
  },
  {
    name: "delete_replay",
    title: "Delete a replay",
    description: "Deletes a replay and its recording.",
    input: { id: S.str("The replay's id") },
    required: ["id"],
    kind: "danger",
    refs: { id: "replay" },
    summary: (a) => `Delete replay ${a.id}`,
    run: (ctx, a) => ctx.call(replayRoute.DELETE, { method: "DELETE", path: `/api/admin/radio/replays/${a.id}`, params: { id: a.id } }),
  },
];

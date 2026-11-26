import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { DbClient } from "@/db";
import { radioCollectionSongs, radioPlaylists, radioPlaylistSongs, radioSongs, users } from "@/db/schema";

/**
 * Broadcasters' collections (migration 0039). Every song a broadcaster adds (a link, a playlist, an upload)
 * goes into their own collection, which they queue from in the Studio. Only the songs they also put on the
 * AutoDJ are played by it (radio_songs.autodj). A collection is private to its owner; site admins and
 * managers can look at everyone's on the Library page.
 */

export interface CollectionSong {
  id: string;
  key: string;
  title: string;
  artist: string;
  durationSec: number;
  thumbnail: string | null;
  autodj: boolean;
}

export interface Collection {
  /** Playlists imported into the collection, newest first, each with its songs in playlist order. */
  groups: { id: string; name: string; songs: CollectionSong[] }[];
  /** Songs added one by one (not in any of those playlists), newest first. */
  songs: CollectionSong[];
  total: number;
}

const songColumns = {
  id: radioSongs.id,
  key: radioSongs.r2Key,
  title: radioSongs.title,
  artist: radioSongs.artist,
  durationSec: radioSongs.durationSec,
  thumbnail: radioSongs.thumbnailUrl,
  autodj: radioSongs.autodj,
  archived: radioSongs.archived,
};

/** [userId]'s collection, archived songs left out. Read only when someone opens it (a few small reads). */
export async function collectionOf(db: DbClient, userId: string): Promise<Collection> {
  const [rows, playlists] = await Promise.all([
    db
      .select(songColumns)
      .from(radioCollectionSongs)
      .innerJoin(radioSongs, eq(radioSongs.id, radioCollectionSongs.songId))
      .where(eq(radioCollectionSongs.userId, userId))
      .orderBy(desc(radioCollectionSongs.createdAt)),
    db
      .select({ id: radioPlaylists.id, name: radioPlaylists.name })
      .from(radioPlaylists)
      .where(eq(radioPlaylists.collectionOf, userId))
      .orderBy(desc(radioPlaylists.createdAt)),
  ]);
  const songs = new Map<string, CollectionSong>();
  for (const { archived, ...s } of rows) if (!archived) songs.set(s.id, s);

  const members: { playlistId: string; songId: string; position: number }[] = [];
  const ids = playlists.map((p) => p.id);
  for (let i = 0; i < ids.length; i += 90) {
    members.push(
      ...(await db
        .select({ playlistId: radioPlaylistSongs.playlistId, songId: radioPlaylistSongs.songId, position: radioPlaylistSongs.position })
        .from(radioPlaylistSongs)
        .where(inArray(radioPlaylistSongs.playlistId, ids.slice(i, i + 90))))
    );
  }
  const grouped = new Set<string>();
  const groups = playlists
    .map((p) => {
      const list = members
        .filter((m) => m.playlistId === p.id && songs.has(m.songId))
        .sort((a, b) => a.position - b.position)
        .map((m) => {
          grouped.add(m.songId);
          return songs.get(m.songId)!;
        });
      return { id: p.id, name: p.name, songs: list };
    })
    .filter((g) => g.songs.length > 0);
  return { groups, songs: [...songs.values()].filter((s) => !grouped.has(s.id)), total: songs.size };
}

/** Everyone who has a collection, with how many songs are in it (the Library page, for site admins). */
export async function collectionOwners(db: DbClient): Promise<{ userId: string; name: string; avatar: string | null; count: number }[]> {
  const rows = await db
    .select({ userId: radioCollectionSongs.userId, name: users.displayName, avatar: users.avatarUrl, count: sql<number>`count(*)`.mapWith(Number) })
    .from(radioCollectionSongs)
    .innerJoin(users, eq(users.id, radioCollectionSongs.userId))
    .groupBy(radioCollectionSongs.userId)
    .orderBy(desc(sql`count(*)`));
  return rows;
}

/** How many songs are in [userId]'s collection. */
export async function collectionCount(db: DbClient, userId: string): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(radioCollectionSongs).where(eq(radioCollectionSongs.userId, userId));
  return r?.n ?? 0;
}

/**
 * Takes [songId] out of [userId]'s collection. A song then in no collection and not on the AutoDJ would
 * play nowhere: it's archived, so it can be deleted (or brought back) from the Library's archived songs.
 */
export async function removeFromCollection(db: DbClient, userId: string, songId: string): Promise<void> {
  await db.delete(radioCollectionSongs).where(and(eq(radioCollectionSongs.userId, userId), eq(radioCollectionSongs.songId, songId)));
  const [song] = await db.select({ autodj: radioSongs.autodj }).from(radioSongs).where(eq(radioSongs.id, songId));
  if (!song || song.autodj) return;
  const [other] = await db.select({ userId: radioCollectionSongs.userId }).from(radioCollectionSongs).where(eq(radioCollectionSongs.songId, songId)).limit(1);
  if (!other) await db.update(radioSongs).set({ archived: true, updatedAt: new Date() }).where(eq(radioSongs.id, songId));
}

/**
 * Puts songs already in the library into [userId]'s collection (Adrien, 2026-11-26). Songs already in it
 * are left as they are, and archived ones are skipped (unarchive them first). Returns how many were new.
 */
export async function addToCollection(db: DbClient, userId: string, songIds: string[]): Promise<number> {
  const ids = [...new Set(songIds)].slice(0, 200);
  if (!ids.length) return 0;
  const found: { id: string }[] = [];
  for (let i = 0; i < ids.length; i += 90) found.push(...(await db.select({ id: radioSongs.id }).from(radioSongs).where(and(inArray(radioSongs.id, ids.slice(i, i + 90)), eq(radioSongs.archived, false)))));
  if (!found.length) return 0;
  const have = new Set<string>();
  for (let i = 0; i < found.length; i += 90) {
    const part = found.slice(i, i + 90).map((f) => f.id);
    for (const r of await db.select({ id: radioCollectionSongs.songId }).from(radioCollectionSongs).where(and(eq(radioCollectionSongs.userId, userId), inArray(radioCollectionSongs.songId, part)))) have.add(r.id);
  }
  const now = new Date();
  const fresh = found.filter((f) => !have.has(f.id));
  // 3 columns a row: 30 rows a statement stays under D1's 100 bound values
  for (let i = 0; i < fresh.length; i += 30) {
    await db.insert(radioCollectionSongs).values(fresh.slice(i, i + 30).map((f) => ({ userId, songId: f.id, createdAt: now }))).onConflictDoNothing();
  }
  return fresh.length;
}

export const canSeeAllCollections = (roles: string[]) => roles.includes("site_admin") || roles.includes("manager");

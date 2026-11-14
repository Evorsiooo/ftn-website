// Mock content for the BitChord-styled FTN+ mockups. Nothing here is real data.
// Photos: Unsplash (Unsplash License), saved under public/mockups/art.

export const art = (name: string) => `/mockups/art/${name}.jpg`;
export const wide = (name: string) => `/mockups/art/${name}-wide.jpg`;

export interface Song {
  id: string;
  title: string;
  artist: string;
  art: string;
  durationSec: number;
  /** When it starts on the radio's timeline, local time. */
  at?: string;
}

export const nowPlaying: Song & { elapsedSec: number } = {
  id: 'neon-avenue',
  title: 'Neon Avenue',
  artist: 'Harbor Lights',
  art: art('neon-decks'),
  durationSec: 214,
  elapsedSec: 71,
};

export const show = {
  title: 'Late Night Drive',
  kind: 'Auto show',
  host: 'DJ Nova',
  art: art('night-mic'),
  wideArt: wide('night-mic'),
  listeners: 184,
  until: '23:00',
};

export const comingUp: Song[] = [
  { id: 'c1', title: 'Glass Pillars', artist: 'Mira Vale', art: art('lilac-mic'), durationSec: 198, at: '21:46' },
  { id: 'c2', title: 'Overpass', artist: 'The Ridgeway Set', art: art('vinyl'), durationSec: 241, at: '21:49' },
  { id: 'c3', title: 'Copper Sky', artist: 'Juno & the Wires', art: art('gold-crowd'), durationSec: 187, at: '21:53' },
  { id: 'c4', title: 'Static Hearts', artist: 'Firestone Youth', art: art('heart-crowd'), durationSec: 226, at: '21:56' },
  { id: 'c5', title: 'Afterglow (Radio Edit)', artist: 'Kaito Rey', art: art('plasma'), durationSec: 203, at: '22:00' },
  { id: 'c6', title: 'Madison Lights', artist: 'Clark Street', art: art('neon-sign'), durationSec: 219, at: '22:03' },
  { id: 'c7', title: 'Low Tide', artist: 'Harbor Lights', art: art('boombox'), durationSec: 232, at: '22:07' },
];

export const recentlyPlayed: Song[] = [
  { id: 'r1', title: 'Paper Planes Over Harrison', artist: 'Oak & Ember', art: art('yellow-phones'), durationSec: 205 },
  { id: 'r2', title: 'Signal', artist: 'Mira Vale', art: art('chrome-mic'), durationSec: 188 },
  { id: 'r3', title: 'Midnight Ferry', artist: 'The Ridgeway Set', art: art('purple-crowd'), durationSec: 247 },
  { id: 'r4', title: 'Runway', artist: 'Kaito Rey', art: art('smoke-singer'), durationSec: 199 },
  { id: 'r5', title: 'Red Line', artist: 'Juno & the Wires', art: art('stage-red'), durationSec: 214 },
  { id: 'r6', title: 'Bright Static', artist: 'Clark Street', art: art('mc'), durationSec: 231 },
  { id: 'r7', title: 'Studio B', artist: 'Oak & Ember', art: art('studio'), durationSec: 176 },
  { id: 'r8', title: 'Crowd Noise', artist: 'Firestone Youth', art: art('festival'), durationSec: 219 },
];

/** Original placeholder lyrics, written for the mockup. [line, start s, end s]. */
export const lyrics: [string, number, number][] = [
  ['Headlights on the avenue', 52.0, 55.6],
  ['Painting every window blue', 55.8, 59.4],
  ['The city hums a song for two', 59.6, 63.2],
  ['And I keep driving back to you', 63.4, 67.4],
  ['Neon, neon, hold me tight', 68.2, 71.6],
  ['Every sign is burning bright', 71.8, 75.4],
  ['We could stay out here all night', 75.6, 79.2],
  ['On the avenue of light', 79.4, 83.6],
  ['Radio is turning low', 85.0, 88.4],
  ['Playing songs we used to know', 88.6, 92.2],
  ['Harbor lights are putting on a show', 92.4, 96.0],
  ['Tell me where you want to go', 96.2, 100.4],
  ['Neon, neon, hold me tight', 101.2, 104.6],
  ['Every sign is burning bright', 104.8, 108.4],
  ['We could stay out here all night', 108.6, 112.2],
  ['On the avenue of light', 112.4, 117.0],
];

export interface Video {
  id: string;
  title: string;
  subtitle: string;
  art: string;
  duration?: string;
  live?: boolean;
  category: 'Shows' | 'News' | 'Sports' | 'Podcasts';
}

export const videos: Video[] = [
  { id: 'v1', title: 'FTN Evening News', subtitle: 'FTN News · Live', art: wide('city'), live: true, category: 'News' },
  { id: 'v2', title: 'Harrison Grand Prix: Round 5 highlights', subtitle: 'FTN Sports · 12 min', art: wide('cycling'), duration: '12:04', category: 'Sports' },
  { id: 'v3', title: 'Inside the Studio: How Auto Shows Work', subtitle: 'FTN+ Originals · 18 min', art: wide('studio'), duration: '18:22', category: 'Shows' },
  { id: 'v4', title: 'Ridgeway Council: Budget Vote Explained', subtitle: 'FTN News · 9 min', art: wide('stage-gold'), duration: '9:41', category: 'News' },
  { id: 'v5', title: 'Firestone Fest 2026: Full Set', subtitle: 'FTN+ Originals · 1 hr 4 min', art: wide('festival'), duration: '1:04:10', category: 'Shows' },
  { id: 'v6', title: 'The Madison Podcast, Ep. 41', subtitle: 'Podcasts · 47 min', art: wide('night-mic'), duration: '47:15', category: 'Podcasts' },
  { id: 'v7', title: 'Clark County Basketball Final', subtitle: 'FTN Sports · 2 hr', art: wide('basketball'), duration: '2:01:33', category: 'Sports' },
  { id: 'v8', title: 'Charity Drive Recap', subtitle: 'FTN News · 6 min', art: wide('charity'), duration: '6:12', category: 'News' },
  { id: 'v9', title: 'Wild Harrison: The Iguana Problem', subtitle: 'FTN+ Originals · 22 min', art: wide('iguana'), duration: '22:48', category: 'Shows' },
  { id: 'v10', title: 'Crowd Cam: Lasers at the Arena', subtitle: 'FTN+ Originals · 4 min', art: wide('lasers'), duration: '4:03', category: 'Shows' },
  { id: 'v11', title: 'Volleyball League Week 3', subtitle: 'FTN Sports · 1 hr 12 min', art: wide('volleyball'), duration: '1:12:40', category: 'Sports' },
  { id: 'v12', title: 'Fans React: Derby Day', subtitle: 'FTN Sports · 7 min', art: wide('fans'), duration: '7:19', category: 'Sports' },
];

export interface ScheduleEntry {
  id: string;
  start: string;
  end: string;
  title: string;
  host?: string;
  kind: 'Radio' | 'Auto show' | 'Livestream' | 'Sports';
  art: string;
  state?: 'live' | 'done';
}

export const schedule: ScheduleEntry[] = [
  { id: 's1', start: '17:00', end: '18:00', title: 'Drive Time', host: 'Sam Okafor', kind: 'Radio', art: art('yellow-phones'), state: 'done' },
  { id: 's2', start: '18:00', end: '18:30', title: 'FTN Evening News', host: 'Priya Hale', kind: 'Livestream', art: art('stage-red'), state: 'done' },
  { id: 's3', start: '18:30', end: '20:00', title: 'Hits Back to Back', kind: 'Auto show', art: art('purple-crowd'), state: 'done' },
  { id: 's4', start: '20:00', end: '21:30', title: 'Harrison Grand Prix, Round 6', host: 'FTN Sports', kind: 'Sports', art: art('neon-sign'), state: 'done' },
  { id: 's5', start: '21:30', end: '23:00', title: 'Late Night Drive', host: 'DJ Nova', kind: 'Auto show', art: art('night-mic'), state: 'live' },
  { id: 's6', start: '23:00', end: '00:00', title: 'The Call-In Hour', host: 'Marcus Lee', kind: 'Radio', art: art('podcast-mic') },
  { id: 's7', start: '00:00', end: '02:00', title: 'Overnight Mix', kind: 'Auto show', art: art('plasma') },
  { id: 's8', start: '02:00', end: '06:00', title: 'Night Shift', kind: 'Auto show', art: art('vinyl') },
];

export const days = ['Today', 'Sun 15', 'Mon 16', 'Tue 17', 'Wed 18', 'Thu 19', 'Fri 20'];

export const presenters = [
  { name: 'DJ Nova', art: art('smoke-singer') },
  { name: 'Priya Hale', art: art('chrome-mic') },
  { name: 'Sam Okafor', art: art('mc') },
  { name: 'Marcus Lee', art: art('stage-red') },
  { name: 'Ana Ruiz', art: art('lilac-mic') },
  { name: 'Kenji Mori', art: art('boombox') },
  { name: 'Lea Novak', art: art('yellow-phones') },
  { name: 'Theo Grant', art: art('gold-crowd') },
  { name: 'Ivy Chen', art: art('plasma') },
  { name: 'Omar Haddad', art: art('vinyl') },
];

export const radioShows = [
  { title: 'Late Night Drive', subtitle: 'Auto show · Weeknights', art: art('night-mic') },
  { title: 'Drive Time', subtitle: 'Sam Okafor · Weekdays', art: art('yellow-phones') },
  { title: 'The Call-In Hour', subtitle: 'Marcus Lee · Live callers', art: art('podcast-mic') },
  { title: 'Hits Back to Back', subtitle: 'Auto show · Daily', art: art('purple-crowd') },
  { title: 'Overnight Mix', subtitle: 'Auto show · Nightly', art: art('plasma') },
  { title: 'Weekend Vinyl', subtitle: 'Ana Ruiz · Saturdays', art: art('vinyl') },
  { title: 'Studio Sessions', subtitle: 'Live performances', art: art('studio') },
];

export interface Match {
  league: string;
  home: string;
  away: string;
  score?: string;
  when: string;
  art: string;
}

export const results: Match[] = [
  { league: 'Clark County Basketball', home: 'Clark Comets', away: 'Madison Monarchs', score: '78 – 71', when: 'Final · Yesterday', art: art('stage-gold') },
  { league: 'Harrison Football League', home: 'Harrison FC', away: 'Ridgeway Rovers', score: '2 – 2', when: 'Final · Thu', art: art('heart-crowd') },
  { league: 'Harrison Grand Prix', home: 'Round 5', away: 'Winner: L. Novak', when: 'Final · Wed', art: art('neon-decks') },
  { league: 'Volleyball League', home: 'Firestone Flames', away: 'Clark Comets', score: '3 – 1', when: 'Final · Tue', art: art('smoke-singer') },
  { league: 'Harrison Football League', home: 'Madison United', away: 'Firestone Athletic', score: '0 – 1', when: 'Final · Mon', art: art('festival') },
  { league: 'Clark County Basketball', home: 'Ridgeway Rockets', away: 'Harrison Hawks', score: '64 – 80', when: 'Final · Sun', art: art('mc') },
  { league: 'Volleyball League', home: 'Madison Mavericks', away: 'Ridgeway Royals', score: '2 – 3', when: 'Final · Sat', art: art('purple-crowd') },
  { league: 'Harrison Football League', home: 'Clark City', away: 'Harrison FC', score: '1 – 3', when: 'Final · Sat', art: art('lilac-mic') },
];

export const upcomingMatches = [
  { league: 'Harrison Grand Prix', title: 'Round 6: Harbor Circuit', when: 'Today · 20:00', art: wide('cycling'), on: 'Livestream + Radio' },
  { league: 'Harrison Football League', title: 'Harrison FC vs Madison United', when: 'Sun 15 · 18:00', art: wide('football'), on: 'Livestream' },
  { league: 'Clark County Basketball', title: 'Clark Comets vs Ridgeway Rockets', when: 'Mon 16 · 19:30', art: wide('basketball'), on: 'Radio' },
  { league: 'Volleyball League', title: 'Firestone Flames vs Madison Mavericks', when: 'Tue 17 · 19:00', art: wide('volleyball'), on: 'Livestream' },
];

export const standings = [
  { pos: 1, team: 'Harrison FC', played: 9, won: 6, drawn: 2, lost: 1, gd: '+11', pts: 20, art: art('heart-crowd') },
  { pos: 2, team: 'Madison United', played: 9, won: 6, drawn: 1, lost: 2, gd: '+8', pts: 19, art: art('festival') },
  { pos: 3, team: 'Ridgeway Rovers', played: 9, won: 4, drawn: 3, lost: 2, gd: '+3', pts: 15, art: art('purple-crowd') },
  { pos: 4, team: 'Firestone Athletic', played: 9, won: 3, drawn: 2, lost: 4, gd: '-2', pts: 11, art: art('stage-red') },
  { pos: 5, team: 'Clark City', played: 9, won: 2, drawn: 1, lost: 6, gd: '-9', pts: 7, art: art('lilac-mic') },
  { pos: 6, team: 'International XI', played: 9, won: 1, drawn: 1, lost: 7, gd: '-11', pts: 4, art: art('mc') },
];

export const leagues = [
  { title: 'Harrison Grand Prix', color: '#c2410c', art: art('neon-decks') },
  { title: 'Harrison Football League', color: '#15803d', art: art('heart-crowd') },
  { title: 'Clark County Basketball', color: '#b45309', art: art('stage-gold') },
  { title: 'Volleyball League', color: '#1d4ed8', art: art('smoke-singer') },
];

export const callersOnAir = [
  { name: 'ridgeway_rae', display: 'Rae', art: art('lilac-mic'), level: 0.62, talking: true },
  { name: 'MadisonMike22', display: 'Mike', art: art('mc'), level: 0.18, talking: false },
];

export const waitingRoom = [
  { name: 'harbor_kid', display: 'Jonah', art: art('boombox'), waited: '6 min', note: 'Wants to request a song', micOk: true },
  { name: 'FirestoneFan', display: 'Elle', art: art('yellow-phones'), waited: '4 min', note: 'Question about the Grand Prix', micOk: true },
  { name: 'clarkcitycat', display: 'Theo', art: art('gold-crowd'), waited: '3 min', note: 'Shout-out for a friend', micOk: false },
  { name: 'nightowl_ivy', display: 'Ivy', art: art('plasma'), waited: '1 min', note: '', micOk: true },
  { name: 'omar.h', display: 'Omar', art: art('vinyl'), waited: 'Just now', note: 'First time calling', micOk: true },
];

export const me = { name: 'Adrien', art: art('chrome-mic') };

export const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

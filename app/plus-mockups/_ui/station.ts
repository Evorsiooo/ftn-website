// What the radio is doing in each mockup. The songs, artists and lyrics are made up for the mockups, and so are the
// automated shows "Night Drive" and "Sunday Drive". Ridgeway Review and The Wire are real FTN shows.
export type Mode = "autodj" | "show" | "hosted" | "offair";

export const ART = {
  neon: "/mockups/plus/art_neon-decks.jpg",
  nightDrive: "/mockups/plus/art_night-mic.jpg",
  sundayDrive: "/mockups/plus/art_vinyl.jpg",
  warmup: "/mockups/plus/art_lilac-mic.jpg",
  ridgeway: "/mockups/plus/show_ridgeway.jpg",
  wire: "/mockups/plus/show_wire.jpg",
};

export type Station = {
  mode: Mode;
  /** The big line: the song during AutoDJ, the show during a show. */
  name: string;
  /** Under it: the artist during AutoDJ, the host and slot during a show. */
  by: string;
  art: string | null;
  /** During an automated show, the song playing, as a smaller line. */
  song?: string;
  lyrics: string[] | null;
  vote: boolean;
  listeners: number;
  next: string | null;
  calls: boolean;
};

const NEON = [
  "Streetlights counting down the block",
  "Your number's still on the dashboard clock",
  "We ride the avenue till the neon fades",
  "Windows down through the last parade",
  "Every sign is calling out your name",
  "And the city never sleeps the same",
  "Hold the light, hold the light",
  "We could stay out here all night",
  "On the avenue of light",
  "Radio is turning low",
  "Tell me where the drivers go",
  "Neon avenue, take it slow",
];

const PILLARS = [
  "Glass pillars in the morning haze",
  "Holding up the roof of yesterday",
  "I can see you through the window frame",
  "Every echo sounds the same",
  "Stand still, let the light come in",
  "Glass pillars, paper thin",
  "Hold on to the shape we're in",
  "Let the morning start again",
];

export const STATIONS: Record<Mode, Station> = {
  autodj: {
    mode: "autodj",
    name: "Neon Avenue",
    by: "Harbor Lights",
    art: ART.neon,
    lyrics: NEON,
    vote: true,
    listeners: 184,
    next: "Next: Night Drive at 22:00",
    calls: false,
  },
  show: {
    mode: "show",
    name: "Night Drive",
    by: "22:00 to 00:00",
    art: ART.nightDrive,
    song: "Glass Pillars · Mira Vale",
    lyrics: PILLARS,
    vote: true,
    listeners: 184,
    next: "Next: Sunday Drive, Sunday at 14:00",
    calls: false,
  },
  hosted: {
    mode: "hosted",
    name: "Ridgeway Review",
    by: "with Palmer Times · 03:00 to 05:00",
    art: ART.ridgeway,
    lyrics: null,
    vote: false,
    listeners: 184,
    next: "Next: Night Drive, Saturday at 22:00",
    calls: true,
  },
  offair: {
    mode: "offair",
    name: "Off air",
    by: "",
    art: null,
    lyrics: null,
    vote: false,
    listeners: 0,
    next: "Next: Ridgeway Review, Wednesday at 03:00",
    calls: false,
  },
};

export const SHOWS = [
  { name: "Ridgeway Review", host: "with Palmer Times", when: "Wednesdays, 03:00", art: ART.ridgeway },
  { name: "The Wire: Harrison County", host: "with Kuzymah", when: "Fridays, 03:00", art: ART.wire },
  { name: "Night Drive", host: null, when: "Saturdays, 22:00", art: ART.nightDrive },
  { name: "Sunday Drive", host: null, when: "Sundays, 14:00", art: ART.sundayDrive },
];

/** A caller's steps, inside the player. */
export type CallStep = "button" | "signin" | "mic" | "waiting" | "onair" | "closed";

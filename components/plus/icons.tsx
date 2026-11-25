// One outline icon set (24px grid, 1.8 stroke) for the FTN+ mockups. Play is the only filled one.
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export const Play = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}>
    <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
  </svg>
);
export const Save = (p: P) => (<svg {...base} {...p}><path d="M6 4h12v16l-6-4-6 4z" /></svg>);
export const Saved = (p: P) => (<svg {...base} fill="currentColor" {...p}><path d="M6 4h12v16l-6-4-6 4z" /></svg>);
export const Share = (p: P) => (<svg {...base} {...p}><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></svg>);
export const Up = (p: P) => (<svg {...base} {...p}><path d="M7 11v9H4v-9zM7 11l4-8a2 2 0 0 1 2 2v4h5.5a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.3 20H7" /></svg>);
export const Down = (p: P) => (<svg {...base} {...p}><path d="M17 13V4h3v9zM17 13l-4 8a2 2 0 0 1-2-2v-4H5.5a2 2 0 0 1-2-2.3l1.2-7A2 2 0 0 1 6.7 4H17" /></svg>);
export const Vol = (p: P) => (<svg {...base} {...p}><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M16.5 8.5a5 5 0 0 1 0 7" /></svg>);
export const Pop = (p: P) => (<svg {...base} {...p}><path d="M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>);
export const History = (p: P) => (<svg {...base} {...p}><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" /><path d="M3.5 4.5v4h4" /><path d="M12 8v4.2l2.8 1.8" /></svg>);
export const Full = (p: P) => (<svg {...base} {...p}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>);
export const Close = (p: P) => (<svg {...base} {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>);
export const Mic = (p: P) => (<svg {...base} {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>);
export const MicOff = (p: P) => (<svg {...base} {...p}><path d="M15 10V6a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 4.6 2.5M5 11a7 7 0 0 0 11.5 5.4M19 11a7 7 0 0 1-.5 2.6M12 18v3M4 4l16 16" /></svg>);
export const Phone = (p: P) => (<svg {...base} {...p}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>);
export const Radio = (p: P) => (<svg {...base} {...p}><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M7 8l10-4" /><circle cx="15.5" cy="14" r="2.5" /><path d="M6.5 12.5h4M6.5 15.5h4" /></svg>);
export const Video = (p: P) => (<svg {...base} {...p}><rect x="3" y="5" width="13" height="14" rx="2" /><path d="M16 10l5-3v10l-5-3" /></svg>);
export const Note = (p: P) => (<svg {...base} {...p}><path d="M9 18V5l11-2v13" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></svg>);
export const Home = (p: P) => (<svg {...base} {...p}><path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" /></svg>);
export const Grid = (p: P) => (<svg {...base} {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M10 9.5v5l4-2.5z" /></svg>);
export const Calendar = (p: P) => (<svg {...base} {...p}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></svg>);
export const More = (p: P) => (<svg {...base} {...p}><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></svg>);
export const ArrowLeft = (p: P) => (<svg {...base} {...p}><path d="M19 12H5M11 6l-6 6 6 6" /></svg>);
export const Stop = (p: P) => (<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}><rect x="6.5" y="6.5" width="11" height="11" rx="2" /></svg>);
export const VolOff = (p: P) => (<svg {...base} {...p}><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M17 9.5l5 5M22 9.5l-5 5" /></svg>);

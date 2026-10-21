// Roblox Ro-States a post can be for. Each one has its own Discord feed.
export const RO_STATES = [
  { key: "harrison", label: "Harrison" },
  { key: "ridgeway", label: "Ridgeway" },
  { key: "madison", label: "Madison" },
  { key: "clark", label: "Clark" },
  { key: "firestone", label: "Firestone" },
  { key: "international", label: "International" },
] as const;

export type RoState = (typeof RO_STATES)[number]["key"];

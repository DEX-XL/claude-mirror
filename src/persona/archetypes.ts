// The 12 archetypes. The reduce step picks one by id. Each has an icon,
// color (accent gradient seed), two-line description, and a rarity tag.
// Collection mechanics ("what did you get?") drive comparison-sharing.

export type Archetype = {
  id: string;
  name: string;
  icon: string;
  color: string; // hex accent
  description: string;
  rarity: string;
};

export const ARCHETYPES: Archetype[] = [
  {
    id: "midnight-architect",
    name: "The Midnight Architect",
    icon: "🌙",
    color: "#7c5cff",
    description: "You build best when the world sleeps. Big structures, drawn in the dark.",
    rarity: "~8% of profiles",
  },
  {
    id: "relentless-debugger",
    name: "The Relentless Debugger",
    icon: "🔦",
    color: "#ff5c7c",
    description: "A bug is a personal insult. You do not stop until it's cornered.",
    rarity: "~11% of profiles",
  },
  {
    id: "idea-fountain",
    name: "The Idea Fountain",
    icon: "💡",
    color: "#ffb84c",
    description: "One prompt, ten tangents. Your mind runs faster than any keyboard.",
    rarity: "~9% of profiles",
  },
  {
    id: "perfectionists-apprentice",
    name: "The Perfectionist's Apprentice",
    icon: "💎",
    color: "#4cc9ff",
    description: "'Almost' is a swear word. You'd rather redo it than ship it rough.",
    rarity: "~7% of profiles",
  },
  {
    id: "delegation-maestro",
    name: "The Delegation Maestro",
    icon: "🎼",
    color: "#4cffb8",
    description: "You conduct, you don't play every note. Trust, scoped precisely.",
    rarity: "~6% of profiles",
  },
  {
    id: "socratic-interrogator",
    name: "The Socratic Interrogator",
    icon: "❓",
    color: "#c94cff",
    description: "You answer questions with better questions. Understanding over output.",
    rarity: "~10% of profiles",
  },
  {
    id: "speed-demon",
    name: "The Speed Demon",
    icon: "⚡",
    color: "#ffd84c",
    description: "Momentum is the whole strategy. Ship, learn, ship again.",
    rarity: "~9% of profiles",
  },
  {
    id: "gardener",
    name: "The Gardener",
    icon: "🌱",
    color: "#7cff5c",
    description: "Many projects, all tended. You grow things slowly and on purpose.",
    rarity: "~8% of profiles",
  },
  {
    id: "deep-diver",
    name: "The Deep Diver",
    icon: "🌊",
    color: "#4c8cff",
    description: "One thing, all the way down. You don't surface until you understand it.",
    rarity: "~9% of profiles",
  },
  {
    id: "diplomat",
    name: "The Diplomat",
    icon: "🤝",
    color: "#ff8c4c",
    description: "Please and thank you, even to a machine. Kindness is your default protocol.",
    rarity: "~6% of profiles",
  },
  {
    id: "skeptic",
    name: "The Skeptic",
    icon: "🧐",
    color: "#9c9cff",
    description: "Trust, but verify — then verify again. You believe what you can check.",
    rarity: "~8% of profiles",
  },
  {
    id: "shapeshifter",
    name: "The Shapeshifter",
    icon: "🦎",
    color: "#4cffd8",
    description: "No single mode fits you. You become whatever the problem needs.",
    rarity: "~9% of profiles",
  },
];

export const ARCHETYPE_IDS = ARCHETYPES.map((a) => a.id);

export function archetypeById(id: string): Archetype {
  return ARCHETYPES.find((a) => a.id === id) ?? ARCHETYPES[ARCHETYPES.length - 1];
}

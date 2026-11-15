// What a creature is naturally good at. Each story problem needs one of these abilities
// (see `needs` on each scene in theatre.js); a creature the player adds can solve the
// problem if the player ticked a matching ability when adding it.
export const TRAITS = [
  { key: 'fly', verb: 'flies over it', label: 'Flies', note: 'wings, light body' },
  { key: 'swim', verb: 'swims across', label: 'Swims', note: 'webbed feet, fins' },
  { key: 'climb', verb: 'climbs right up', label: 'Climbs', note: 'claws, grip' },
  { key: 'dig', verb: 'digs through', label: 'Digs', note: 'strong front paws' },
  { key: 'jump', verb: 'leaps over it', label: 'Jumps high', note: 'long hind legs' },
  { key: 'squeeze', verb: 'slips through the gap', label: 'Squeezes through gaps', note: 'small, slim body' },
  { key: 'strong', verb: 'puts all its strength into it', label: 'Very strong', note: 'can pull or push heavy things' },
  { key: 'fierce', verb: 'stands its ground', label: 'Fierce', note: 'teeth, size, loud roar' },
  { key: 'herd', verb: 'gathers them up', label: 'Herds others', note: 'keeps animals together' },
];
export const TRAIT_KEYS = TRAITS.map((t) => t.key);
export const traitVerb = (k) => (TRAITS.find((t) => t.key === k) || { verb: 'helps' }).verb;
export const traitLabel = (k) => (TRAITS.find((t) => t.key === k) || { label: k }).label.toLowerCase();
// does a creature with these abilities solve a problem that needs any of `needs`?
export const solves = (traits, needs) => !!(traits && needs && traits.some((t) => needs.includes(t)));

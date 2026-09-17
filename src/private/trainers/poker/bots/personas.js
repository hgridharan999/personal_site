// src/private/trainers/poker/bots/personas.js
// The shipped personas: trained dial sets from data/bots-v1.json (scripts/poker/train.js).
import data from '../data/bots-v1.json' with { type: 'json' };

/** @type {import('./contract.js').Persona[]} */
const PERSONAS = Object.freeze(
  data.personas.map(({ id, name, tag, style, brain, dials }) => Object.freeze({ id, name, tag, style, brain, dials: Object.freeze({ ...dials }) })),
);

/** @returns {import('./contract.js').Persona[]} */
export function listPersonas() {
  return PERSONAS;
}

/** @returns {import('./contract.js').Persona} */
export function getPersona(id) {
  const persona = PERSONAS.find((p) => p.id === id);
  if (!persona) throw new Error(`Unknown persona: ${id}`);
  return persona;
}

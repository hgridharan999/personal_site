// src/private/trainers/poker/bots/personas.js
// The 8 placeholder personas from contracts §3.3. Phase 3 replaces the list but keeps these exports.

/** @type {import('./contract.js').Persona[]} */
const PERSONAS = Object.freeze(
  [
    { id: 'moss', name: 'Moss', tag: 'MOS', brain: 'callingStation' },
    { id: 'viper', name: 'Viper', tag: 'VIP', brain: 'randomLegal' },
    { id: 'duchess', name: 'Duchess', tag: 'DCH', brain: 'callingStation' },
    { id: 'rook', name: 'Rook', tag: 'ROK', brain: 'randomLegal' },
    { id: 'ink', name: 'Ink', tag: 'INK', brain: 'callingStation' },
    { id: 'brick', name: 'Brick', tag: 'BRK', brain: 'randomLegal' },
    { id: 'lark', name: 'Lark', tag: 'LRK', brain: 'callingStation' },
    { id: 'sable', name: 'Sable', tag: 'SBL', brain: 'randomLegal' },
  ].map((p) => Object.freeze({ ...p, style: 'placeholder' })),
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

// src/private/trainers/poker/bots/legalize.js
// Maps any intended choice onto a legal one. Never folds when checking is free.

/**
 * @param {{ action:string, amount?:number }} choice
 * @param {{ canCheck:boolean, canRaise:boolean, raiseKind:'bet'|'raise', minRaiseTo:number|null, maxRaiseTo:number|null }} legal
 * @returns {import('./contract.js').BotChoice}
 */
export function legalize(choice, legal) {
  const passive = () => (legal.canCheck ? { action: 'check' } : { action: 'call' });
  const giveUp = () => (legal.canCheck ? { action: 'check' } : { action: 'fold' });
  switch (choice.action) {
    case 'bet':
    case 'raise': {
      if (!legal.canRaise) return passive();
      const wanted = Number.isFinite(choice.amount) ? Math.round(choice.amount) : legal.minRaiseTo;
      return { action: legal.raiseKind, amount: Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, wanted)) };
    }
    case 'call':
      return passive();
    case 'check':
    case 'fold':
    default:
      return giveUp();
  }
}

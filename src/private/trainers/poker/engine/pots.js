// Main and side pots from each player's total contribution to the hand.

const sameSeats = (a, b) => a.length === b.length && a.every((seat, i) => seat === b[i]);

/**
 * @param {{seat:number,total:number,folded:boolean}[]} contributions in table order
 * @returns {{amount:number, eligible:number[]}[]}
 */
export function buildPots(contributions) {
  const levels = [...new Set(contributions.map((x) => x.total).filter((t) => t > 0))].sort((a, b) => a - b);
  const pots = [];
  let previous = 0;
  let carry = 0;
  for (const level of levels) {
    let amount = carry;
    carry = 0;
    for (const x of contributions) amount += Math.min(x.total, level) - Math.min(x.total, previous);
    const eligible = contributions.filter((x) => !x.folded && x.total >= level).map((x) => x.seat);
    const last = pots[pots.length - 1];
    if (eligible.length === 0) {
      if (last) last.amount += amount;
      else carry = amount;
    } else if (last && sameSeats(last.eligible, eligible)) {
      last.amount += amount;
    } else {
      pots.push({ amount, eligible });
    }
    previous = level;
  }
  if (carry > 0 && pots.length > 0) pots[pots.length - 1].amount += carry;
  return pots;
}

/**
 * @param {{amount:number, eligible:number[]}[]} pots
 * @param {(seat:number) => number} scoreOf higher wins
 * @param {number[]} seatOrder seats clockwise starting left of the button
 */
export function awardPots(pots, scoreOf, seatOrder) {
  const awards = {};
  const out = pots.map((pot) => {
    let winners = pot.eligible;
    if (pot.eligible.length > 1) {
      let best = -Infinity;
      winners = [];
      for (const seat of pot.eligible) {
        const score = scoreOf(seat);
        if (score > best) {
          best = score;
          winners = [seat];
        } else if (score === best) {
          winners.push(seat);
        }
      }
    }
    winners = winners.slice().sort((a, b) => seatOrder.indexOf(a) - seatOrder.indexOf(b));
    const share = Math.floor(pot.amount / winners.length);
    let odd = pot.amount - share * winners.length;
    for (const seat of winners) {
      const extra = odd > 0 ? 1 : 0;
      odd -= extra;
      awards[seat] = (awards[seat] ?? 0) + share + extra;
    }
    return { ...pot, winners };
  });
  return { pots: out, awards };
}

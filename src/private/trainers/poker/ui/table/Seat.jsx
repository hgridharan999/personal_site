// src/private/trainers/poker/ui/table/Seat.jsx
import Card from '../sprites/Card';
import PixelBitmap from '../sprites/PixelBitmap';
import { CHIP_GLYPH } from '../sprites/glyphs.js';
import { formatBb } from '../../lib/format.js';

/** Chips in front of a seat (or flying to the pot when `className` is pk-fly). */
export function BetChips({ amount, slot, className = '', onAnimationEnd }) {
  return (
    <div className={`pk-bet pk-bet--slot${slot} ${className}`.trim()} onAnimationEnd={onAnimationEnd}>
      <PixelBitmap rows={CHIP_GLYPH} px={2} className="pk-chip" />
      <span>{formatBb(amount)}</span>
    </div>
  );
}

function cardSize(isHero, card) {
  if (isHero) return 'hero';
  return card === null ? 'mini' : 'board';
}

function seatLabel({ name, stack, allIn, folded, isButton }) {
  const parts = [name, `${formatBb(stack)} BB`];
  if (allIn) parts.push('all-in');
  if (folded) parts.push('folded');
  if (isButton) parts.push('dealer');
  return parts.join(', ');
}

/** One seat tile from a SeatView (lib/tableView.js). */
export default function Seat({ seat, handNo }) {
  const { slot, isHero, tag, name, stack, bet, isButton, isActive, folded, allIn, cards, won } = seat;
  const classes = [
    'pk-seat',
    `pk-seat--slot${slot}`,
    isHero && 'pk-seat--hero',
    isActive && 'pk-seat--active',
    folded && 'pk-seat--folded',
    won > 0 && 'pk-seat--won',
  ].filter(Boolean).join(' ');

  return (
    <>
      <div className={classes} role="group" aria-label={seatLabel(seat)}>
        {cards && (
          <div className="pk-seat__cards">
            {cards.map((card, i) => (
              <Card key={`${handNo}-${i}-${card ?? 'back'}`} card={card} size={cardSize(isHero, card)} className="pk-card--deal" />
            ))}
          </div>
        )}
        <div className="pk-seat__tile" aria-hidden="true">
          {tag}
          {isButton && <span className="pk-dealer">D</span>}
        </div>
        <div className="pk-seat__name" aria-hidden="true">{name}</div>
        <div className="pk-seat__stack" aria-hidden="true">{allIn ? 'ALL-IN' : formatBb(stack)}</div>
        {won > 0 && <div className="pk-seat__won">+{formatBb(won)}</div>}
      </div>
      {bet > 0 && <BetChips amount={bet} slot={slot} />}
    </>
  );
}

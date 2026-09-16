import PixelBitmap from './PixelBitmap';
import { rankGlyph, suitGlyph } from './glyphs.js';
import { cardLabel, isRedCard } from '../../lib/format.js';
import './sprites.css';

// Pixel scale per size: ranks at 3 px on the board and 4 px in the hero's hand, suits at 2 px and 3 px.
const SCALE = {
  board: { rankPx: 3, suitPx: 2 },
  hero: { rankPx: 4, suitPx: 3 },
};

/**
 * A face-up card, or a face-down back when `card` is null.
 * size: 'board' (46x64), 'hero' (64x90) or 'mini' (22x30, backs only).
 */
export default function Card({ card, size = 'board', className = '' }) {
  const classes = `pk-card pk-card--${size} ${className}`.trim();
  if (card === null || card === undefined) {
    return (
      <div className={`${classes} pk-card--back`} role="img" aria-label="Face-down card">
        <div className="pk-card__face" />
      </div>
    );
  }
  const { rankPx, suitPx } = SCALE[size] ?? SCALE.board;
  const suit = suitGlyph(card);
  return (
    <div className={classes} role="img" aria-label={cardLabel(card)}>
      <div className={`pk-card__face ${isRedCard(card) ? 'pk-ink-red' : 'pk-ink-black'}`}>
        <span className="pk-card__corner">
          <PixelBitmap rows={rankGlyph(card)} px={rankPx} />
          <PixelBitmap rows={suit} px={suitPx} />
        </span>
        <span className="pk-card__pip">
          <PixelBitmap rows={suit} px={suitPx} />
        </span>
      </div>
    </div>
  );
}

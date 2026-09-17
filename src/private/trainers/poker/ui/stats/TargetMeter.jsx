import { meterGeometry } from './statsView';

const W = 120;
const H = 14;
const MARK = 4;

/** Value marker on a 0–100% track with the target band. The status text beside it carries the flag. */
export default function TargetMeter({ value, target, flag, label }) {
  const { band, marker } = meterGeometry(value, target, W, MARK);
  const markClass = `pk-meter__mark pk-meter__mark--${flag ?? 'low'}`;
  return (
    <svg className="pk-meter" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={label}>
      <rect className="pk-meter__track" x={0} y={5} width={W} height={4} />
      {band && <rect className="pk-meter__band" x={band.x} y={3} width={band.width} height={8} />}
      {marker && <rect className={markClass} x={marker.x} y={0} width={MARK} height={H} />}
    </svg>
  );
}

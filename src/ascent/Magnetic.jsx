import { useMagnetic } from './useMagnetic';

/**
 * Wraps children in a magnetic element. Mark an inner node with `data-mag-child`
 * to give it an extra, stronger pull (parallax within the button).
 */
export default function Magnetic({ as: Tag = 'span', strength, childStrength, style, children, ...rest }) {
  const ref = useMagnetic(strength, childStrength);
  return (
    <Tag ref={ref} style={{ display: 'inline-block', willChange: 'transform', ...style }} {...rest}>
      {children}
    </Tag>
  );
}

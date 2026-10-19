import { useRef } from 'react';
import './band.css';
import BandFallback from './BandFallback.jsx';
import DeepFooter from './DeepFooter.jsx';
import { useIcebergGL } from './useIcebergGL.js';

/**
 * The page's one animation: it ends by going under the surface. The SVG iceberg paints first;
 * the canvas is added (and the SVG hidden) once the band is a screen away and WebGL works.
 * Render inside the page's `.hm` root: the styles are scoped to it. The band has no accessible
 * name on purpose: it is decoration, and a named section would announce an empty landmark.
 */
export default function Ending() {
  const bandRef = useRef(null);
  const { status, motion, paused, toggle } = useIcebergGL(bandRef);

  return (
    <>
      <section className="band" ref={bandRef} data-gl={status}>
        <BandFallback />
      </section>
      <DeepFooter motion={motion} paused={paused} onToggle={toggle} />
    </>
  );
}

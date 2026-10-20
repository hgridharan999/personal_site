import { forwardRef } from 'react';

// 240px thumbnails live beside the 1600px photos, in /hikes/t/.
const thumbOf = (src) => src.replace('/hikes/', '/hikes/t/');

const STATS = [['Elevation', 'elevation'], ['Distance', 'distance'], ['Grade', 'difficulty']];

// The data marks an unknown figure with a dash or leaves it empty; a real one has a letter or digit.
const known = (value) => /\w/.test(value ?? '');

function Photos({ hike, photo, onPhoto }) {
  const photos = hike.photos ?? [];
  const count = photos.length;
  const alt = count > 1 ? `${hike.name}, photo ${photo + 1} of ${count}` : hike.name;
  return (
    <>
      <figure className="sp-photo">
        {count > 0
          ? <img src={photos[photo] ?? photos[0]} alt={alt} decoding="async" fetchpriority="high" />
          : <p className="sp-status">No photos yet.</p>}
      </figure>
      {count > 1 && (
        <div className="sp-thumbs">
          {photos.map((src, idx) => (
            <button
              key={src}
              type="button"
              className="sp-thumb"
              aria-pressed={idx === photo}
              aria-label={`Photo ${idx + 1} of ${count}`}
              onClick={() => onPhoto(idx)}
              onMouseEnter={() => onPhoto(idx)}
            >
              <img src={thumbOf(src)} alt="" decoding="async" />
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * The selected hike: photo and thumbnails, then title, stats, review and highlights. It takes a ref
 * so the page can scroll it into view on a phone, where it sits above the list. The polite line
 * below tells a screen reader what a click on a row or pin changed, since the change is elsewhere.
 */
const HikeDetail = forwardRef(function HikeDetail({ hike, index, total, photo, onPhoto }, ref) {
  const meta = [hike.date, hike.location].filter(Boolean).join(' · ');
  const stats = STATS.filter(([, key]) => known(hike[key]));
  return (
    <article className="sp-detail" ref={ref}>
      <p className="sr-only" aria-live="polite">{`${hike.name}, hike ${index + 1} of ${total}`}</p>
      <Photos hike={hike} photo={photo} onPhoto={onPhoto} />
      <h2 className="sp-hike-title">{hike.name}</h2>
      {meta && <p className="sp-hike-meta">{meta}</p>}
      {stats.length > 0 && (
        <dl className="sp-stats">
          {stats.map(([label, key]) => (
            <div key={key}><dt>{label}</dt><dd>{hike[key]}</dd></div>
          ))}
        </dl>
      )}
      {hike.review && <p className="sp-text">{hike.review}</p>}
      {hike.highlights?.length > 0 && <p className="sp-hike-hl">{hike.highlights.join(' · ')}</p>}
    </article>
  );
});

export default HikeDetail;

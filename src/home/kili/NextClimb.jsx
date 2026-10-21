import { NEXT_CLIMB } from '../content';

/**
 * "Next climb": the ledger's last section, one line in the same style as a row's one-liner.
 * It lives in the page's <main>, just above the drawing it describes.
 */
export default function NextClimb() {
  const { id, title, lead, rest } = NEXT_CLIMB;
  return (
    <section className="kili-next" aria-labelledby={id}>
      <h2 className="head" id={id}>{title}</h2>
      <p className="line"><span className="lead">{lead}</span>{rest}</p>
    </section>
  );
}

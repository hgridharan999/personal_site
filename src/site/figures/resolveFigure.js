/**
 * Decides what a markdown fenced block should become. A block tagged `figure` holds a figure name
 * and renders that figure; every other block is ordinary code.
 * `children` is what react-markdown hands the `pre` override: one `code` element.
 * Returns { kind: 'code' }, { kind: 'unknown' } or { kind: 'figure', Component }.
 */
export function resolveFigure(children, figures) {
  const code = Array.isArray(children) ? children[0] : children;
  const props = code && code.props;
  if (!props || !/(^|\s)language-figure(\s|$)/.test(props.className || '')) return { kind: 'code' };
  const name = String(props.children ?? '').trim();
  const Component = Object.hasOwn(figures, name) ? figures[name] : null;
  return Component ? { kind: 'figure', Component } : { kind: 'unknown' };
}

import { paragraphLineGeometry } from './paragraph-geometry.mjs';
import { alignTextRow } from './line-alignment.mjs';

// Fragment geometry/diagnostics are recomputed, never inherited from a carrier.
export function alignPictureFragment(fragment, paragraphShape, lastLine) {
  const { alignmentUnavailable: _stale, ...current } = fragment;
  const offset = paragraphLineGeometry(
    { alignment: paragraphShape?.alignment },
    current.width,
    current.boundaries.at(-1).x,
    false,
  ).x;
  const aligned = alignTextRow(
    {
      ...current,
      kind: 'text',
      paragraphShape,
      x: current.x + offset,
      width: current.width - offset,
    },
    { lastLine },
  );
  const { kind: _kind, paragraphShape: _shape, ...result } = aligned;
  return { ...result, paragraphReferenceX: -offset, paragraphReferenceWidth: current.width };
}

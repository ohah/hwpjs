import { exactDisplayValue } from './full-snapshot-text-delta.ts';
import type { GeometryOwner } from './native-geometry-evidence.ts';
// A controller-derived history proof, not a synthesized Native delta receipt.
export function validateHistoryTextSnapshots(
  before: any,
  next: any,
  owner: GeometryOwner,
  beforeEpoch: string,
  epoch: string,
  scope: string,
): boolean {
  try {
    for (const snapshot of [before, next])
      if (
        snapshot === null ||
        typeof snapshot !== 'object' ||
        Reflect.ownKeys(snapshot).some(
          (key) => !('value' in Object.getOwnPropertyDescriptor(snapshot, key)!),
        )
      )
        return false;
    if (
      !Object.isFrozen(before) ||
      !Object.isFrozen(next) ||
      before?.format !== 'hwp5' ||
      next?.format !== 'hwp5' ||
      before.readOnly !== false ||
      next.readOnly !== false ||
      before.limited !== false ||
      next.limited !== false ||
      before.window ||
      next.window ||
      before.viewKind ||
      next.viewKind ||
      !Array.isArray(before.paragraphs) ||
      !Array.isArray(next.paragraphs) ||
      before.paragraphs.length !== next.paragraphs.length
    )
      return false;
    const { paragraphs: ap, ...ah } = before,
      { paragraphs: bp, ...bh } = next;
    if (!exactDisplayValue(ah, bh)) return false;
    const ids = new Set((before.characterShapes ?? []).map((s: any) => s.id));
    let found = 0;
    const ranges = (p: any) => {
      if (
        typeof p.text !== 'string' ||
        !p.text.isWellFormed() ||
        Array.from(p.text).some((c: any) => c.charCodeAt(0) < 32 || c === '\ufffc') ||
        !Array.isArray(p.characterRanges)
      )
        return false;
      let at = 0;
      for (const r of p.characterRanges) {
        if (
          r.start !== at ||
          !Number.isSafeInteger(r.end) ||
          r.end < r.start ||
          r.end > p.text.length ||
          !ids.has(r.charShapeId)
        )
          return false;
        at = r.end;
      }
      return at === p.text.length;
    };
    for (let i = 0; i < ap.length; i++) {
      const a = ap[i],
        b = bp[i],
        ar = a.currentReference,
        br = b.currentReference;
      if (
        !ar ||
        !br ||
        ar.kind !== 'original' ||
        br.kind !== 'original' ||
        ar.epoch !== beforeEpoch ||
        br.epoch !== epoch ||
        ar.scope !== scope ||
        br.scope !== scope
      )
        return false;
      const { epoch: _a, ...av } = ar,
        { epoch: _b, ...bv } = br;
      if (!exactDisplayValue(av, bv)) return false;
      const { currentReference: _ar, ...ax } = a,
        { currentReference: _br, ...bx } = b;
      if (a.section === owner.section && a.paragraph === owner.paragraph) {
        found++;
        if (
          ar.id !== String(owner.sourceNode) ||
          a.editable !== true ||
          b.editable !== true ||
          a.clipped ||
          b.clipped ||
          a.sourceOffsets ||
          b.sourceOffsets ||
          !ranges(a) ||
          !ranges(b)
        )
          return false;
        const { text: _at, characterRanges: _ac, ...aa } = ax,
          { text: _bt, characterRanges: _bc, ...bb } = bx;
        if (!exactDisplayValue(aa, bb)) return false;
      } else if (!exactDisplayValue(ax, bx)) return false;
    }
    return found === 1;
  } catch {
    return false;
  }
}

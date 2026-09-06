import { ownedShapeDocument } from "./owned-shape-document.mjs";
import { curveOwnerActual, curveOwnerRun } from "./curve-validation.mjs";
export function curveDocumentReference(call, cfb) {
  const {objects, ...rest} = ownedShapeDocument(call, cfb, {
    file: '3-09월_교육_통합_2022.hwp', tag: 83, count: 1, group: 'curves', field: 4,
    maxDecodedBytes: 128 * 1024 * 1024,
    minimum: (b, r) => { const n = b.readInt32LE(r.start); return 4 + n * 8 + Math.max(0, n - 1); },
    actual: curveOwnerActual, run: curveOwnerRun,
    missing: /MissingCurve/, duplicate: /DuplicateCurve/, orphan: /OrphanCurve/,
    mutate: (b, at) => { b[at + 4 + b.readInt32LE(at) * 8] = 255; },
    invalidMutations: (b, r) => [-1, b.readInt32LE(r.start) + 1].map(n => {
      const bytes = Buffer.from(b); bytes.writeInt32LE(n, r.start);
      return {bytes, error: n < 0 ? /NegativePointCount/ : /UnexpectedEnd/};
    }),
  });
  return {...rest, ...(objects === undefined ? {} : {curves: objects})};
}

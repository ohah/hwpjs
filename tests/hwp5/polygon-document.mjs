import { ownedShapeDocument } from "./owned-shape-document.mjs";
import { polygonOwnerActual, polygonOwnerRun } from "./polygon-validation.mjs";
export function polygonDocumentReference(call, cfb) {
  const {objects, ...rest} = ownedShapeDocument(call, cfb, {
    file: 'shape-001.hwp', tag: 82, count: 2, group: 'polygons', field: 2,
    minimum: (b, r) => 4 + b.readInt32LE(r.start) * 8,
    actual: polygonOwnerActual, run: polygonOwnerRun,
    missing: /MissingPolygon/, duplicate: /DuplicatePolygon/, orphan: /OrphanPolygon/,
    mutate: (b, at) => b.writeInt32LE(0, at),
    invalidMutations: (b, r) => [-1, b.readInt32LE(r.start) + 1].map(n => {
      const bytes = Buffer.from(b); bytes.writeInt32LE(n, r.start);
      return {bytes, error: n < 0 ? /NegativePointCount/ : /UnexpectedEnd/};
    }),
  });
  return {...rest, ...(objects === undefined ? {} : {polygons: objects})};
}

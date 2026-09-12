import assert from "node:assert/strict";
import {videoEdges} from "./video-data.mjs";
import {memoShapeEdges} from "./memo-shape.mjs";
import {memoShapePair} from "./memo-shape-pair.mjs";
import {memoResourceEdges,memoResourceDocument} from "./memo-resource.mjs";
import {memoListEdges,memoListReference,memoListDocument} from "./memo-list.mjs";
import {memoListGroupEdges} from "./memo-list-groups.mjs";
import {memoOwnerEdges} from "./memo-owner.mjs";
import {memoFieldEdges,memoFieldReference,memoFieldDocument} from "./memo-field.mjs";
import {memoReferencesActual,memoReferenceDocument} from "./memo-references.mjs";
import {memoRangesActual,memoRangeMutations} from "./memo-ranges.mjs";
import {forbiddenCharEdges,forbiddenCharActual} from "./forbidden-chars.mjs";
import {forbiddenDocument} from "./forbidden-document.mjs";
import {trackAuthorEdges,trackAuthorDocument} from "./track-author.mjs";
import {trackChangeEdges,trackChangeDocument} from "./track-change.mjs";
import {viewTextDocument} from "./view-text.mjs";
import {viewSemanticActual} from "./view-semantic.mjs";
import {distributionEdges,distributionActual} from "./distribution.mjs";
import {distributionContainerActual} from "./distribution-container.mjs";
import {distributionContainerEdges} from "./distribution-container-edges.mjs";
import {distributionPolicyEvidence} from "./distribution-policy-evidence.mjs";
import {revisionDeleteEdges} from "./revision-delete.mjs";
import {revisionSignEdges,revisionSignActual} from "./revision-sign.mjs";
import {revisionProjectionEdges,revisionProjectionActual} from "./revision-projection.mjs";
import {revisionGroupEdges,revisionGroupActual} from "./revision-groups.mjs";
import {revisionTextEdges,revisionTextActual} from "./revision-text.mjs";
import {revisionCoordinateEdges,revisionCoordinateActual} from "./revision-coordinates.mjs";
import {formObjectEdges,formObjectActual} from "./form-object.mjs";
import {formPropertyEdges,formPropertyActual} from "./form-property.mjs";
import {formControlEdges,formControlActual} from "./form-control.mjs";
import {formLinkEdges,formLinkActual} from "./form-links.mjs";
import {formSchemaEdges,formSchemaActual} from "./form-schema.mjs";
import {formDocumentActual} from "./form-document.mjs";
import {formSemanticsEdges} from "./form-semantics.mjs";
import {formMaxLengthEdges,formMaxLengthActual} from "./form-max-length.mjs";
import {memoEndEdges,memoEndActual} from "./memo-end.mjs";
import {paragraphFlowEdges,paragraphFlowActual} from "./paragraph-flows.mjs";
import {groupInfoEdges} from "./group-info.mjs";
import {groupInfoPair} from "./group-info-pair.mjs";
import {groupOwnerEdges,groupDocumentReference} from "./group-validation.mjs";
import { connectorEdges } from "./shape-connector.mjs";
import { connectorPair } from "./connector-pair.mjs";
import {connectorOwnerEdges,connectorDocumentReference} from "./connector-validation.mjs";
import { documentActual, documentEdges } from "./documents.mjs";
import { containerActual, containerEdges } from "./containers.mjs";
import {containerImagesEdges, containerImagesActual} from './container-images.mjs';
import {containerJpegEdges} from './container-jpeg.mjs';
import {containerBmpEdges} from './container-bmp.mjs';
import {bmpEdges} from './bmp.mjs';
import {bmpRleEdges} from './bmp-rle.mjs';
import {bmpRleRgbaEdges} from './bmp-rle-rgba.mjs';
import {bmpProfileEdges} from './bmp-profile.mjs';
import {gifEdges,gifActual} from './gif.mjs';
import {previewImageEdges,previewImageActual} from './preview-image.mjs';
import {imageSignature} from './preview-image-evidence.mjs';
import {containerBmpProfileEdges} from './container-bmp-profile.mjs';
import {containerBmpRleEdges} from './container-bmp-rle.mjs';
import {jpegFramingEdges} from './jpeg-framing.mjs';
import {jpegHeaderEdges} from './jpeg-headers.mjs';
import {jpegTablesEdges} from './jpeg-tables.mjs';
import {jpegStoreEdges} from './jpeg-store.mjs';
import {jpegProgressiveEdges} from './jpeg-progressive.mjs';
import {jpegStructureEdges} from './jpeg-structure.mjs';
import {jpegCodecEdges} from './jpeg-codec.mjs';
import {jpegSequentialEdges} from './jpeg-sequential.mjs';
import {jpegScanEdges} from './jpeg-scan.mjs';
import {jpegFrameEdges} from './jpeg-frame.mjs';
import {jpegDequantEdges} from './jpeg-dequant.mjs';
import {jpegIdctEdges} from './jpeg-idct.mjs';
import {jpegFrameSamplesEdges} from './jpeg-frame-samples.mjs';
import {jpegPlanesEdges} from './jpeg-planes.mjs';
import {jpegJfifEdges} from './jpeg-jfif.mjs';
import {jpegJfxxEdges} from './jpeg-jfxx.mjs';
import {jpegJfxxJpegEdges} from './jpeg-jfxx-jpeg.mjs';
import {jpegJfifLayoutEdges} from './jpeg-jfif-layout.mjs';
import {jpegJfifColourEdges} from './jpeg-jfif-colour.mjs';
import {jpegUpsamplingEdges} from './jpeg-upsampling.mjs';
import {jpegIccEdges} from './jpeg-icc.mjs';
import {jpegAdobeEdges} from './jpeg-adobe.mjs';
import {jpegRgbEdges} from './jpeg-rgb.mjs';
import {progressiveBlockEdges} from './jpeg-progressive-block.mjs';
import {progressiveScanEdges} from './jpeg-progressive-scan.mjs';
import {progressiveFrameEdges} from './jpeg-progressive-frame-cases.mjs';
import {progressiveSamplesEdges} from './jpeg-progressive-samples.mjs';
import {progressiveRgbEdges} from './jpeg-progressive-rgb.mjs';
import {jpegFrameDequantEdges} from './jpeg-frame-dequant.mjs';
import { previewEdges } from "./preview.mjs";
import { summaryEdges } from "./summary.mjs";
import { codepageEdges } from "./codepage.mjs";
import { scriptEdges } from "./scripts.mjs";
import { xmlTemplateEdges } from "./xml-template.mjs";
import { optionalSurvey } from "./optional-survey.mjs";
import { historyEdges, historyActual } from "./history.mjs";
import { historyDateEdges, historyDateActual } from "./history-date.mjs";
import {historyContainerActual} from './history-container.mjs';
import {xmlTemplateContainerEdges} from './xml-template-container.mjs';
import {historyLastDocumentEdges} from './history-last-document.mjs';
import {xmlInputEdges} from './xml-input.mjs';
import {xmlPrologEdges} from './xml-prolog.mjs';
import {xmlReferenceEdges} from './xml-reference.mjs';
import {xmlTagEdges} from './xml-tag.mjs';
import {xmlDocumentEdges} from './xml-document.mjs';
import {xmlNamespaceEdges} from './xml-namespace.mjs';
import {xmlContainerEdges} from './xml-container.mjs';
import {pngStructureEdges} from './png-structure.mjs';
import {zlibEdges} from './zlib.mjs';
import {pngFilterEdges} from './png-filter.mjs';
import {pngPixelsEdges} from './png-pixels.mjs';
import {pngTransparencyEdges} from './png-transparency.mjs';
import {pngPaletteMetadataEdges} from './png-palette-metadata.mjs';
import {pngSampleMetadataEdges} from './png-sample-metadata.mjs';
import {pngTimestampEdges} from './png-timestamp.mjs';
import {pngTextEdges} from './png-text.mjs';
import {pngCompressedTextEdges} from './png-compressed-text.mjs';
import {bcp47Edges} from './bcp47.mjs';
import {registryEdges} from './bcp47-registry.mjs';
import {pngInternationalEdges} from './png-international.mjs';
import {pngSuggestedEdges} from './png-suggested.mjs';
import {pngColorFixedEdges} from './png-color-fixed.mjs';
import {pngSrgbEdges} from './png-srgb.mjs';
import {pngProfileEdges} from './png-profile.mjs';
import {pngRequiredEdges} from './png-required-inspection.mjs';
import {pngPayloadEdges} from './png-payload-inspection.mjs';
import {pngV2TextEdges} from './png-v2-text.mjs';
import {pngV2UnicodeEdges} from './png-v2-unicode.mjs';
import {iccEdges} from './icc.mjs';
import {iccSemanticEdges} from './icc-semantics.mjs';
import {iccRegistryEdges} from './icc-registry.mjs';
import {iccXyzEdges} from './icc-xyz.mjs';
import {iccXyzTagEdges} from './icc-xyz-tags.mjs';
import {iccCurveEdges} from './icc-curve.mjs';
import {iccParametricEdges} from './icc-parametric.mjs';
import {iccTrcEdges} from './icc-trc.mjs';
import {iccInverseEdges} from './icc-inverse.mjs';
import {iccForwardEdges} from './icc-forward.mjs';
import {iccAnalyticEdges} from './icc-analytic.mjs';
import {iccTrcForwardEdges} from './icc-trc-forward.mjs';
import {iccRequiredEdges} from './icc-required.mjs';
import {iccMlucEdges} from './icc-mluc.mjs';
import {iccUnicodeEdges} from './icc-unicode.mjs';
import {iccSelectionEdges} from './icc-selection.mjs';
import {iccSelectionIanaEdges} from './icc-selection-iana.mjs';
import {adaptationEdges} from './icc-adaptation.mjs';
import {matrixEdges} from './icc-matrix.mjs';
import {fractionMatrixInverseEdges} from './icc-fraction-matrix-inverse.mjs';
import {wideLinearTargetEdges} from './icc-wide-linear-target.mjs';
import {modelEdges} from './icc-model.mjs';
import {modelForwardEdges} from './icc-model-forward.mjs';
import {normalizedInverseEdges} from './icc-normalized-inverse.mjs';
import {sampledWideInverseEdges} from './icc-sampled-wide-inverse.mjs';
import {gammaInverseEdges} from './icc-gamma-inverse.mjs';
import {parametricDomainEdges} from './icc-parametric-domain.mjs';
import {parametricTopologyEdges} from './icc-parametric-topology.mjs';
import {segmentEdges} from './icc-segments.mjs';
import {partitionEdges} from './icc-partition.mjs';
import {powerLevelEdges} from './icc-power-level.mjs';
import {rootCompareEdges} from './icc-root-compare.mjs';
import {rootLocationsEdges} from './icc-root-locations.mjs';
import {powerOrderEdges} from './icc-power-order.mjs';
import {rationalPowerEdges} from './icc-rational-power.mjs';
import {parametricJumpEdges} from './icc-parametric-jump.mjs';
import {parametricTrendEdges} from './icc-parametric-trend.mjs';
import {linearPreimageEdges} from './icc-linear-preimage.mjs';
import {normalizedPowerLevelEdges} from './icc-normalized-power-level.mjs';
import {gammaWideInverseEdges} from './icc-gamma-wide-inverse.mjs';
import {widePowerLevelEdges} from './icc-wide-power-level.mjs';
import {extendedRootCompareEdges} from './icc-extended-root-compare.mjs';
import {extendedLocationsEdges} from './icc-extended-locations.mjs';
import {extendedLinearPreimageEdges} from './icc-extended-linear-preimage.mjs';
import {extendedFractionFloatEdges} from './icc-extended-fraction-float.mjs';
import {normalizedRootCompareEdges} from './icc-normalized-root-compare.mjs';
import {normalizedLocationsEdges} from './icc-normalized-locations.mjs';
import {powerPreimageEdges} from './icc-power-preimage.mjs';
import {parametricPreimageEdges} from './icc-parametric-preimage.mjs';
import {preimageBoundsEdges} from './icc-preimage-bounds.mjs';
import {extendedRootOrderEdges} from './icc-extended-root-order.mjs';
import {attainedInverseEdges} from './icc-attained-inverse.mjs';
import {nearestRangeEdges} from './icc-nearest-range.mjs';
import {linearRangeEdges} from './icc-linear-range.mjs';
import {powerRangeEdges} from './icc-power-range.mjs';
import {parametricRangeEdges} from './icc-parametric-range.mjs';
import {ordinateOrderEdges} from './icc-ordinate-order.mjs';
import {powerNearestEdges} from './icc-power-nearest.mjs';
import {ordinateDistanceEdges} from './icc-ordinate-distance.mjs';
import {parametricNearestEdges} from './icc-parametric-nearest.mjs';
import {parametricInverseEdges} from './icc-parametric-inverse.mjs';
import {trcInverseEdges} from './icc-trc-inverse.mjs';
import {modelInverseEdges} from './icc-model-inverse.mjs';
import {fractionModelInverseEdges} from './icc-fraction-model-inverse.mjs';
import {powerClipEdges} from './icc-power-clip.mjs';
import {modelParametricEdges} from './icc-model-parametric.mjs';
import {iso639Edges} from './iso639.mjs';
import {languageHistoryEdges} from './language-history.mjs';
import { compatibilityEdges } from "./compatibility.mjs";
import { headerFooterActual, headerFooterEdges } from "./header-footer.mjs";
import { headerFooterDocumentEdges } from "./header-footer-document.mjs";
import { numberControlEdges } from "./number-controls.mjs";
import { numberDocumentEdges } from "./number-control-document.mjs";
import { pageNumberEdges, pageNumberDocumentEdges } from "./page-number.mjs";
import { indexMarkEdges } from "./index-mark.mjs";
import { indexMarkReference } from "./index-mark-reference.mjs";
import { visibilityEdges, visibilityReference } from "./page-visibility.mjs";
import { bookmarkEdges } from "./bookmarks.mjs";
import { bookmarkReference } from "./bookmark-reference.mjs";
import { overlapEdges } from "./char-overlap.mjs";
import { overlapReference } from "./char-overlap-reference.mjs";
import { memoEdges } from "./memo-identity.mjs";
import { fieldEdges } from "./fields.mjs";
import { fieldDocumentEdges } from "./field-document.mjs";
import { rubyEdges } from "./ruby.mjs";
import { rubyDocumentEdges } from "./ruby-document.mjs";
import { hiddenEdges } from "./hidden-comment.mjs";
import { hiddenReference } from "./hidden-comment-reference.mjs";
import { noteControlEdges, noteControlReference } from "./note-control.mjs";
import { noteValidationEdges } from "./note-validation.mjs";
import { equationEdges, equationReference } from "./equation.mjs";
import { equationValidationEdges } from "./equation-validation.mjs";
import { oleEdges, oleReference } from "./ole.mjs";
import { oleValidationEdges } from "./ole-validation.mjs";
import { storageEdges } from "./storage-extension.mjs";
import { oleReferenceEvidence } from "./ole-reference-evidence.mjs";
import {oleReferencePolicyActual} from './ole-reference-policy.mjs';
import {oleContainers} from './ole-container.mjs';
import {oleBinaries} from './ole-binaries.mjs';
import { shapeComponentEdges, shapeComponentReference } from "./shape-component.mjs";
import { shapeValidationEdges } from "./shape-validation.mjs";
import { shapeBorderEdges, shapeBorderReference } from "./shape-border.mjs";
import { drawingStyleEdges } from "./drawing-style.mjs";
import { drawingStyleSurvey } from "./drawing-style-survey.mjs";
import {videoValidationActual} from './video-validation.mjs';
import { styleDocumentReference } from "./drawing-style-document.mjs";
import { lineEdges } from "./shape-line.mjs";
import { lineOwnerEdges } from "./line-validation.mjs";
import { lineDocumentReference } from "./line-document.mjs";
import { rectangleEdges } from "./shape-rectangle.mjs";
import { rectanglePair } from "./rectangle-pair.mjs";
import { rectangleOwnerEdges } from "./rectangle-validation.mjs";
import { rectangleDocumentReference } from "./rectangle-document.mjs";
import { ellipseEdges } from "./shape-ellipse.mjs";
import { arcEdges } from "./shape-arc.mjs";
import { polygonEdges } from "./shape-polygon.mjs";
import { polygonPair } from "./polygon-pair.mjs";
import { curveEdges } from "./shape-curve.mjs";
import { curvePair } from "./curve-pair.mjs";
import { pictureEdges } from "./shape-picture.mjs";
import { picturePair } from "./picture-pair.mjs";
import { colorEdges } from "./picture-color.mjs";
import { effectsEdges } from "./picture-effects.mjs";
import { additionalEdges } from "./picture-additional.mjs";
import { pictureOwnerEdges } from "./picture-validation.mjs";
import { pictureDocumentReference } from "./picture-document.mjs";
import { pictureSelectedDocument } from "./picture-selected-document.mjs";
import { pictureReferenceEdges,pictureReferenceDocuments } from "./picture-references.mjs";
import { curveOwnerEdges } from "./curve-validation.mjs";
import { curveDocumentReference } from "./curve-document.mjs";
import { curveLayoutDocument } from "./curve-layout-document.mjs";
import { polygonOwnerEdges } from "./polygon-validation.mjs";
import { polygonDocumentReference } from "./polygon-document.mjs";
import { polygonLayoutDocument } from "./polygon-layout-document.mjs";
import { arcOwnerEdges } from "./arc-validation.mjs";
import { arcDocumentEdges } from "./arc-document.mjs";
import { arcSurvey } from "./arc-survey.mjs";
import { ellipsePair } from "./ellipse-pair.mjs";
import { ellipseOwnerEdges } from "./ellipse-validation.mjs";
import { ellipseDocumentReference } from "./ellipse-document.mjs";
import { parameterZeroReference } from "./parameter-zero-reference.mjs";
import { presentationReferenceEdges } from "./presentation-reference.mjs";
import {
  reportWireEdges,
  reportOrderingEdges,
} from "./document-report-edges.mjs";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import {
  deflateRawSync,
  inflateRawSync,
  deflateSync,
  gzipSync,
  constants,
} from "node:zlib";
import { createCfbReader } from "../../js/cfb.mjs";
import { checkDocinfo, checkDocinfoEdges } from "./docinfo.mjs";
import { resourceEdges, resourceActual } from "./resources.mjs";
import { shapeEdges, shapeMutations } from "./shapes.mjs";
import { referenceEdges, referenceActual } from "./references.mjs";
import { checkBody, bodyEdges, bodyMutations } from "./body.mjs";
import { metadataActual, metadataEdges } from "./metadata.mjs";
import { controlEdges } from "./controls.mjs";
import { treeActual, treeEdges } from "./tree.mjs";
import { sectionActual, sectionEdges } from "./sections.mjs";
import { notePair } from "./note-pair.mjs";
import { linksActual, linkEdges } from "./links.mjs";
import { columnEdges, columnPair } from "./columns.mjs";
import { listsActual, listEdges } from "./list-groups.mjs";
import { typeActual, typeEdges } from "./control-types.mjs";
import { objectActual, objectEdges } from "./objects.mjs";
import {
  tablesActual,
  tableEdges,
  tableZonePair,
  tableCellLists,
} from "./tables.mjs";
import { cellPair, cellEdges } from "./cell-extensions.mjs";
import { gridEdges } from "./grid.mjs";
import { parameterActual, parameterEdges } from "./parameters.mjs";
import {
  parameterSourceActual,
  parameterSourceEdges,
} from "./parameter-sources.mjs";
import {
  formattingEdges,
  formattingCounts,
  formattingMutations,
} from "./formatting.mjs";

const module = await WebAssembly.compile(readFileSync(process.argv[2]));
assert.equal(WebAssembly.Module.imports(module).length, 0);
const { exports: w } = await WebAssembly.instantiate(module, {});
let checks = 0;
function call(mode, bytes, limit = 64 * 1024 * 1024) {
  const ptr = w.alloc(bytes.length);
  assert.ok(ptr);
  try {
    new Uint8Array(w.memory.buffer, ptr, bytes.length).set(bytes);
    checks++;
    if (!w.probe(mode, ptr, bytes.length, limit)) {
      throw Error(
        Buffer.from(w.memory.buffer, w.error_ptr(), w.error_len()).toString(),
      );
    }
    return Buffer.from(
      new Uint8Array(w.memory.buffer, w.result_ptr(), w.result_len()),
    );
  } finally {
    w.free(ptr, bytes.length);
  }
}
function header(version = 0x05000307, flags = 0) {
  const b = Buffer.alloc(256);
  b.write("HWP Document File");
  b.writeUInt32LE(version, 32);
  b.writeUInt32LE(flags, 36);
  return b;
}
function record(tag, level, payload, extended = payload.length >= 4095) {
  const b = Buffer.alloc((extended ? 8 : 4) + payload.length);
  b.writeUInt32LE(
    (tag | (level << 10) | ((extended ? 4095 : payload.length) << 20)) >>> 0,
  );
  if (extended) b.writeUInt32LE(payload.length, 4);
  payload.copy(b, extended ? 8 : 4);
  return b;
}
// Independent framing oracle: direct integer division, no Zig helpers.
function oracle(bytes) {
  const rows = [];
  let pos = 0;
  while (pos < bytes.length) {
    assert.ok(bytes.length - pos >= 4);
    const start = pos,
      word = bytes.readUInt32LE(pos);
    pos += 4;
    let size = Math.floor(word / 1048576);
    if (size === 4095) {
      size = bytes.readUInt32LE(pos);
      pos += 4;
    }
    assert.ok(size <= bytes.length - pos);
    rows.push(
      word % 1024,
      Math.floor(word / 1024) % 1024,
      start,
      pos - start + size,
      size,
    );
    pos += size;
  }
  const out = Buffer.alloc(rows.length * 4);
  rows.forEach((v, i) => out.writeUInt32LE(v, i * 4));
  return out;
}
const rounds = [];
let begin = checks;
checkDocinfoEdges(call);
resourceEdges(call);
formattingEdges(call);
shapeEdges(call);
const referenceEdgeResults = referenceEdges(call);
bodyEdges(call);
const metadataEdgeResults = metadataEdges(call);
const controlEdgeResults = controlEdges(call);
const treeEdgeResults = treeEdges(call);
const sectionEdgeResults = sectionEdges(call);
const linkEdgeResults = linkEdges(call);
const columnEdgeResults = columnEdges(call);
const listEdgeResults = listEdges(call);
const typeEdgeResults = typeEdges(call);
const objectEdgeResults = objectEdges(call);
const tableEdgeResults = tableEdges(call);
const gridEdgeResults = gridEdges(call);
const cellEdgeResults = cellEdges(call);
const parameterEdgeResults = parameterEdges(call);
const parameterSourceEdgeResults = parameterSourceEdges(call);
const parameterSourceReport = Array(13).fill(0);
const parameterReport = [0, 0, 0, 0, 0, 0, 0, 0];
const cellPairResults = [0, 0, 0, 0, 0];
let cellPairs = 0;
const cellTails = [0, 0, 0];
const tableReport = [0, 0, 0, 0];
let tableZonePairResult;
const objectCounts = [0, 0, 0, 0, 0, 0, 0];
// Round 1: fixed header, byte order, unknown flags, incompatible versions, feature gates.
for (let n = 0; n < 256; n++)
  assert.throws(() => call(0, header().subarray(0, n)), /InvalidHeaderSize/);
assert.throws(() => call(0, Buffer.alloc(257)), /InvalidHeaderSize/);
for (let i = 0; i < 32; i++) {
  const b = header();
  b[i] ^= 1;
  assert.throws(() => call(0, b), /InvalidSignature/);
}
for (let bit = 0; bit < 32; bit++) {
  const b = header(0x05000307, (2 ** bit) >>> 0);
  b.writeUInt32LE(0x80000007, 40);
  b.writeUInt32LE(4, 44);
  b[48] = 15;
  b[255] = 123;
  const out = call(0, b);
  assert.deepEqual(
    [...new Uint32Array(out.buffer, out.byteOffset, 5)],
    [0x05000307, (2 ** bit) >>> 0, 0x80000007, 4, 15],
  );
}
for (const v of [0x04000000, 0x05020000, 0x06000000])
  assert.throws(() => call(3, header(v)), /UnsupportedVersion/);
for (const [flag, error] of [
  [2, "Encryption"],
  [4, "Distribution"],
  [16, "Drm"],
  [256, "Encryption"],
  [1024, "Drm"],
])
  assert.throws(
    () =>
      call(3, Buffer.concat([header(0x05000000, flag | 1), Buffer.from([7])])),
    new RegExp("Unsupported" + error),
  );
rounds.push({ round: 1, checks: checks - begin });
begin = checks;
// Round 2: stored/fixed/dynamic streams, window-size crossings, exact quotas, wrappers, tails.
let compressionCases = 0;
for (const n of [0, 1, 2, 3, 63, 64, 4095, 4096, 32767, 32768, 32769, 131072]) {
  const plain = Buffer.alloc(n);
  for (let i = 0; i < n; i++) plain[i] = (i * 17 + (i >> 7)) & 255;
  for (const options of [
    { level: 0 },
    { strategy: constants.Z_FIXED },
    { level: 9 },
  ]) {
    const compressed = deflateRawSync(plain, options);
    compressionCases++;
    assert.deepEqual(call(1, compressed, n), plain);
    assert.deepEqual(call(1, compressed, n + 1), plain);
    if (n) assert.throws(() => call(1, compressed, n - 1), /LimitExceeded/);
    assert.throws(
      () => call(1, Buffer.concat([compressed, Buffer.from([0])]), n),
      /TrailingData/,
    );
    for (const cut of new Set([
      0,
      1,
      Math.floor(compressed.length / 2),
      compressed.length - 1,
    ]))
      if (cut < compressed.length)
        assert.throws(
          () => call(1, compressed.subarray(0, cut), n),
          /InvalidDeflate/,
          JSON.stringify({
            n,
            options,
            cut,
            hex: compressed.subarray(0, cut).toString("hex"),
          }),
        );
  }
}
for (const b of [
  Buffer.from([7]),
  deflateSync(Buffer.from("abc")),
  gzipSync(Buffer.from("abc")),
])
  assert.throws(() => call(1, b), /InvalidDeflate|TrailingData/);
rounds.push({ round: 2, checks: checks - begin, compressionCases });
begin = checks;
// Round 3: every tag/level value, extended size boundaries and truncation.
for (let i = 0; i < 1024; i++) {
  const b = record(i, 1023 - i, Buffer.from([i & 255]), i % 2 === 0);
  assert.deepEqual(call(2, b), oracle(b));
}
for (const n of [0, 1, 4094, 4095, 4096, 65536]) {
  const b = record(16, 0, Buffer.alloc(n, 77));
  assert.deepEqual(call(2, b, 1), oracle(b));
  assert.throws(() => call(2, b, 0), /LimitExceeded/);
  for (let cut = 1; cut < Math.min(b.length, 12); cut++)
    assert.throws(() => call(2, b.subarray(0, cut)), /UnexpectedEnd/);
  for (let tail = 1; tail <= 3; tail++)
    assert.throws(
      () => call(2, Buffer.concat([b, Buffer.alloc(tail)])),
      /UnexpectedEnd/,
    );
}
assert.throws(() => call(2, Buffer.alloc(8, 255)), /UnexpectedEnd/);
rounds.push({ round: 3, checks: checks - begin });
begin = checks;
// Round 4: actual HWP CFB -> header -> DocInfo/BodyText -> raw framing vs Node zlib.
const cfb = await createCfbReader(
  readFileSync(new URL("../../zig-out/bin/hwpjs.wasm", import.meta.url)),
);
const fixtures = new URL(
  "../../legacy/rust/crates/hwp-core/tests/fixtures/",
  import.meta.url,
);
let files = 0,
  streams = 0,
  records = 0,
  totalBytes = 0;
const versions = new Set(),
  unsupported = [];
const resources = {
  binData: 0,
  faceNames: 0,
  decoded: 0,
  mismatches: [],
  missing: [],
};
const references = [0, 0, 0, 0];
const body = {
  headers: 0,
  texts: 0,
  units: 0,
  textRuns: 0,
  characterControls: 0,
  inlineControls: 0,
  extendedControls: 0,
  headersWithoutText: 0,
  controlHeaders: 0,
  listHeaders: 0,
};
const formatting = {
  tabDef: 0,
  numbering: 0,
  bullet: 0,
  style: 0,
  borderFill: 0,
  charShape: 0,
  paraShape: 0,
};
const metadata = { paragraphs: 0, runs: 0, lines: 0, ranges: 0 };
const paragraphReport = [0, 0, 0, 0, 0, 0];
const sectionReport = [0, 0, 0, 0, 0, 0];
let notePairResult;
let linkedControls = 0;
let pairedColumns = 0;
const listReport = [0, 0, 0];
const typeReport = [0, 0, 0];
const documentReport = [0, 0, 0, 0];
const containerReport = Array(23).fill(0);
const previewEdgeResults = previewEdges(call);
const summaryEdgeResults = summaryEdges(call);
const codepageEdgeResults = codepageEdges(call);
const scriptEdgeResults = scriptEdges(call);
const xmlTemplateEdgeResults = xmlTemplateEdges(call);
const historyEdgeResults = historyEdges(call);
const historyDateResults = {edges:historyDateEdges(call),actual:historyDateActual(call,cfb)};
const historyContainerResults = historyContainerActual(call,cfb);
const xmlTemplateContainerResults = xmlTemplateContainerEdges(call,cfb);
const historyLastDocumentResults = historyLastDocumentEdges(call,cfb);
const xmlInputResults = xmlInputEdges(call,cfb);
const xmlPrologResults = xmlPrologEdges(call,cfb);
const xmlReferenceResults = xmlReferenceEdges(call);
const xmlTagResults = xmlTagEdges(call,cfb);
const xmlDocumentResults = xmlDocumentEdges(call,cfb);
const xmlNamespaceResults = xmlNamespaceEdges(call,cfb);
const xmlContainerResults = xmlContainerEdges(call,cfb);
const pngStructureResults = pngStructureEdges(call,cfb);
const zlibResults = zlibEdges(call,cfb);
const pngFilterResults = pngFilterEdges(call);
const pngPixelsResults = pngPixelsEdges(call,cfb);
const pngTransparencyResults = pngTransparencyEdges(call,cfb);
const pngPaletteMetadataResults = pngPaletteMetadataEdges(call,cfb);
const pngSampleMetadataResults = pngSampleMetadataEdges(call,cfb);
const pngTimestampResults = pngTimestampEdges(call,cfb);
const pngTextResults = pngTextEdges(call,cfb);
const pngCompressedTextResults = pngCompressedTextEdges(call,cfb);
const bcp47Results = bcp47Edges(call);
const registryResults = registryEdges(call);
const pngInternationalResults = pngInternationalEdges(call,cfb);
const pngSuggestedResults = pngSuggestedEdges(call,cfb);
const pngColorFixedResults = pngColorFixedEdges(call,cfb);
const pngSrgbResults = pngSrgbEdges(call,cfb);
const pngProfileResults = pngProfileEdges(call);
const pngRequiredResults = pngRequiredEdges(call);
const pngPayloadResults = pngPayloadEdges(call);
const pngV2TextResults = pngV2TextEdges(call);
const pngV2UnicodeResults = pngV2UnicodeEdges(call);
const iccResults = iccEdges(call);
const iccSemanticResults = iccSemanticEdges(call);
const iccRegistryResults = iccRegistryEdges(call);
const iccXyzResults = iccXyzEdges(call);
const iccXyzTagResults = iccXyzTagEdges(call);
const iccCurveResults = iccCurveEdges(call);
const iccParametricResults = iccParametricEdges(call);
const iccTrcResults = iccTrcEdges(call);
const iccInverseResults = iccInverseEdges(call);
const iccForwardResults = iccForwardEdges(call);
const iccAnalyticResults = iccAnalyticEdges(call);
const iccTrcForwardResults = iccTrcForwardEdges(call);
const iccRequiredResults = iccRequiredEdges(call);
const iccMlucResults = iccMlucEdges(call);
const iccUnicodeResults = iccUnicodeEdges(call);
const iccSelectionResults = iccSelectionEdges(call);
const iccSelectionIanaResults = iccSelectionIanaEdges(call);
const adaptationResults = adaptationEdges(call);
const matrixResults = matrixEdges(call);
const fractionMatrixInverseResults = fractionMatrixInverseEdges(call);
const wideLinearTargetResults = wideLinearTargetEdges(call);
const modelResults = modelEdges(call);
const modelForwardResults = modelForwardEdges(call);
const normalizedInverseResults = normalizedInverseEdges(call);
const sampledWideInverseResults = sampledWideInverseEdges(call);
const gammaInverseResults = gammaInverseEdges(call);
const parametricDomainResults = parametricDomainEdges(call);
const parametricTopologyResults = parametricTopologyEdges(call);
const segmentResults = segmentEdges(call);
const partitionResults = partitionEdges(call);
const powerLevelResults = powerLevelEdges(call);
const rootCompareResults = rootCompareEdges(call);
const rootLocationResults = rootLocationsEdges(call);
const powerOrderResults = powerOrderEdges(call);
const rationalPowerResults = rationalPowerEdges(call);
const parametricJumpResults = parametricJumpEdges(call);
const parametricTrendResults = parametricTrendEdges(call);
const linearPreimageResults = linearPreimageEdges(call);
const normalizedPowerLevelResults = normalizedPowerLevelEdges(call);
const gammaWideInverseResults = gammaWideInverseEdges(call);
const widePowerLevelResults = widePowerLevelEdges(call);
const extendedRootCompareResults = extendedRootCompareEdges(call);
const extendedLocationsResults = extendedLocationsEdges(call);
const extendedPowerPreimageResults = powerPreimageEdges(call, 512);
const extendedLinearPreimageResults = extendedLinearPreimageEdges(call);
const extendedFractionFloatResults = extendedFractionFloatEdges(call);
const extendedParametricPreimageResults = parametricPreimageEdges(call, 512);
const normalizedRootCompareResults = normalizedRootCompareEdges(call);
const normalizedLocationsResults = normalizedLocationsEdges(call);
const powerPreimageResults = powerPreimageEdges(call);
const parametricPreimageResults = parametricPreimageEdges(call);
const preimageBoundsResults = preimageBoundsEdges(call);
const extendedPreimageBoundsResults = preimageBoundsEdges(call,512);
const extendedRootOrderResults = extendedRootOrderEdges(call);
const attainedInverseResults = attainedInverseEdges(call);
const extendedAttainedInverseResults = attainedInverseEdges(call,512);
const nearestRangeResults = nearestRangeEdges(call);
const linearRangeResults = linearRangeEdges(call);
const powerRangeResults = powerRangeEdges(call);
const parametricRangeResults = parametricRangeEdges(call);
const ordinateOrderResults = ordinateOrderEdges(call);
const extendedOrdinateOrderResults = ordinateOrderEdges(call,512);
const powerNearestResults = powerNearestEdges(call);
const ordinateDistanceResults = ordinateDistanceEdges(call);
const extendedOrdinateDistanceResults = ordinateDistanceEdges(call,512);
const parametricNearestResults = parametricNearestEdges(call);
const extendedParametricNearestResults = parametricNearestEdges(call,512);
const parametricInverseResults = parametricInverseEdges(call);
const extendedParametricInverseResults = parametricInverseEdges(call,512);
const trcInverseResults = trcInverseEdges(call);
const trcWideInverseResults = trcInverseEdges(call, 512);
const modelInverseResults = modelInverseEdges(call);
const fractionModelInverseResults = fractionModelInverseEdges(call);
const powerClipResults = powerClipEdges(call);
const modelParametricResults = modelParametricEdges(call);
const iso639Results = iso639Edges(call);
const languageHistoryResults = languageHistoryEdges(call);
const compatibilityEdgeResults = compatibilityEdges(call);
const headerFooterEdgeResults = headerFooterEdges(call);
const numberControlEdgeResults = numberControlEdges(call);
const pageNumberEdgeResults = pageNumberEdges(call);
const indexMarkEdgeResults = indexMarkEdges(call);
const visibilityEdgeResults = visibilityEdges(call);
const bookmarkEdgeResults = bookmarkEdges(call);
const overlapEdgeResults = overlapEdges(call);
const memoEdgeResults = memoEdges(call);
const fieldEdgeResults = fieldEdges(call);
const rubyEdgeResults = rubyEdges(call);
const hiddenEdgeResults = hiddenEdges(call);
const noteControlEdgeResults = noteControlEdges(call);
const noteValidationEdgeResults = noteValidationEdges(call);
const equationEdgeResults = equationEdges(call);
const equationValidationEdgeResults = equationValidationEdges(call);
const oleEdgeResults = oleEdges(call);
const oleValidationEdgeResults = oleValidationEdges(call);
const storageEdgeResults = storageEdges(call);
const shapeComponentEdgeResults = shapeComponentEdges(call);
const shapeValidationEdgeResults = shapeValidationEdges(call);
const shapeBorderEdgeResults = shapeBorderEdges(call);
const drawingStyleEdgeResults = drawingStyleEdges(call);
const lineEdgeResults = lineEdges(call);
const lineOwnerEdgeResults = lineOwnerEdges(call);
const rectangleEdgeResults = rectangleEdges(call);
const rectangleOwnerEdgeResults = rectangleOwnerEdges(call);
const ellipseEdgeResults = ellipseEdges(call);
const arcEdgeResults = arcEdges(call);
const polygonEdgeResults = polygonEdges(call);
const curveEdgeResults = curveEdges(call);
const connectorEdgeResults = connectorEdges(call);
const groupInfoEdgeResults = groupInfoEdges(call);
const videoEdgeResults = videoEdges(call);
const memoShapeEdgeResults = memoShapeEdges(call);
const memoShapePairResults = memoShapePair(call,cfb);
const memoResourceResults = {edges:memoResourceEdges(call),document:memoResourceDocument(call,cfb)};
const memoListResults = {edges:memoListEdges(call),reference:memoListReference(call,cfb),document:memoListDocument(call,cfb)};
const memoListGroupResults = memoListGroupEdges(call);
const memoOwnerResults = memoOwnerEdges(call);
const memoFieldResults = {edges:memoFieldEdges(call),reference:memoFieldReference(call,cfb),document:memoFieldDocument(call,cfb)};
const memoReferenceResults = {actual:memoReferencesActual(call,cfb),document:memoReferenceDocument(call,cfb)};
const memoRangeResults = {actual:memoRangesActual(call,cfb),mutations:memoRangeMutations(call,cfb)};
const forbiddenCharResults = {edges:forbiddenCharEdges(call),actual:forbiddenCharActual(call,cfb)};
const forbiddenDocumentResults = forbiddenDocument(call,cfb);
const trackAuthorResults = {edges:trackAuthorEdges(call),document:trackAuthorDocument(call,cfb)};
const trackChangeResults = {edges:trackChangeEdges(call),document:trackChangeDocument(call,cfb)};
const viewTextResults = viewTextDocument(call,cfb);
const viewSemanticResults = viewSemanticActual(call,cfb);
assert.deepEqual(viewSemanticResults.map(({strict,controlBytes,viewBytes,viewRecords})=>({strict,controlBytes,viewBytes,viewRecords})), [
  {strict:'InvalidLinePosition',controlBytes:956,viewBytes:105182,viewRecords:2814},
  {strict:956,controlBytes:956,viewBytes:8015903,viewRecords:265451},
]);
const distributionResults = {edges:distributionEdges(call),actual:distributionActual(call,cfb)};
const distributionPolicyResults = distributionPolicyEvidence(call,cfb);
const distributionContainerResults = distributionContainerActual(call,cfb);
const distributionContainerEdgeResults = distributionContainerEdges(call,cfb);
assert.deepEqual(distributionContainerEdgeResults,{targets:3,accepted:5,rejected:30});
assert.deepEqual(distributionContainerResults.map(({flags,primarySource,sections,reportBytes,decodedBytes,uninspectedStreams})=>({flags,primarySource,sections,reportBytes,decodedBytes,uninspectedStreams})), [
  {flags:5,primarySource:1,sections:1,reportBytes:1064,decodedBytes:570694,uninspectedStreams:3},
  {flags:1,primarySource:0,sections:1,reportBytes:1064,decodedBytes:586234,uninspectedStreams:2},
  {flags:131077,primarySource:1,sections:6,reportBytes:5064,decodedBytes:1106070,uninspectedStreams:3},
  {flags:5,primarySource:1,sections:1,reportBytes:1064,decodedBytes:105188,uninspectedStreams:3},
]);
const revisionDeleteResults = revisionDeleteEdges(call);
const revisionSignResults = {edges:revisionSignEdges(call),actual:revisionSignActual(call,cfb)};
const revisionProjectionResults = {edges:revisionProjectionEdges(call),actual:revisionProjectionActual(call,cfb)};
const revisionGroupResults = {edges:revisionGroupEdges(call),actual:revisionGroupActual(call,cfb)};
const revisionTextResults = {edges:revisionTextEdges(call),actual:revisionTextActual(call,cfb)};
const revisionCoordinateResults = {edges:revisionCoordinateEdges(call),actual:revisionCoordinateActual(call,cfb)};
const formObjectResults = {edges:formObjectEdges(call),actual:formObjectActual(call,cfb)};
const formPropertyResults = {edges:formPropertyEdges(call),actual:formPropertyActual(call,cfb)};
const formControlResults = {edges:formControlEdges(call),actual:formControlActual(call,cfb)};
const formLinkResults = {edges:formLinkEdges(call),actual:formLinkActual(call,cfb)};
const formSchemaResults = {edges:formSchemaEdges(call),actual:formSchemaActual(call,cfb)};
const formDocumentResults = formDocumentActual(call,cfb);
const formSemanticsResults = formSemanticsEdges(call);
const formMaxLengthResults = {edges:formMaxLengthEdges(call),actual:formMaxLengthActual(call,cfb)};
const memoEndResults = {edges:memoEndEdges(call),actual:memoEndActual(call,cfb)};
const paragraphFlowResults = {edges:paragraphFlowEdges(call),actual:paragraphFlowActual(call,cfb)};
const groupInfoPairResults = groupInfoPair(call,cfb);
const groupOwnerEdgeResults = groupOwnerEdges(call);
const groupDocumentResults = groupDocumentReference(call,cfb);
const connectorPairResults = connectorPair(call,cfb);
const connectorOwnerEdgeResults = connectorOwnerEdges(call);
const connectorDocumentResults = connectorDocumentReference(call,cfb);
const pictureEdgeResults = pictureEdges(call);
const pictureColorEdgeResults = colorEdges(call);
const pictureEffectsEdgeResults = effectsEdges(call);
const pictureAdditionalEdgeResults = additionalEdges(call);
const pictureOwnerEdgeResults = pictureOwnerEdges(call);
const pictureDocumentReferenceResults = pictureDocumentReference(call,cfb);
const pictureSelectedDocumentResults = pictureSelectedDocument(call,cfb);
const pictureReferenceEdgeResults = pictureReferenceEdges(call);
const pictureReferenceDocumentResults = pictureReferenceDocuments(call,cfb);
const picturePairResults = picturePair(call,cfb);
const curveOwnerEdgeResults = curveOwnerEdges(call);
const curveDocumentReferenceResults = curveDocumentReference(call,cfb);
const curveLayoutDocumentResults = curveLayoutDocument(call,cfb);
const curvePairResults = curvePair(call,cfb);
const polygonOwnerEdgeResults = polygonOwnerEdges(call);
const polygonDocumentReferenceResults = polygonDocumentReference(call,cfb);
const polygonLayoutDocumentResults = polygonLayoutDocument(call,cfb);
const polygonPairResults = polygonPair(call,cfb);
const arcOwnerEdgeResults = arcOwnerEdges(call);
const arcDocumentEdgeResults = arcDocumentEdges(call,cfb);
const arcSurveyResults = arcSurvey(call,cfb);
const ellipseOwnerEdgeResults = ellipseOwnerEdges(call);
let rubyDocumentResults = null;
const fieldDocumentResults = {
  total: Array(6).fill(0),
  rejected: 0,
  diagnostics: 0,
  containerRejected: 0,
};
let pageNumberDocumentChecks = 0;
let numberDocumentChecks = 0;
reportWireEdges();
let reportOrderingChecks = 0;
const headerFooterReport = [0, 0, 0, 0, 0];
const headerFooterDocumentReport = { controls: 0, rejected: 0 };
const historyActualResults = historyActual(call, cfb);
const indexMarkReferenceResults = indexMarkReference(call, cfb);
const bookmarkReferenceResults = bookmarkReference(call, cfb);
const hiddenReferenceResults = hiddenReference(call, cfb);
const noteControlReferenceResults = noteControlReference(call, cfb);
const equationReferenceResults = equationReference(call, cfb);
const oleReferenceResults = oleReference(call, cfb);
const oleReferenceEvidenceResults = await oleReferenceEvidence(call, cfb);
const oleReferencePolicyResults = oleReferencePolicyActual(call,cfb);
const oleContainerResults = await oleContainers(call);
const oleBinaryResults = await oleBinaries(call,cfb);
assert.deepEqual(oleReferencePolicyResults.map(r=>[r.originalId,r.binItems,r.accepted,r.rejected]),[[1,1,21,12],[1,1,21,12],[0,18,27,12]]);
const shapeComponentReferenceResults = shapeComponentReference(call, cfb);
const shapeBorderReferenceResults = shapeBorderReference(call, cfb);
const drawingStyleSurveyResults = drawingStyleSurvey(call, cfb);
const videoValidationResults = videoValidationActual(call, cfb);
assert.deepEqual(videoValidationResults,{accepted:10,rejected:52,actualVideoFiles:0,syntheticPayloadVariants:2});
const styleDocumentReferenceResults = styleDocumentReference(call, cfb);
const lineDocumentReferenceResults = lineDocumentReference(call, cfb);
const rectanglePairResults = rectanglePair(call,cfb);
const rectangleDocumentReferenceResults = rectangleDocumentReference(call,cfb);
const ellipsePairResults = ellipsePair(call,cfb);
const ellipseDocumentReferenceResults = ellipseDocumentReference(call,cfb);
const parameterZeroReferenceResults = parameterZeroReference(call,cfb);
const presentationReferenceEdgeResults = presentationReferenceEdges(call);
const overlapReferenceResults = overlapReference(call, cfb);
const visibilityReferenceResults = visibilityReference(call, cfb);
const optionalStreamObservations = Array(6).fill(0);
const containerEdgeResults = containerEdges(call, cfb);
const containerImagesResults = containerImagesEdges(call, cfb);
const containerJpegResults = containerJpegEdges(call, cfb);
const containerBmpResults = containerBmpEdges(call, cfb);
const bmpResults = bmpEdges(call);
const gifResults = gifEdges(call);
const previewImageResults = {edges:previewImageEdges(call,cfb),files:0,inspected:0};
const gifPreviewResults = {files:0,frames:0,pixels:0};
const bmpRleResults = bmpRleEdges(call);
const bmpRleRgbaResults = bmpRleRgbaEdges(call);
const bmpProfileResults = bmpProfileEdges(call);
const containerBmpProfileResults = containerBmpProfileEdges(call,cfb);
const containerBmpRleResults = containerBmpRleEdges(call,cfb);
const jpegFramingResults = jpegFramingEdges(call);
const jpegHeaderResults = jpegHeaderEdges(call);
const jpegTablesResults = jpegTablesEdges(call);
const jpegStoreResults = jpegStoreEdges(call);
const jpegProgressiveResults = jpegProgressiveEdges(call);
const jpegStructureResults = jpegStructureEdges(call);
const jpegCodecResults = jpegCodecEdges(call);
const jpegSequentialResults = jpegSequentialEdges(call);
const jpegScanResults = jpegScanEdges(call);
const jpegFrameResults = jpegFrameEdges(call);
const jpegDequantResults = jpegDequantEdges(call);
const jpegIdctResults = jpegIdctEdges(call);
const jpegFrameSamplesResults = jpegFrameSamplesEdges(call);
const jpegPlanesResults = jpegPlanesEdges(call);
const jpegJfifResults = jpegJfifEdges(call);
const jpegJfxxResults = jpegJfxxEdges(call);
const jpegJfxxJpegResults = jpegJfxxJpegEdges(call);
const jpegJfifLayoutResults = jpegJfifLayoutEdges(call);
const jpegJfifColourResults = jpegJfifColourEdges(call);
const jpegUpsamplingResults = jpegUpsamplingEdges(call);
const jpegIccResults = jpegIccEdges(call);
const jpegAdobeResults = jpegAdobeEdges(call);
const jpegRgbResults = jpegRgbEdges(call);
const jpegProgressiveBlockResults = progressiveBlockEdges(call);
const jpegProgressiveScanResults = progressiveScanEdges(call);
const jpegProgressiveFrameResults = progressiveFrameEdges(call);
const jpegProgressiveSamplesResults = progressiveSamplesEdges(call);
const jpegProgressiveRgbResults = progressiveRgbEdges(call);
const jpegFrameDequantResults = jpegFrameDequantEdges(call);
const containerImageFiles = {files: 0, png: 0, unhandled: 0};
const documentEdgeResults = { files: 0, rejected: 0, recoveries: 0 };
try {
  for (const name of readdirSync(fixtures).filter((n) => n.endsWith(".hwp"))) {
    const fileBytes = readFileSync(new URL(name, fixtures));
    cfb.parse(fileBytes, { strict: true });
    const hdr = Buffer.from(cfb.findExact("/FileHeader").content);
    assert.deepEqual(call(0, hdr).subarray(0, 16), hdr.subarray(32, 48));
    versions.add(hdr.readUInt32LE(32).toString(16));
    files++;
    const previewImage=cfb.findExact('/PrvImage');
    if(previewImage?.type===2){
      const raw=Buffer.from(previewImage.content??[]);
      if(['gif87a','gif89a'].includes(imageSignature(raw))){
        const decoded=gifActual(call,raw);gifPreviewResults.files++;gifPreviewResults.frames+=decoded.frames.length;
        gifPreviewResults.pixels+=decoded.frames.reduce((n,f)=>n+f.indices.length,0);
      }
    }
    if (hdr.readUInt32LE(36) & (2 | 4 | 16 | 256 | 1024)) {
      assert.throws(
        () => call(3, hdr),
        /UnsupportedEncryption|UnsupportedDistribution|UnsupportedDrm/,
      );
      unsupported.push(name);
      continue;
    }
    const previewReport=previewImageActual(call,cfb,fileBytes,previewImage?Buffer.from(previewImage.content??[]):null);
    previewImageResults.files++;
    previewImageResults.inspected+=Number(previewReport.readUInt32LE(previewReport.length-276)===2);
    const docBytes = Buffer.from(cfb.findExact("/DocInfo").content);
    const docPlain =
      hdr.readUInt32LE(36) & 1 ? inflateRawSync(docBytes) : docBytes;
    const shapeCount = formattingCounts(docPlain).charShape;
    const decodedSections = [];
    for (const entry of cfb.document().nodes) {
      if (
        entry.kind !== 2 ||
        !(entry.name === "DocInfo" || /^Section\d+$/.test(entry.name))
      )
        continue;
      const b = Buffer.from(entry.content);
      const plain = hdr.readUInt32LE(36) & 1 ? inflateRawSync(b) : b;
      assert.deepEqual(
        call(3, Buffer.concat([hdr, b]), plain.length),
        plain,
        `${name}/${entry.name}`,
      );
      const framed = call(2, plain);
      parameterSourceActual(
        call,
        hdr.readUInt32LE(32),
        docPlain,
        entry.name === "DocInfo" ? null : plain,
      ).forEach((n, i) => {
        parameterSourceReport[i] += n;
      });
      parameterActual(call, plain, entry.name === "DocInfo" ? 27 : 87).forEach(
        (n, i) => {
          parameterReport[i] += n;
        },
      );
      if (/^Section\d+$/.test(entry.name)) {
        decodedSections.push({
          index: Number(entry.name.slice(7)),
          bytes: plain,
        });
        const rawCells = tableCellLists(plain);
        for (const raw of rawCells) {
          const tail = raw.length - 34;
          assert.ok(tail === 4 || tail === 13);
          cellTails[tail === 4 ? 0 : 1]++;
          if (tail >= 5 && raw[38] === 255) cellTails[2]++;
        }
        const pairedPath = new URL(name.replace(/\.hwp$/, ".hwpx"), fixtures);
        if (
          entry.name === "Section0" &&
          rawCells.length &&
          existsSync(pairedPath)
        ) {
          cellPair(call, rawCells, readFileSync(pairedPath)).forEach((n, i) => {
            cellPairResults[i] += n;
          });
          cellPairs++;
        }
        if (name === "borderfill.hwp" && entry.name === "Section0")
          tableZonePairResult = tableZonePair(
            call,
            hdr.readUInt32LE(32),
            plain,
            readFileSync(new URL("borderfill.hwpx", fixtures)),
          );
        headerFooterActual(call, hdr.readUInt32LE(32), plain).forEach(
          (n, i) => (headerFooterReport[i] += n),
        );
        objectActual(plain).forEach((n, i) => {
          objectCounts[i] += n;
        });
        typeActual(call, hdr.readUInt32LE(32), plain).forEach(
          (n, i) => (typeReport[i] += n),
        );
        listsActual(call, hdr.readUInt32LE(32), plain).forEach(
          (n, i) => (listReport[i] += n),
        );
        if (name === "multicolumns-widths.hwp" && entry.name === "Section0")
          pairedColumns += columnPair(
            call,
            plain,
            readFileSync(new URL("multicolumns-widths.hwpx", fixtures)),
          );
        linkedControls += linksActual(call, hdr.readUInt32LE(32), plain);
        if (name === "footnote-endnote.hwp" && entry.name === "Section0")
          notePairResult = notePair(
            call,
            plain,
            readFileSync(new URL("footnote-endnote.hwpx", fixtures)),
          );
        const counts = formattingCounts(docPlain);
        tablesActual(
          call,
          hdr.readUInt32LE(32),
          counts.borderFill,
          plain,
        ).forEach((n, i) => {
          tableReport[i] += n;
        });
        sectionActual(
          call,
          hdr.readUInt32LE(32),
          [counts.numbering, counts.borderFill],
          plain,
        ).forEach((n, i) => (sectionReport[i] += n));
        treeActual(
          call,
          hdr.readUInt32LE(32),
          [counts.charShape, counts.paraShape, counts.style],
          plain,
        ).forEach((n, i) => (paragraphReport[i] += n));
        for (const [key, n] of Object.entries(
          metadataActual(call, hdr.readUInt32LE(32), plain, shapeCount),
        ))
          metadata[key] += n;
        for (const [key, n] of Object.entries(
          checkBody(call, hdr.readUInt32LE(32), plain, true),
        ))
          body[key] += n;
      }
      if (entry.name === "DocInfo") {
        checkDocinfo(call, hdr.readUInt32LE(32), plain);
        referenceActual(call, hdr.readUInt32LE(32), plain).forEach(
          (n, i) => (references[i] += n),
        );
        for (const [key, count] of Object.entries(formattingCounts(plain)))
          formatting[key] += count;
        const result = resourceActual(call, hdr, plain, cfb);
        for (const key of ["binData", "faceNames", "decoded"])
          resources[key] += result[key];
        if (result.mismatch) resources.mismatches.push(name);
        for (const path of result.missing)
          resources.missing.push({ file: name, path });
      }
      assert.deepEqual(framed, oracle(plain), `${name}/${entry.name}`);
      streams++;
      records += framed.length / 20;
      totalBytes += plain.length;
    }
    const hfDoc = headerFooterDocumentEdges(
      call,
      cfb,
      hdr,
      docPlain,
      decodedSections,
    );
    if (rubyDocumentResults === null)
      rubyDocumentResults = rubyDocumentEdges(
        call,
        cfb,
        hdr,
        docPlain,
        decodedSections,
      );
    const fieldDoc = fieldDocumentEdges(
      call,
      hdr,
      docPlain,
      decodedSections,
      cfb,
    );
    fieldDoc.total.forEach((n, i) => (fieldDocumentResults.total[i] += n));
    fieldDocumentResults.rejected += fieldDoc.rejected;
    fieldDocumentResults.diagnostics += fieldDoc.diagnostics;
    fieldDocumentResults.containerRejected += fieldDoc.containerRejected;
    numberDocumentChecks += numberDocumentEdges(
      call,
      hdr,
      docPlain,
      decodedSections,
    );
    reportOrderingChecks += reportOrderingEdges(
      call,
      hdr,
      docPlain,
      decodedSections,
    );
    headerFooterDocumentReport.controls += hfDoc.controls;
    pageNumberDocumentChecks += pageNumberDocumentEdges(
      call,
      hdr,
      docPlain,
      decodedSections,
    );
    headerFooterDocumentReport.rejected += hfDoc.rejected;
    optionalSurvey(cfb).forEach((n, i) => (optionalStreamObservations[i] += n));
    containerActual(
      call,
      fileBytes,
      cfb,
      hdr,
      docPlain,
      decodedSections,
    ).forEach((n, i) => (containerReport[i] += n));
    const imageResult = containerImagesActual(call, fileBytes);
    containerImageFiles.files++;
    containerImageFiles.png += imageResult.png;
    containerImageFiles.unhandled += imageResult.unhandled;
    documentActual(call, hdr, docPlain, decodedSections).forEach(
      (n, i) => (documentReport[i] += n),
    );
    const documentEdgesResult = documentEdges(
      call,
      hdr,
      docPlain,
      decodedSections,
    );
    documentEdgeResults.files++;
    documentEdgeResults.rejected += documentEdgesResult.rejected;
    documentEdgeResults.recoveries += documentEdgesResult.recoveries;
  }
} finally {
  cfb.close();
}
assert.equal(files, 48);
assert.equal(gifPreviewResults.files,14);
assert.equal(gifPreviewResults.frames,14);
assert.deepEqual(headerFooterReport, [3, 3, 3, 0, 60]);
assert.deepEqual(headerFooterDocumentReport, { controls: 3, rejected: 18 });
assert.equal(numberDocumentChecks, 32);
assert.equal(pageNumberDocumentChecks, 4);
assert.equal(reportOrderingChecks, 9);
assert.deepEqual(optionalStreamObservations, [45, 23580, 45, 45, 1, 0]);
assert.deepEqual(documentReport, [45, 47, 482195, 10425]);
assert.deepEqual(
  containerReport,
  [
    45, 13, 1028155, 90, 45, 11448, 11448, 0, 0, 0, 45, 630, 360, 135, 90, 45,
    0, 0, 0, 45, 45, 11476, 0,
  ],
);
assert.deepEqual(paragraphReport, [1481, 1076, 405, 313, 643, 134]);
assert.deepEqual(sectionReport, [47, 47, 141, 1, 94, 68]);
assert.ok(notePairResult);
assert.equal(linkedControls, 313);
assert.equal(pairedColumns, 3);
assert.deepEqual(listReport, [643, 792, 57]);
assert.deepEqual(typeReport, [313, 0, 0]);
assert.deepEqual(metadata, {
  paragraphs: 1481,
  runs: 1740,
  lines: 1729,
  ranges: 0,
});
assert.deepEqual(body, {
  headers: 1481,
  texts: 1076,
  units: 23570,
  textRuns: 1040,
  characterControls: 1076,
  inlineControls: 50,
  extendedControls: 313,
  headersWithoutText: 405,
  controlHeaders: 313,
  listHeaders: 643,
});
// The fixture memo shape is now typed; its unresolved body meaning is separate.
assert.deepEqual(references, [7881, 0, 316, 69]);
assert.deepEqual(formatting, {
  tabDef: 138,
  numbering: 50,
  bullet: 25,
  style: 700,
  borderFill: 247,
  charShape: 525,
  paraShape: 792,
});
assert.ok(streams >= 90);
assert.equal(unsupported.length, 3);
assert.equal(previewImageResults.files,45);
assert.equal(previewImageResults.inspected,45);
assert.deepEqual(resources, {
  binData: 13,
  faceNames: 861,
  decoded: 13,
  mismatches: [],
  missing: [],
});
rounds.push({
  round: 4,
  checks: checks - begin,
  files,
  streams,
  records,
  totalBytes,
  unsupported,
  versions: [...versions].sort(),
  resources,
  references,
  body,
  metadata,
  paragraphReport,
  sectionReport,
  notePairResult,
  linkedControls,
  pairedColumns,
  listReport,
  typeReport,
  formatting,
});
begin = checks;
// Round 5: deterministic hostile mutations, bounded output and recovery after every attempt.
let seed = 0xc0ffee,
  accepted = 0,
  rejected = 0;
const next = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed;
};
const base = deflateRawSync(Buffer.alloc(4096, 65));
for (let i = 0; i < 2000; i++) {
  const b = Buffer.from(base);
  b[next() % b.length] ^= 1 << (next() % 8);
  try {
    const out = call(1, b, 65536);
    assert.deepEqual(out, inflateRawSync(b));
    accepted++;
  } catch (e) {
    if (!/^(InvalidDeflate|TrailingData|LimitExceeded)$/.test(e.message))
      throw e;
    rejected++;
  }
  assert.deepEqual(call(1, Buffer.from([3, 0]), 0), Buffer.alloc(0));
}
w.close();
rounds.push({
  round: 5,
  checks: checks - begin,
  mutations: 2000,
  accepted,
  rejected,
  recoveries: 2000,
});
const formattingMutationResults = formattingMutations(call);
const shapeMutationResults = shapeMutations(call);
const bodyMutationResults = bodyMutations(call);
assert.deepEqual(objectCounts, [60, 53, 20, 42, 82, 9, 5]);
assert.deepEqual(tableReport, [60, 578, 29, 2]);
assert.equal(cellPairs, 11);
assert.deepEqual(cellPairResults, [532, 96, 0, 0, 0]);
assert.deepEqual(cellTails, [71, 507, 0]);
assert.deepEqual(parameterReport, [2, 20, 4, 0, 16, 0, 0, 0]);
assert.deepEqual(
  parameterSourceReport,
  [2, 0, 0, 2, 0, 0, 20, 0, 0, 0, 507, 0, 0],
);
assert.deepEqual(tableZonePairResult, [0, 0, 2, 0]);
console.log(
  JSON.stringify(
    {
      rounds,
      formattingMutationResults,
      shapeMutationResults,
      referenceEdgeResults,
      bodyMutationResults,
      metadataEdgeResults,
      controlEdgeResults,
      treeEdgeResults,
      sectionEdgeResults,
      linkEdgeResults,
      columnEdgeResults,
      listEdgeResults,
      typeEdgeResults,
      objectEdgeResults,
      objectCounts,
      tableEdgeResults,
      gridEdgeResults,
      cellEdgeResults,
      cellPairResults,
      cellPairs,
      cellTails,
      parameterEdgeResults,
      parameterReport,
      parameterSourceEdgeResults,
      parameterSourceReport,
      documentReport,
      containerReport,
      previewEdgeResults,
      summaryEdgeResults,
      scriptEdgeResults,
      xmlTemplateEdgeResults,
      historyEdgeResults,
      historyDateResults,
      historyContainerResults,
      xmlTemplateContainerResults,
      historyLastDocumentResults,
      xmlInputResults,
      xmlPrologResults,
      xmlReferenceResults,
      xmlTagResults,
      xmlDocumentResults,
      xmlNamespaceResults,
      xmlContainerResults,
      pngStructureResults,
      zlibResults,
      pngFilterResults,
      pngPixelsResults,
      pngTransparencyResults,
      pngPaletteMetadataResults,
      pngSampleMetadataResults,
      pngTimestampResults,
      pngTextResults,
      pngCompressedTextResults,
      bcp47Results,
      registryResults,
      pngInternationalResults,
      pngSuggestedResults,
      pngColorFixedResults,
      pngSrgbResults,
      pngProfileResults,
      pngRequiredResults,
      pngPayloadResults,
      pngV2TextResults,
      pngV2UnicodeResults,
      containerImagesResults,
      containerJpegResults,
      containerBmpResults,
      bmpResults,
      bmpRleResults,
      bmpRleRgbaResults,
      bmpProfileResults,
      containerBmpProfileResults,
      gifResults,
      previewImageResults,
      gifPreviewResults,
      containerBmpRleResults,
      jpegFramingResults,
      jpegHeaderResults,
      jpegTablesResults,
      jpegStoreResults,
      jpegProgressiveResults,
      jpegStructureResults,
      jpegCodecResults,
      jpegSequentialResults,
      jpegScanResults,
      jpegFrameResults,
      jpegDequantResults,
      jpegIdctResults,
      jpegFrameSamplesResults,
      jpegPlanesResults,
      jpegJfifResults,
      jpegJfxxResults,
      jpegJfxxJpegResults,
      jpegJfifLayoutResults,
      jpegJfifColourResults,
      jpegUpsamplingResults,
      jpegIccResults,
      jpegAdobeResults,
      jpegRgbResults,
      jpegProgressiveBlockResults,
      jpegProgressiveScanResults,
      jpegProgressiveFrameResults,
      jpegProgressiveSamplesResults,
      jpegProgressiveRgbResults,
      jpegFrameDequantResults,
      containerImageFiles,
      iccResults,
      iccSemanticResults,
      iccRegistryResults,
      iccXyzResults,
      iccXyzTagResults,
      iccCurveResults,
      iccParametricResults,
      iccTrcResults,
      iccInverseResults,
      iccForwardResults,
      iccAnalyticResults,
      iccTrcForwardResults,
      iccRequiredResults,
      iccMlucResults,
      iccUnicodeResults,
      iccSelectionResults,
      iccSelectionIanaResults,
      adaptationResults,
      matrixResults,
      fractionMatrixInverseResults,
      wideLinearTargetResults,
      modelResults,
      modelForwardResults,
      normalizedInverseResults,
      sampledWideInverseResults,
      gammaInverseResults,
      parametricDomainResults,
      parametricTopologyResults,
      segmentResults,
      partitionResults,
      powerLevelResults,
      rootCompareResults,
      rootLocationResults,
      powerOrderResults,
      rationalPowerResults,
      parametricJumpResults,
      parametricTrendResults,
      linearPreimageResults,
      normalizedPowerLevelResults,
      gammaWideInverseResults,
      widePowerLevelResults,
      extendedRootCompareResults,
      extendedLocationsResults,
      extendedPowerPreimageResults,
      extendedLinearPreimageResults,
      extendedFractionFloatResults,
      extendedParametricPreimageResults,
      normalizedRootCompareResults,
      normalizedLocationsResults,
      powerPreimageResults,
      parametricPreimageResults,
      preimageBoundsResults,
      extendedPreimageBoundsResults,
      extendedRootOrderResults,
      attainedInverseResults,
      extendedAttainedInverseResults,
      nearestRangeResults,
      linearRangeResults,
      powerRangeResults,
      parametricRangeResults,
      ordinateOrderResults,
      extendedOrdinateOrderResults,
      powerNearestResults,
      ordinateDistanceResults,
      extendedOrdinateDistanceResults,
      parametricNearestResults,
      extendedParametricNearestResults,
      parametricInverseResults,
      extendedParametricInverseResults,
      trcInverseResults,
      trcWideInverseResults,
      modelInverseResults,
      fractionModelInverseResults,
      powerClipResults,
      modelParametricResults,
      iso639Results,
      languageHistoryResults,
      compatibilityEdgeResults,
      headerFooterEdgeResults,
      numberControlEdgeResults,
      pageNumberEdgeResults,
      indexMarkEdgeResults,
      visibilityEdgeResults,
      bookmarkEdgeResults,
      overlapEdgeResults,
      memoEdgeResults,
      fieldEdgeResults,
      rubyEdgeResults,
      hiddenEdgeResults,
      hiddenReferenceResults,
      noteControlEdgeResults,
      noteValidationEdgeResults,
      equationEdgeResults,
      equationValidationEdgeResults,
      oleEdgeResults,
      oleValidationEdgeResults,
      storageEdgeResults,
      shapeComponentEdgeResults,
      shapeValidationEdgeResults,
      shapeBorderEdgeResults,
      drawingStyleEdgeResults,
      lineEdgeResults,
      lineOwnerEdgeResults,
      rectangleEdgeResults,
      rectangleOwnerEdgeResults,
      ellipseEdgeResults,
      arcEdgeResults,
      polygonEdgeResults,
      curveEdgeResults,
      connectorEdgeResults,
      groupInfoEdgeResults,
      videoEdgeResults,
      memoShapeEdgeResults,
      memoShapePairResults,
      memoResourceResults,
      memoListResults,
      memoListGroupResults,
      memoOwnerResults,
      memoFieldResults,
      memoReferenceResults,
      memoRangeResults,
      forbiddenCharResults,
      forbiddenDocumentResults,
      trackAuthorResults,
      trackChangeResults,
      viewTextResults,
      viewSemanticResults,
      distributionResults,
      distributionPolicyResults,
      distributionContainerResults,
      distributionContainerEdgeResults,
      revisionDeleteResults,
      revisionSignResults,
      revisionProjectionResults,
      revisionGroupResults,
      revisionTextResults,
      revisionCoordinateResults,
      formObjectResults,
      formPropertyResults,
      formControlResults,
      formLinkResults,
      formSchemaResults,
      formDocumentResults,
      formSemanticsResults,
      formMaxLengthResults,
      memoEndResults,
      paragraphFlowResults,
      groupInfoPairResults,
      groupOwnerEdgeResults,
      groupDocumentResults,
      connectorPairResults,
      connectorOwnerEdgeResults,
      connectorDocumentResults,
      pictureEdgeResults,
      pictureColorEdgeResults,
      pictureEffectsEdgeResults,
      pictureAdditionalEdgeResults,
      pictureOwnerEdgeResults,
      pictureDocumentReferenceResults,
      pictureSelectedDocumentResults,
      pictureReferenceEdgeResults,
      pictureReferenceDocumentResults,
      picturePairResults,
      curveOwnerEdgeResults,
      curveDocumentReferenceResults,
      curveLayoutDocumentResults,
      curvePairResults,
      polygonOwnerEdgeResults,
      polygonDocumentReferenceResults,
      polygonLayoutDocumentResults,
      polygonPairResults,
      arcOwnerEdgeResults,
      arcDocumentEdgeResults,
      arcSurveyResults,
      ellipseOwnerEdgeResults,
      shapeBorderReferenceResults,
      drawingStyleSurveyResults,
      videoValidationResults,
      styleDocumentReferenceResults,
      lineDocumentReferenceResults,
      rectanglePairResults,
      rectangleDocumentReferenceResults,
      ellipsePairResults,
      ellipseDocumentReferenceResults,
      parameterZeroReferenceResults,
      presentationReferenceEdgeResults,
      shapeComponentReferenceResults,
      oleReferenceResults,
      oleReferenceEvidenceResults,
      oleReferencePolicyResults,
      oleContainerResults,
      oleBinaryResults,
      equationReferenceResults,
      noteControlReferenceResults,
      rubyDocumentResults,
      fieldDocumentResults,
      overlapReferenceResults,
      bookmarkReferenceResults,
      visibilityReferenceResults,
      pageNumberDocumentChecks,
      numberDocumentChecks,
      reportOrderingChecks,
      headerFooterReport,
      headerFooterDocumentReport,
      historyActualResults,
      indexMarkReferenceResults,
      optionalStreamObservations,
      codepageEdgeResults,
      containerEdgeResults,
      documentEdgeResults,
      tableReport,
      tableZonePairResult,
      checks,
      imports: 0,
    },
    null,
    2,
  ),
);

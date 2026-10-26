import { hwp5DrawingGeometry } from './hwp5-drawing-geometry.mjs';
import { validateHwp5PictureSources } from '../../js/hwp5-picture-sources.mjs';
import { validateHwp5DrawingLocalTransforms } from '../../js/hwp5-drawing-local-transforms.mjs';
import { affinePoint } from './affine-point-geometry.mjs';
import { validateHwp5PictureTailSources } from '../../js/hwp5-picture-tail-sources.mjs';
import { hwp5PictureGeometryOwner } from './hwp5-picture-geometry-owner.mjs';
import { hwp5PictureResizeGeometry } from './hwp5-picture-resize-geometry.mjs';
import { hwp5PictureBorderPlan } from './hwp5-picture-border-plan.mjs';
import { hwp5PictureShadowPlan } from './hwp5-picture-shadow-plan.mjs';
import { hwp5PictureAbsentSourceMatches } from './hwp5-picture-absent-tail-profile.mjs';

// 위치 소유권과 자식의 변환 속성을 분리하고 미선택 꼬리를 기본값으로 채우지 않습니다.
export function projectHwp5PictureGeometry(content) {
  const fail = (error) => ({ state: 'unavailable', error });
  try {
    if (
      content.hwp5PictureErrors?.length ||
      content.hwp5DrawingErrors?.length ||
      content.hwp5DrawingLocalErrors?.length
    )
      throw new Error('IncompleteHwp5PictureGeometry');
    const pictures = [],
      seen = new Set();
    for (const item of content.hwp5Pictures ?? []) {
      const raw = item.source;
      validateHwp5PictureSources([raw]);
      if (raw.component_node !== item.pictureNode || raw.picture_node !== item.recordNode)
        throw new Error('Hwp5PictureIdentityMismatch');
      const key = `${item.section}:${item.pictureNode}`;
      if (seen.has(key)) throw new Error('AmbiguousHwp5PictureGeometry');
      seen.add(key);
      const owner = hwp5PictureGeometryOwner(content, item),
        root = owner.root;
      const locals = (content.hwp5DrawingLocalTransforms ?? []).filter(
        (row) => row.section === item.section && row.component_node === item.pictureNode,
      );
      if (locals.length !== 1) throw new Error('MissingHwp5PictureTransform');
      validateHwp5DrawingLocalTransforms(locals);
      if (locals[0].owner_node !== raw.owner_node)
        throw new Error('Hwp5PictureTransformOwnerMismatch');
      const source = hwp5DrawingGeometry(root.source),
        g = source.geometry,
        m = locals[0].matrix;
      const tails = (content.hwp5PictureTails ?? []).filter(
        (row) => row.section === item.section && row.component_node === item.pictureNode,
      );
      if (tails.length > 1) throw new Error('AmbiguousHwp5PictureTail');
      const tail = tails[0] ?? null;
      const absentRows = (content.hwp5PictureAbsentTails ?? []).filter(
        (row) => row.section === item.section && row.component_node === item.pictureNode,
      );
      if (absentRows.length > 1 || (tail && absentRows.length))
        throw new Error('AmbiguousHwp5PictureTail');
      const absent = absentRows[0] ?? null;
      if (
        absent &&
        (!hwp5PictureAbsentSourceMatches(absent, raw) ||
          absent.picture_node !== item.recordNode ||
          absent.owner_node !== raw.owner_node)
      )
        throw new Error('InvalidHwp5PictureAbsentTail');
      if (tail) {
        validateHwp5PictureTailSources([tail]);
        if (tail.picture_node !== item.recordNode || tail.owner_node !== raw.owner_node)
          throw new Error('Hwp5PictureTailOwnerMismatch');
      }
      const zeroSizePolicy =
        tail?.fileVersion === 0x05010001 &&
        tail.image_width === 0 &&
        tail.image_height === 0 &&
        owner.attributes === 0x20000000;
      const canvasMatrix = [m[0], m[3], m[1], m[4], m[2], m[5]];
      const corners = raw.points.map((point) => affinePoint(canvasMatrix, point));
      if (corners.some((point) => point === null)) throw new Error('InvalidHwp5PictureTransform');
      const flip = [!!(owner.attributes & 1), !!(owner.attributes & 2)];
      const identity =
        owner.angle === 0 &&
        flip.every((value) => value === false) &&
        m.every((value, index) => value === [1, 0, 0, 0, 1, 0][index]);
      const borderPlan = hwp5PictureBorderPlan({ source: raw, tailSource: tail });
      const shadowPlan = hwp5PictureShadowPlan({
        source: raw,
        tailSource: tail,
        transform: { angle: owner.angle, flip },
        renderingCorners: corners,
      });
      pictures.push({
        section: item.section,
        pictureNode: item.pictureNode,
        recordNode: item.recordNode,
        resizeRecordNode: item.recordNode,
        resizeGeometry: owner.grouped ? hwp5PictureResizeGeometry(corners, g) : null,
        sizeProtected: source.size_protected,
        state: 'located',
        paragraph: root.hostParagraph,
        anchorUnit: root.anchorUnit,
        owner: {
          anchorNode: owner.anchorNode,
          paragraph: root.hostParagraph,
          anchorUnit: root.anchorUnit,
        },
        geometry: owner.grouped
          ? null
          : {
              width: g.width,
              height: g.height,
              widthRelative: g.width_relative,
              heightRelative: g.height_relative,
              treatAsCharacter: g.treat_as_character,
              horizontalOffset: g.horizontal_offset,
              verticalOffset: g.vertical_offset,
            },
        position: source.position,
        flow: {
          textWrap: source.text_wrap,
          textFlow: source.text_flow,
          zOrder: source.z_order,
          outsideMargins: [...source.out_margin],
        },
        crop: {
          clip: [raw.crop[0], raw.crop[2], raw.crop[1], raw.crop[3]],
          imageDimensions: [tail?.image_width ?? null, tail?.image_height ?? null],
          zeroSizeUnitsPerPixel: zeroSizePolicy ? 75 : null,
        },
        transform: {
          identity,
          angle: owner.angle,
          flip,
          reverse: null,
          reverseApplicable: false,
          unknownMatrixNodes: 0,
          unknownComponentAttributes: (owner.attributes & ~3) >>> 0,
        },
        renderingCorners: corners,
        paintError:
          raw.contrast !== 0 || raw.brightness !== 0 || raw.effect !== 0
            ? 'UnsupportedHwp5PictureAdjustment'
            : absent && (raw.border_width !== 0 || raw.border_attributes !== 0)
              ? 'UnsupportedHwp5PictureBorder'
              : (!tail && !absent) ||
                  content.hwp5PictureTailErrors?.some((row) => row.section === item.section)
                ? 'UnselectedHwp5PictureTail'
                : tail &&
                    (shadowPlan.state === 'unavailable' ||
                      !hwp5PictureTailAlphaSupported(tail) ||
                      (tail.border_opacity !== 0 && borderPlan.state !== 'none') ||
                      tail.extra_bytes !== 0)
                  ? 'UnsupportedHwp5PictureTail'
                  : borderPlan.state === 'unavailable'
                    ? borderPlan.error
                    : tail && !zeroSizePolicy && (tail.image_width === 0 || tail.image_height === 0)
                      ? 'UnsupportedHwp5ZeroImageDimensions'
                      : null,
        unselectedPictureTail: tail ? tail.extra_bytes : raw.extra_bytes,
        source: structuredClone(raw),
        tailSource: tail ? structuredClone(tail) : null,
        tailPolicy: absent ? `observed-${absent.layout.replaceAll('_', '-')}` : 'selected-tail',
      });
    }
    return { state: 'projected', pictures };
  } catch (error) {
    return fail(error.message);
  }
}
import { hwp5PictureTailAlphaSupported } from './hwp5-picture-tail-profile.mjs';

import { layoutInlineGroupBody } from './inline-group-body-layout.mjs';
import { paginatePictureDocumentFlow } from './picture-document-flow.mjs';
import { inlinePictureIndex, picturePositionKey } from './picture-inline.mjs';
import { pictureTextMeasure } from './picture-text-measurement.mjs';
import { hasPictureSourceErrors, hasFinitePictureCrop } from './picture-source-validation.mjs';
import { picturePaintPlan } from './picture-paint-plan.mjs';
import { signedInt32 } from './signed-int32.mjs';
import { textMeasurement } from './text-measurement.mjs';

/** Groups keep native dimensions; the shared picture solver owns wrapping. */
export function layoutGroupPictureBody(
  content,
  measure,
  maxRows = 20000,
  { firstPageTopInset = 0 } = {},
) {
  const floating = (content.pictures ?? []).filter(
    (p) => p.owner?.anchorNode === p.pictureNode && p.geometry?.treatAsCharacter === false,
  );
  if (!floating.length && firstPageTopInset === 0)
    return layoutInlineGroupBody(content, measure, maxRows);
  const fail = (error) => ({ state: 'unavailable', error });
  if (!Number.isFinite(firstPageTopInset) || firstPageTopInset < 0)
    return fail('InvalidGroupFirstPageInset');
  if (content.tables?.length || content.createdTables?.length)
    return fail('UnsupportedGroupPictureTables');
  if (
    floating.some(
      (p) =>
        hasPictureSourceErrors(p) ||
        !hasFinitePictureCrop(p) ||
        p.caption != null ||
        p.state !== 'located' ||
        ![0, 1].includes(p.flow?.textWrap) ||
        p.position?.relations?.[2] !== 0 ||
        p.position?.flags?.[0] !== false ||
        signedInt32(p.flow?.zOrder) === null ||
        picturePaintPlan(p).state === 'unsupported_transform',
    )
  )
    return fail('UnsupportedGroupPictureSource');
  const keys = new Set(),
    identities = new Set();
  for (const picture of floating) {
    const key = picturePositionKey(picture.section, picture.paragraph, picture.anchorUnit);
    const hosts = content.paragraphs.filter(
      (p) => p.section === picture.section && p.paragraph === picture.paragraph,
    );
    const identity = `${picture.section}:${picture.pictureNode}`;
    if (
      keys.has(key) ||
      identities.has(identity) ||
      hosts.length !== 1 ||
      hosts[0].text[picture.anchorUnit] !== '\ufffc' ||
      picture.owner.paragraph !== picture.paragraph ||
      picture.owner.anchorUnit !== picture.anchorUnit ||
      hosts[0].tableCell ||
      hosts[0].drawingText ||
      hosts[0].drawingCaption
    )
      return fail('AmbiguousGroupPictureOwner');
    keys.add(key);
    identities.add(identity);
  }
  const selected = new Set(floating),
    view = { ...content, pictures: content.pictures.filter((p) => !selected.has(p)) };
  const index = inlinePictureIndex(view);
  const pictureMeasure = pictureTextMeasure(index, floating, measure);
  return layoutInlineGroupBody(view, pictureMeasure, maxRows, {
    additionalZeroWidthUnits(p) {
      return floating
        .filter((f) => f.section === p.section && f.paragraph === p.paragraph)
        .map((f) => f.anchorUnit);
    },
    paginateSourceBody({ setting, flows, paragraphs, objects }) {
      const byUnit = new Map(
        objects.map((o) => [picturePositionKey(o.section, o.paragraph, o.unit), o]),
      );
      if (objects.some((o) => keys.has(picturePositionKey(o.section, o.paragraph, o.unit))))
        return fail('AmbiguousGroupPictureOwner');
      const currentMeasure = (text, p, unit, kind) => {
        const object =
          kind === 'text' &&
          text !== '' &&
          byUnit.get(picturePositionKey(p.section, p.paragraph, unit));
        return object
          ? {
              width: object.width,
              height: object.height,
              spacingBasisHeight: textMeasurement(measure('', p, unit, kind)).height,
            }
          : pictureMeasure(text, p, unit, kind);
      };
      const page = paginatePictureDocumentFlow(
        paragraphs,
        setting,
        floating,
        currentMeasure,
        flows,
        { maxRows, edgePolicy: 'inside-start-outside-end', firstPageTopInset },
      );
      if (page.state !== 'paginated') return page;
      return {
        ...page,
        flowPictures: page.pictureReservations.map((item) => {
          const picture = floating.find(
            (p) => p.section === item.section && p.pictureNode === item.pictureNode,
          );
          return { ...item, paragraph: picture.paragraph, anchorUnit: picture.anchorUnit };
        }),
      };
    },
  });
}

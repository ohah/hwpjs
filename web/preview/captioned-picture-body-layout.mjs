import { paginatePictureDocumentFlow } from "./picture-document-flow.mjs";
import { pictureTextMeasure } from "./picture-text-measurement.mjs";
import { picturePaintPlan } from "./picture-paint-plan.mjs";
import { signedInt32 } from "./signed-int32.mjs";
import { pageParagraphCoverage } from "./page-paragraph-coverage.mjs";
import { hasPictureSourceErrors, hasFinitePictureCrop } from "./picture-source-validation.mjs";
import { pictureFramePaperFit } from "./picture-caption-page-fit.mjs";

/** Captioned wrapped pictures share the existing paragraph/frame calculation. */
export function layoutCaptionedPictureBody(content, measure, maxRows) {
  const fail = (error) => ({ state: "unavailable", error });
  const pictures = content?.pictures ?? [];
  if (
    !Array.isArray(content?.paragraphs) ||
    Array.from(content.paragraphs).some((p) => !p || typeof p.text !== "string") ||
    !Array.isArray(pictures) ||
    Array.from(pictures).some((p) => !p)
  )
    return fail("InvalidCaptionedPictureBody");
  if (!Number.isSafeInteger(maxRows) || maxRows < 1 || typeof measure !== "function")
    return fail("InvalidPictureCaptionBudget");
  if (content.limited || content.pictureCaptionErrors?.length)
    return fail("IncompleteCaptionedPictureBody");
  if (
    !pictures.length ||
    content.pageSettings?.length !== 1 ||
    content.tables?.length ||
    content.drawings?.length ||
    content.lines?.length ||
    content.paragraphs.some((p) => p.clipped || p.tableCell || p.tableCaption || p.drawingText)
  )
    return fail("UnsupportedCaptionedPictureBodyObjects");
  if (pictures.length > 1 && pictures.some((p) => p.position?.flags?.[2] !== true))
    return fail("UnsupportedCaptionedPictureCollisionPolicy");
  const byNode = new Map();
  for (const picture of pictures) {
    const key = `${picture.section}:${picture.pictureNode}`;
    if (byNode.has(key)) return fail("AmbiguousPictureCaptionOwner");
    byNode.set(key, picture);
    if (
      picture.state !== "located" ||
      picture.owner?.anchorNode !== picture.pictureNode ||
      picture.geometry?.treatAsCharacter !== false ||
      ![0, 1].includes(picture.flow?.textWrap) ||
      picture.position?.relations?.[2] !== 0 ||
      picture.position?.flags?.[0] !== false ||
      typeof picture.position?.flags?.[1] !== "boolean" ||
      typeof picture.position?.flags?.[2] !== "boolean" ||
      signedInt32(picture.flow?.zOrder) === null ||
      picturePaintPlan(picture).state === "unsupported_transform" ||
      !hasFinitePictureCrop(picture) ||
      hasPictureSourceErrors(picture)
    )
      return fail("UnsupportedCaptionedPicturePagePolicy");
  }
  for (const paragraph of content.paragraphs)
    if (paragraph.drawingCaption) {
      const source = byNode.get(
        `${paragraph.section}:${paragraph.drawingCaption.drawingNode}`,
      )?.caption;
      if (
        !source ||
        source.caption_node !== paragraph.drawingCaption.captionNode ||
        source.list_node !== paragraph.drawingCaption.listNode
      )
        return fail("PictureCaptionBindingMismatch");
    }
  const body = content.paragraphs.filter((p) => !p.drawingCaption),
    keys = new Set(body.map((p) => `${p.section}:${p.paragraph}`));
  const flows = (content.paragraphFlows ?? []).filter((f) =>
    keys.has(`${f.section}:${f.paragraph}`),
  );
  if (
    !body.length ||
    flows.length !== body.length ||
    flows.some((f) => f.host !== "body" || f.top_level !== true || f.single_column !== true)
  )
    return fail("UnsupportedCaptionedPictureBodyFlow");
  const result = paginatePictureDocumentFlow(
    body,
    content.pageSettings[0],
    pictures,
    pictureTextMeasure(new Map(), pictures, measure),
    flows,
    {
      maxRows,
      edgePolicy: "inside-start-outside-end",
      captionMeasure: measure,
      captionParagraphs: content.paragraphs,
      maxCaptionRows: maxRows,
    },
  );
  if (result.state !== "paginated") return result;
  const rows = [...result.rows, ...(result.pictureCaptionRows ?? [])];
  if (rows.length > maxRows) return fail("PictureCaptionRowLimit");
  const coverage = pageParagraphCoverage(content.paragraphs, rows);
  if (coverage.state !== "complete") return coverage;
  for (const item of result.pictureReservations) {
    const page = result.pages.find((p) => p.ordinal === item.pageOrdinal),
      frame = item.flowRectangle ?? item.rectangle;
    if (pictureFramePaperFit(frame, page?.paper).state !== "fits")
      return fail("PictureCaptionPageOverflow");
  }
  return {
    ...result,
    rows,
    pages: result.pages.map((p) => ({ ...p, section: body[0].section })),
    flowPictures: result.pictureReservations.map((item) => {
      const picture = byNode.get(`${item.section}:${item.pictureNode}`);
      return { ...item, paragraph: picture.paragraph, anchorUnit: picture.anchorUnit };
    }),
  };
}

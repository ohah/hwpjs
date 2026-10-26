import { layoutContent } from "./layout.mjs";
import { pageReferenceBoxes } from "./page-reference-boxes.mjs";
import { paginatePictureRows } from "./picture-page-flow.mjs";
import { picturePaintPlan } from "./picture-paint-plan.mjs";
import { inlinePictureIndex } from "./picture-inline.mjs";
import { pictureTextMeasure } from "./picture-text-measurement.mjs";
import { paginateBodyRows } from "./page-row-flow.mjs";
import { projectFloatingPicturePage } from "./picture-page-projection.mjs";
import { signedInt32 } from "./signed-int32.mjs";
import { paginatePictureDocumentFlow } from "./picture-document-flow.mjs";
import { layoutCaptionedPictureBody } from "./captioned-picture-body-layout.mjs";
import { hasPictureSourceErrors, hasFinitePictureCrop } from "./picture-source-validation.mjs";

export function layoutPictureBodyContent(
  content,
  measure,
  maxRows,
  { firstPageTopInset = 0, rowY, minimumRowPage, columnBottom, paginateRows } = {},
) {
  const unavailable = (error) => ({ state: "unavailable", error });
  if (!Number.isFinite(firstPageTopInset) || firstPageTopInset < 0)
    return unavailable("InvalidPictureFirstPageInset");
  const external = [rowY, minimumRowPage, columnBottom, paginateRows].some(
    (value) => value !== undefined,
  );
  if (
    external &&
    (firstPageTopInset !== 0 ||
      content.pictures?.some((p) => p.geometry?.treatAsCharacter !== true || p.caption != null))
  )
    return unavailable("UnsupportedPicturePageReservation");
  if (
    [rowY, minimumRowPage, columnBottom, paginateRows].some(
      (value) => value !== undefined && typeof value !== "function",
    )
  )
    return unavailable("InvalidPicturePageReservation");
  if (firstPageTopInset > 0 && content.pictures?.some((p) => p.caption != null))
    return unavailable("UnsupportedCaptionedPictureFirstPageInset");
  if (content.pictures?.some((p) => p.caption != null))
    return layoutCaptionedPictureBody(content, measure, maxRows);
  if (
    content.pageSettings?.length !== 1 ||
    content.tables?.length ||
    content.drawings?.length ||
    content.lines?.length ||
    content.paragraphs.some((p) => p.tableCell || p.clipped)
  )
    return unavailable("UnsupportedPicturePageObjects");
  if (!content.paragraphFlows?.every((f) => f.top_level === true && f.single_column === true))
    return unavailable("UnsupportedPicturePageFlow");
  if (content.pictures.some(hasPictureSourceErrors))
    return unavailable("AmbiguousPicturePageSource");
  if (content.pictures.some((p) => !hasFinitePictureCrop(p)))
    return unavailable("MissingPicturePageCrop");
  const inline = content.pictures.every((p) => p.geometry?.treatAsCharacter === true);
  const inlinePictures = content.pictures.filter((p) => p.geometry?.treatAsCharacter === true);
  const floatingPictures = content.pictures.filter((p) => p.geometry?.treatAsCharacter !== true);
  const square = floatingPictures.some((p) => p.flow?.textWrap === 0);
  const reservedPictures = floatingPictures.filter((p) => [0, 1].includes(p.flow?.textWrap));
  const layeredPictures = floatingPictures.filter((p) => [2, 3].includes(p.flow?.textWrap));
  if (floatingPictures.some((p) => signedInt32(p.flow?.zOrder) === null))
    return unavailable("MissingPicturePagePaintOrder");
  if (
    new Set(content.pictures.map((p) => `${p.section}:${p.pictureNode}`)).size !==
    content.pictures.length
  )
    return unavailable("AmbiguousInlinePicturePageContent");
  if (
    content.pictures.some((p) => picturePaintPlan(p).state === "unsupported_transform") ||
    floatingPictures.some(
      (p) =>
        p.geometry?.treatAsCharacter !== false ||
        ![0, 1, 2, 3].includes(p.flow?.textWrap) ||
        ([0, 1].includes(p.flow.textWrap) && p.position?.relations?.[2] !== 0) ||
        p.position?.flags?.[0] !== false,
    )
  )
    return unavailable("UnsupportedPicturePagePolicy");
  const inlineIndex = inlinePictureIndex({ ...content, pictures: inlinePictures });
  if (inlineIndex.size !== inlinePictures.length || [...inlineIndex.values()].some((item) => !item))
    return unavailable("AmbiguousInlinePicturePageContent");
  const reference = pageReferenceBoxes(content.pageSettings[0], { x: 20, y: 20 });
  if (reference.state !== "placed") return unavailable(reference.state);
  const measured = layoutContent(
    { ...content, pictures: [] },
    reference.boxes.page.width,
    pictureTextMeasure(inlineIndex, floatingPictures, measure),
    maxRows,
    { documentBody: true },
  );
  if (measured.limited) return unavailable("PicturePageLayoutLimit");
  if (inline && firstPageTopInset === 0) {
    const options = { maxRows, rowY, minimumRowPage, columnBottom };
    const page = paginateRows
      ? paginateRows(
          measured.rows,
          content.pageSettings[0],
          content.paragraphFlows,
          options,
          paginateBodyRows,
        )
      : paginateBodyRows(measured.rows, content.pageSettings[0], content.paragraphFlows, options);
    return page.state === "paginated" ? { ...page, pageLayoutMode: "measured-body" } : page;
  }
  const page =
    square || firstPageTopInset > 0
      ? paginatePictureDocumentFlow(
          content.paragraphs,
          content.pageSettings[0],
          reservedPictures,
          pictureTextMeasure(inlineIndex, floatingPictures, measure),
          content.paragraphFlows,
          { maxRows, edgePolicy: "inside-start-outside-end", firstPageTopInset },
        )
      : reservedPictures.length
        ? paginatePictureRows(
            measured.rows,
            content.pageSettings[0],
            content.paragraphFlows,
            reservedPictures,
            content.paragraphs,
            { maxRows },
          )
        : paginateBodyRows(measured.rows, content.pageSettings[0], content.paragraphFlows, {
            maxRows,
          });
  if (page.state !== "paginated") return page;
  const placements = [...(page.pictureReservations ?? [])];
  for (const picture of layeredPictures) {
    const result = projectFloatingPicturePage(picture, content.paragraphs, page.rows);
    if (result.state !== "placed") return result;
    placements.push({
      section: picture.section,
      pictureNode: picture.pictureNode,
      pageOrdinal: result.pageOrdinal,
      rectangle: result.rectangle,
      flow: picture.flow,
    });
  }
  return {
    ...page,
    spatialRows: true,
    pageLayoutMode: "measured-body",
    flowPictures: placements.map((item) => {
      const source = content.pictures.find(
        (p) => p.section === item.section && p.pictureNode === item.pictureNode,
      );
      return { ...item, paragraph: source.paragraph, anchorUnit: source.anchorUnit };
    }),
  };
}

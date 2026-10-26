import { layoutDrawingText } from "./drawing-text-layout.mjs";
import { inlineDrawingGeometry } from "./inline-drawing-geometry.mjs";
import { projectInlineDrawingTables } from "./inline-drawing-table-projection.mjs";
import { pageParagraphCoverage } from "./page-paragraph-coverage.mjs";

// 인라인 개체 페이지 좌표에 내부 텍스트를 연결합니다. 부동 위치 계산은 하지 않습니다.
export function layoutInlineDrawingPageContent(
  drawing,
  paragraphs,
  declaration,
  placement,
  measure,
  options,
) {
  const unavailable = (error) => ({ state: "unavailable", error });
  const geometry = inlineDrawingGeometry(drawing?.source);
  if (
    !drawing ||
    geometry.state !== "selected" ||
    (drawing.source.caption && !options?.measurement?.caption) ||
    drawing.source.rendering?.angle !== 0
  )
    return unavailable("UnsupportedInlineDrawingPageContent");
  if (
    !Array.isArray(paragraphs) ||
    placement?.objectNode !== drawing.drawingNode ||
    placement.section !== drawing.section ||
    placement.paragraph !== drawing.hostParagraph ||
    placement.unit !== drawing.anchorUnit ||
    !Number.isSafeInteger(placement.pageOrdinal) ||
    placement.pageOrdinal < 0
  )
    return unavailable("InvalidInlineDrawingPageContent");
  const validBox = (box) =>
    box &&
    [box.x, box.y, box.width, box.height, box.x + box.width, box.y + box.height].every(
      Number.isFinite,
    ) &&
    box.width > 0 &&
    box.height > 0;
  if (!validBox(placement.rectangle)) return unavailable("InvalidInlineDrawingPageContent");
  const owners = paragraphs.filter(
    (p) => p.section === drawing.section && p.paragraph === drawing.hostParagraph,
  );
  if (owners.length !== 1 || owners[0].text?.[drawing.anchorUnit] !== "\ufffc")
    return unavailable("InvalidInlineDrawingPageContent");
  const members = paragraphs.filter(
    (p) => p.section === drawing.section && p.drawingText?.drawingNode === drawing.drawingNode,
  );
  const measured = options?.measurement;
  let result;
  if (measured !== undefined) {
    const maxRows = options?.maxRows ?? 20000;
    if (!Number.isSafeInteger(maxRows) || maxRows < 1)
      return unavailable("InvalidInlineDrawingPageContent");
    if (
      measured?.state !== "measured" ||
      measured.section !== drawing.section ||
      measured.drawingNode !== drawing.drawingNode ||
      measured.width !== placement.rectangle.width ||
      measured.height !== placement.rectangle.height ||
      measured.text?.state !== "placed" ||
      !Array.isArray(measured.text.rows)
    )
      return unavailable("InvalidInlineDrawingPageContent");
    if (
      pageParagraphCoverage(members, measured.text.rows).state !== "complete" ||
      measured.text.rows.some(
        (row) =>
          row.drawingNode !== drawing.drawingNode || row.listNode !== drawing.source.text.list_node,
      )
    )
      return unavailable("InvalidInlineDrawingPageContent");
    if (
      !Array.isArray(measured.text.columns) ||
      [measured.text.body, measured.text.textBounds, ...measured.text.columns].some(
        (box) => !validBox(box),
      )
    )
      return unavailable("InvalidInlineDrawingPageContent");
    if (measured.text.rows.length > maxRows) return unavailable("DrawingTextLayoutLimit");
    const translate = (rectangle) => ({
      ...rectangle,
      x: rectangle.x + placement.rectangle.x,
      y: rectangle.y + placement.rectangle.y,
    });
    if (
      measured.text.transform !== undefined ||
      measured.text.rows.some((row) => row.transform !== undefined)
    )
      return unavailable("InvalidInlineDrawingPageContent");
    const rows = measured.text.rows.map(translate);
    if (
      rows.some(
        (row) => ![row.x, row.y, row.x + row.width, row.y + row.height].every(Number.isFinite),
      )
    )
      return unavailable("InvalidInlineDrawingPageContent");
    result = {
      ...measured.text,
      rows,
      body: translate(measured.text.body),
      columns: measured.text.columns.map(translate),
      textBounds: translate(measured.text.textBounds),
    };
    if ([result.body, result.textBounds, ...result.columns].some((box) => !validBox(box)))
      return unavailable("InvalidInlineDrawingPageContent");
  } else
    result = layoutDrawingText(
      drawing,
      members,
      declaration,
      placement.rectangle,
      measure,
      options,
    );
  if (result.state !== "placed") return result;
  if (measured?.inlineTables?.length) {
    result = projectInlineDrawingTables(measured, result, placement, options?.maxRows ?? 20000);
    if (result.state !== "placed") return result;
  }
  let rectangle = placement.rectangle;
  let rows = result.rows;
  if (drawing.source.caption) {
    const caption = measured?.caption,
      local = measured?.drawingRectangle;
    const members = paragraphs.filter(
      (p) => p.section === drawing.section && p.drawingCaption?.drawingNode === drawing.drawingNode,
    );
    if (
      !local ||
      !validBox(local) ||
      caption?.state !== "positioned" ||
      !Array.isArray(caption.rows) ||
      pageParagraphCoverage(members, caption.rows).state !== "complete" ||
      members.some(
        (p) =>
          p.drawingCaption.captionNode !== drawing.source.caption.caption_node ||
          p.drawingCaption.listNode !== drawing.source.caption.list_node,
      ) ||
      caption.rows.some(
        (r) =>
          r.drawingNode !== drawing.drawingNode ||
          r.listNode !== drawing.source.caption.list_node ||
          ![
            r.x,
            r.y,
            r.width,
            r.height,
            r.x + r.width,
            r.y + r.height,
            r.x + placement.rectangle.x,
            r.y + placement.rectangle.y,
          ].every(Number.isFinite),
      )
    )
      return unavailable("InvalidInlineDrawingCaptionProjection");
    if (rows.length + caption.rows.length > (options?.maxRows ?? 20000))
      return unavailable("DrawingTextLayoutLimit");
    rectangle = {
      ...local,
      x: local.x + placement.rectangle.x,
      y: local.y + placement.rectangle.y,
    };
    rows = [
      ...rows,
      ...caption.rows.map((r) => ({
        ...r,
        x: r.x + placement.rectangle.x,
        y: r.y + placement.rectangle.y,
      })),
    ];
  }
  return {
    ...result,
    rectangle,
    pageOrdinal: placement.pageOrdinal,
    rows: rows.map((row) => ({
      ...row,
      pageOrdinal: placement.pageOrdinal,
      referenceBoxes: placement.referenceBoxes,
    })),
  };
}

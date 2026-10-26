import { placeFloatingPicture } from "./picture-placement.mjs";
import { rowLeft, rowTop, rowHeight, TEXT_TOP, TEXT_LEFT } from "./row-geometry.mjs";
import { signedInt32 } from "./signed-int32.mjs";
import { picturePaintPlan } from "./picture-paint-plan.mjs";
import { projectGroupedPicturePage } from "./grouped-picture-page-projection.mjs";
import { inlinePictureIndex } from "./picture-inline.mjs";
import { pictureVisualBounds, inlinePictureShadowExtent } from "./picture-visual-bounds.mjs";

// 현재 세로 텍스트 미리보기의 논리 영역입니다. 원본 페이지/다단 영역은 아닙니다.
export function previewPictureLayers(content, layout, columnWidth) {
  const result = { behind: [], front: [], height: layout.height };
  const shadowExtent = inlinePictureShadowExtent(
    inlinePictureIndex(content),
    layout.rows,
    layout.height,
  );
  result.inlineShadowInsets = { top: shadowExtent.top, bottom: shadowExtent.bottom };
  result.height = Math.max(result.height, shadowExtent.height);
  for (const picture of content.pictures ?? []) {
    if (picture.owner && picture.owner.anchorNode !== picture.pictureNode) {
      const grouped = projectGroupedPicturePage(
        picture,
        content.containers,
        content.paragraphs,
        layout.rows,
      );
      const order = signedInt32(grouped.flow?.z_order);
      if (grouped.state !== "placed" || order === null || grouped.paintLayer === null) continue;
      const visualBounds = pictureVisualBounds(picture, grouped.rectangle);
      if (!visualBounds) continue;
      result[grouped.paintLayer].push({
        picture,
        paintPlan: grouped.paintPlan,
        zOrder: order,
        ...grouped.rectangle,
        visualBounds,
        paintOrigin: grouped.origin,
      });
      result.height = Math.max(result.height, visualBounds.y + visualBounds.height);
      continue;
    }
    const zOrder = signedInt32(picture.flow?.zOrder);
    if (zOrder === null) continue;
    const instances =
      layout.flowPictures?.filter(
        (item) => item.section === picture.section && item.pictureNode === picture.pictureNode,
      ) ?? [];
    if (
      instances.length > 1 &&
      (instances.some(
        (item) =>
          !Number.isSafeInteger(item.pageOrdinal) ||
          item.pageOrdinal < 0 ||
          (item.columnOrdinal !== undefined &&
            (!Number.isSafeInteger(item.columnOrdinal) || item.columnOrdinal < 0)),
      ) ||
        new Set(instances.map((item) => `${item.pageOrdinal}:${item.columnOrdinal ?? 0}`)).size !==
          instances.length)
    )
      continue;
    for (const flowed of instances.length ? instances : [null]) {
      let paintPlan = picturePaintPlan(picture);
      if (
        picture.state !== "located" ||
        paintPlan.state === "unsupported_transform" ||
        !([2, 3].includes(picture.flow?.textWrap) || flowed) ||
        picture.crop?.clip?.length !== 4 ||
        !picture.crop.clip.every(Number.isFinite)
      )
        continue;
      const paragraph = content.paragraphs.find(
        (p) => p.section === picture.section && p.paragraph === picture.paragraph,
      );
      if (
        !paragraph ||
        (paragraph.tableCell && !flowed) ||
        paragraph.clipped ||
        !Number.isInteger(picture.anchorUnit) ||
        paragraph.text?.[picture.anchorUnit] !== "\ufffc"
      )
        continue;
      const rows = layout.rows
        .map((row, index) => ({ row, index }))
        .filter(
          ({ row }) =>
            row.kind === "text" &&
            row.section === picture.section &&
            row.paragraph === picture.paragraph &&
            (flowed?.pageOrdinal === undefined || row.pageOrdinal === flowed.pageOrdinal) &&
            (flowed?.columnOrdinal === undefined || row.columnOrdinal === flowed.columnOrdinal),
        );
      if (!rows.length) continue;
      // 문단 일부만 레이아웃된 경우 앵커가 보이지 않는 그림을 표시하지 않습니다.
      if (
        !rows.some(
          ({ row }) =>
            Number.isInteger(row.startUnit) &&
            Number.isInteger(row.endUnit) &&
            row.startUnit <= picture.anchorUnit &&
            picture.anchorUnit < row.endUnit,
        )
      )
        continue;
      const first = rows[0],
        last = rows.at(-1);
      const boxes = {
        column: { x: TEXT_LEFT, y: 0, width: columnWidth, height: layout.height },
        paragraph: {
          x: rowLeft(first.row),
          y: rowTop(first.row, first.index) + TEXT_TOP,
          width: first.row.width,
          height:
            rowTop(last.row, last.index) + rowHeight(last.row) - rowTop(first.row, first.index),
        },
      };
      const placement = flowed
        ? { state: "placed", rectangle: flowed.rectangle }
        : placeFloatingPicture(picture, boxes);
      if (placement.state !== "placed") continue;
      const { rectangle } = placement;
      if (
        !rectangle ||
        ![
          rectangle.x,
          rectangle.y,
          rectangle.width,
          rectangle.height,
          rectangle.x + rectangle.width,
          rectangle.y + rectangle.height,
        ].every(Number.isFinite) ||
        rectangle.width <= 0 ||
        rectangle.height <= 0
      )
        continue;
      if (
        paintPlan.state === "quad" &&
        (picture.geometry?.widthRelative !== 4 || picture.geometry?.heightRelative !== 2)
      ) {
        const sx = rectangle.width / paintPlan.width,
          sy = rectangle.height / paintPlan.height;
        const corners = paintPlan.corners.map(([x, y]) => [x * sx, y * sy]);
        if (!corners.flat().every(Number.isFinite)) continue;
        paintPlan = { ...paintPlan, corners, width: rectangle.width, height: rectangle.height };
      }
      const visualBounds = pictureVisualBounds(picture, rectangle);
      if (!visualBounds) continue;
      result[picture.flow.textWrap === 2 ? "behind" : "front"].push({
        picture,
        paintPlan,
        zOrder,
        ...rectangle,
        visualBounds,
        ...(flowed
          ? {
              pageOrdinal: flowed.pageOrdinal,
              columnOrdinal: flowed.columnOrdinal,
              ...(flowed.pageClip !== undefined ? { pageClip: flowed.pageClip } : {}),
            }
          : {}),
      });
      result.height = Math.max(
        result.height,
        visualBounds.y + visualBounds.height,
        rectangle.y + (paintPlan.height ?? 0),
      );
    }
  }
  for (const list of [result.behind, result.front])
    list.sort((left, right) => left.zOrder - right.zOrder);
  return result;
}

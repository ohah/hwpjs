import { validGroupContext } from "../../js/hwpx-group-context.mjs";
const key = (section, node) => `${section}:${node}`;

/** Follow explicit paragraph/table/drawing owners, never ancestry by array order. */
export function partitionPageAreaOwnership(content) {
  const fail = (error) => ({ state: "unavailable", error });
  try {
    const index = (rows, property) => {
      const result = new Map();
      if (rows !== undefined && !Array.isArray(rows)) throw new Error("InvalidPageAreaOwnership");
      for (const row of rows ?? []) {
        if (
          !row ||
          ![row.section, row[property]].every((value) => Number.isSafeInteger(value) && value >= 0)
        )
          throw new Error("InvalidPageAreaOwnership");
        const id = key(row.section, row[property]);
        if (result.has(id)) throw new Error("AmbiguousPageAreaOwnership");
        result.set(id, row);
      }
      return result;
    };
    const paragraphs = index(content.paragraphs, "paragraph"),
      tables = index(content.tables, "tableNode"),
      drawings = index(content.drawings, "drawingNode"),
      pictures = index(content.pictures, "pictureNode");
    const curves = index(content.curveTextSources, "curveNode");
    const drawingRoots = index(content.hwp5Drawings, "componentNode");
    for (const id of curves.keys())
      if (drawings.has(id) || pictures.has(id)) throw new Error("AmbiguousPageAreaOwnership");
    const flows = index(content.paragraphFlows, "paragraph"),
      roots = new Map(),
      groups = new Map();
    for (const flow of flows.values()) {
      if (!["header", "footer"].includes(flow.host) || flow.page_area == null) continue;
      if (
        ![flow.page_area.owner_node, flow.page_area.list_node].every(
          (value) => Number.isSafeInteger(value) && value >= 0,
        )
      )
        throw new Error("InvalidPageAreaRootOwnership");
      const id = key(flow.section, flow.paragraph),
        paragraph = paragraphs.get(id);
      if (
        !paragraph ||
        paragraph.tableCell ||
        paragraph.drawingText ||
        paragraph.tableCaption ||
        paragraph.drawingCaption
      )
        throw new Error("InvalidPageAreaRootOwnership");
      const groupId = `${flow.section}:${flow.host}:${flow.page_area.owner_node}:${flow.page_area.list_node}`;
      const group = groups.get(groupId) ?? {
        section: flow.section,
        host: flow.host,
        area: flow.page_area,
        paragraphs: [],
        paragraphFlows: [],
        tables: [],
        drawings: [],
        pictures: [],
        lines: [],
        containers: [],
        curveTextSources: [],
        groupCurves: [],
      };
      if (
        ["owner_node", "list_node", "apply", "width", "height", "vertical_alignment"].some(
          (field) => group.area[field] !== flow.page_area[field],
        )
      )
        throw new Error("ConflictingPageArea");
      groups.set(groupId, group);
      roots.set(id, group);
    }
    const memo = new Map(),
      visiting = new Set();
    const owner = (id) => {
      if (memo.has(id)) return memo.get(id);
      if (visiting.has(id)) throw new Error("CyclicPageAreaOwnership");
      const paragraph = paragraphs.get(id);
      if (!paragraph) throw new Error("MissingPageAreaParagraphOwner");
      visiting.add(id);
      let group = roots.get(id) ?? null;
      const links = [
        paragraph.tableCell,
        paragraph.tableCaption,
        paragraph.drawingText,
        paragraph.drawingCaption,
      ].filter(Boolean);
      if (links.length > 1) throw new Error("AmbiguousPageAreaOwnership");
      if (!group && links.length) {
        const link = links[0],
          objectId = key(paragraph.section, link.drawingNode ?? link.pictureNode);
        const object =
          link.tableNode !== undefined
            ? tables.get(key(paragraph.section, link.tableNode))
            : (drawings.get(objectId) ?? pictures.get(objectId) ?? curves.get(objectId));
        if (!object) {
          const error = new Error("MissingPageAreaObjectOwner");
          error.section = paragraph.section;
          error.paragraph = paragraph.paragraph;
          const property =
            link.tableNode !== undefined
              ? "tableNode"
              : link.pictureNode !== undefined
                ? "pictureNode"
                : "drawingNode";
          const node = link[property];
          if (Number.isSafeInteger(node) && node >= 0) error[property] = node;
          if (property === "drawingNode" && Array.isArray(content.drawingTextSnapshotErrors)) {
            const sources = content.drawingTextSnapshotErrors.filter(
              (row) => row?.section === paragraph.section && row.drawingNode === node,
            );
            if (sources.length === 1 && typeof sources[0].error === "string")
              error.sourceError = sources[0].error.slice(0, 256);
          }
          throw error;
        }
        if (
          paragraph.tableCell &&
          object.cells?.filter(
            (cell) =>
              cell.listNode === link.listNode && cell.paragraphs?.includes(paragraph.paragraph),
          ).length !== 1
        )
          throw new Error("InvalidPageAreaCellOwnership");
        if (paragraph.drawingText && object.source?.text?.list_node !== link.listNode)
          throw new Error("InvalidPageAreaDrawingOwnership");
        if (curves.get(objectId) === object) {
          const host = paragraphs.get(key(paragraph.section, object.hostParagraph)),
            context = object.source?.common?.group_context;
          if (
            !paragraph.drawingText ||
            object.source?.sourceOnly !== true ||
            object.source.node !== link.drawingNode ||
            object.source.text?.node !== link.textNode ||
            !context ||
            !validGroupContext(context, object.curveNode) ||
            object.owner?.paragraph !== object.hostParagraph + 1 ||
            object.owner?.anchor_unit !== object.anchorUnit ||
            object.owner?.anchor_node !== context.root_anchor ||
            !Number.isSafeInteger(object.anchorUnit) ||
            object.anchorUnit < 0 ||
            !host ||
            host.clipped ||
            typeof host.text !== "string" ||
            host.text[object.anchorUnit] !== "\ufffc"
          )
            throw new Error("InvalidPageAreaCurveOwnership");
        }
        group = owner(key(paragraph.section, object.hostParagraph ?? object.paragraph));
      }
      if (!group && ["header", "footer"].includes(flows.get(id)?.host))
        throw new Error("MissingPageAreaRootOwnership");
      visiting.delete(id);
      memo.set(id, group);
      return group;
    };
    const body = { ...content, paragraphs: [], paragraphFlows: [] };
    for (const [id, paragraph] of paragraphs) {
      const group = owner(id);
      if (group) group.paragraphs.push(paragraph);
      else body.paragraphs.push(paragraph);
    }
    for (const [id, flow] of flows) {
      const group = owner(id);
      if (group) group.paragraphFlows.push(flow);
      else body.paragraphFlows.push(flow);
    }
    for (const [property, host] of [
      ["tables", "hostParagraph"],
      ["drawings", "hostParagraph"],
      ["pictures", "paragraph"],
      ["lines", "paragraph"],
      ["containers", "hostParagraph"],
      ["curveTextSources", "hostParagraph"],
      ["groupCurves", "hostParagraph"],
    ]) {
      if (content[property] === undefined) continue;
      body[property] = [];
      for (const object of content[property]) {
        if (
          !object ||
          ![object.section, object[host]].every(
            (value) => Number.isSafeInteger(value) && value >= 0,
          )
        )
          throw new Error("InvalidPageAreaOwnership");
        const group = owner(key(object.section, object[host]));
        if (group) group[property].push(object);
        else body[property].push(object);
      }
    }
    if (content.hwp5Drawings !== undefined) {
      body.hwp5Drawings = [];
      for (const group of groups.values()) group.hwp5Drawings = [];
      for (const root of drawingRoots.values()) {
        if (!Number.isSafeInteger(root.hostParagraph) || root.hostParagraph < 0)
          throw new Error("InvalidPageAreaOwnership");
        const group = owner(key(root.section, root.hostParagraph));
        (group ?? body).hwp5Drawings.push(root);
      }
    }
    return { state: "partitioned", body, areas: [...groups.values()] };
  } catch (error) {
    const result = fail(error.message);
    if (error.message === "MissingPageAreaObjectOwner") {
      for (const field of ["section", "paragraph", "tableNode", "pictureNode", "drawingNode"])
        if (Number.isSafeInteger(error[field]) && error[field] >= 0) result[field] = error[field];
      if (typeof error.sourceError === "string") result.sourceError = error.sourceError;
    }
    return result;
  }
}

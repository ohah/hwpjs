import { createProjectionPairIndex, isProjectionDataOnly } from './projection-pair-index.mjs';
import { hwp5DrawingTextSource } from './hwp5-drawing-text-source.mjs';
import { validateHwp5DrawingListSources } from '../../js/hwp5-drawing-list-sources.mjs';
import { hwp5CaptionGeometry } from './hwp5-caption-geometry.mjs';

// Ephemeral display ownership, not a rewrite of native current paragraph identities.
export function projectHwp5DrawingText(content) {
  const fail = (error) => ({ state: 'unavailable', error });
  try {
    if (
      !Array.isArray(content?.paragraphs) ||
      content.hwp5DrawingErrors?.length ||
      content.hwp5DrawingBodyErrors?.length
    )
      throw new Error('IncompleteHwp5DrawingTextSources');
    const paragraphs = new Map(),
      owners = new Map(),
      bindings = [];
    for (const paragraph of content.paragraphs) {
      const key = `${paragraph.section}:${paragraph.paragraph}`;
      if (paragraphs.has(key)) throw new Error('AmbiguousHwp5DrawingTextParagraph');
      paragraphs.set(key, paragraph);
    }
    const bodies = content.hwp5DrawingBodies ?? [];
    const rootsData = Object.getOwnPropertyDescriptor(content, 'hwp5Drawings');
    const flowsData = Object.getOwnPropertyDescriptor(content, 'currentParagraphFlows');
    const stableBodies =
      Array.isArray(bodies) &&
      bodies.length > 0 &&
      rootsData &&
      Object.hasOwn(rootsData, 'value') &&
      flowsData &&
      Object.hasOwn(flowsData, 'value') &&
      Array.isArray(rootsData.value ?? []) &&
      Array.isArray(flowsData.value ?? []) &&
      isProjectionDataOnly([bodies, content.paragraphs, rootsData.value, flowsData.value]);
    const rootsByOwner = stableBodies
      ? createProjectionPairIndex(rootsData.value ?? [], 'section', 'controlNode')
      : null;
    const flowsByParagraph = stableBodies
      ? createProjectionPairIndex(flowsData.value ?? [], 'section', 'paragraph')
      : null;
    const lists = new Set();
    for (const body of bodies) {
      validateHwp5DrawingListSources([body.source]);
      const source = body.source,
        listKey = `${body.section}:${body.listNode}`;
      if (
        lists.has(listKey) ||
        body.kind !== source.kind ||
        body.ownerNode !== source.owner_node ||
        body.controlNode !== source.control_node ||
        body.listNode !== source.list_node
      )
        throw new Error('Hwp5DrawingTextSourceMismatch');
      lists.add(listKey);
      const rootMatches = stableBodies
        ? null
        : (content.hwp5Drawings ?? []).filter(
            (row) => row.section === body.section && row.controlNode === body.controlNode,
          );
      const roots = !stableBodies
        ? { count: rootMatches.length, first: rootMatches[0] }
        : rootsByOwner.find(body.section, body.controlNode);
      if (roots.count !== 1) throw new Error('MissingHwp5DrawingTextRoot');
      const drawingNode = body.kind === 'body' ? body.ownerNode : roots.first.componentNode;
      const text = body.kind === 'body' ? hwp5DrawingTextSource(source) : null;
      const caption =
        body.kind === 'caption'
          ? hwp5CaptionGeometry({
              ...source.caption,
              attributes: source.attributes,
              list_node: body.listNode,
            })
          : null;
      if (!Array.isArray(body.paragraphs)) throw new Error('InvalidHwp5DrawingTextMembers');
      for (const id of body.paragraphs) {
        const key = `${body.section}:${id}`,
          paragraph = paragraphs.get(key);
        const flowMatches = stableBodies
          ? null
          : (content.currentParagraphFlows ?? []).filter(
              (row) => row.section === body.section && row.paragraph === id,
            );
        const flows = !stableBodies
          ? { count: flowMatches.length, first: flowMatches[0] }
          : flowsByParagraph.find(body.section, id);
        if (
          !Number.isInteger(id) ||
          id < 0 ||
          id > 0xffffffff ||
          owners.has(key) ||
          !paragraph ||
          paragraph.clipped ||
          paragraph.tableCell ||
          paragraph.tableCaption ||
          flows.count !== 1 ||
          flows.first.host !== 'drawing' ||
          flows.first.parent_node !== body.ownerNode ||
          flows.first.list_node !== body.listNode ||
          flows.first.top_level !== false
        )
          throw new Error('Hwp5DrawingTextMemberMismatch');
        owners.set(key, {
          kind: body.kind,
          drawingNode,
          listNode: body.listNode,
          captionNode: caption?.caption_node,
        });
      }
      bindings.push({
        section: body.section,
        kind: body.kind,
        controlNode: body.controlNode,
        drawingNode,
        listNode: body.listNode,
        text,
        caption,
      });
    }
    for (const flow of content.currentParagraphFlows ?? [])
      if (flow.host === 'drawing' && !owners.has(`${flow.section}:${flow.paragraph}`))
        throw new Error('MissingHwp5DrawingTextMember');
    const projected = content.paragraphs.map((paragraph) => {
      // 표시 소유권을 바꾸지 않는 immutable 행은 원본 identity를 유지합니다.
      // 외부 복제 행에 권위를 부여하지 않습니다. 실제 Native membership은 별도로 검증합니다.
      if (
        Object.isFrozen(paragraph) &&
        [Object.prototype, null].includes(Object.getPrototypeOf(paragraph)) &&
        !('drawingText' in paragraph) &&
        !('drawingCaption' in paragraph) &&
        Reflect.ownKeys(paragraph).every(
          (key) =>
            typeof key === 'string' &&
            Object.hasOwn(Object.getOwnPropertyDescriptor(paragraph, key), 'value'),
        ) &&
        !owners.has(`${paragraph.section}:${paragraph.paragraph}`)
      )
        return paragraph;

      const {
        drawingText: _previousDrawingText,
        drawingCaption: _previousDrawingCaption,
        ...copy
      } = paragraph;
      const owner = owners.get(`${paragraph.section}:${paragraph.paragraph}`);
      if (owner)
        copy[owner.kind === 'body' ? 'drawingText' : 'drawingCaption'] = {
          drawingNode: owner.drawingNode,
          listNode: owner.listNode,
          ...(owner.kind === 'caption' ? { captionNode: owner.captionNode } : {}),
        };
      return copy;
    });
    return { state: 'projected', paragraphs: projected, bindings };
  } catch (error) {
    return fail(error.message);
  }
}

// 이 테스트가 생성하는 body fixture만 판정하는 독립 기대값입니다.
// 제품 validator·색상/기하 변환·색인을 가져오지 않습니다.
export function projectHwp5DrawingText(content) {
  try {
    const owners = new Map();
    const bindings = [];
    const lists = new Set();
    for (const body of content.hwp5DrawingBodies) {
      const source = body.source;
      const listKey = `${body.section}:${body.listNode}`;
      if (
        lists.has(listKey) ||
        body.kind !== source.kind ||
        body.ownerNode !== source.owner_node ||
        body.controlNode !== source.control_node ||
        body.listNode !== source.list_node
      )
        throw Error('Hwp5DrawingTextSourceMismatch');
      lists.add(listKey);
      const roots = (content.hwp5Drawings ?? []).filter(
        (row) => row.section === body.section && row.controlNode === body.controlNode,
      );
      if (roots.length !== 1) throw Error('MissingHwp5DrawingTextRoot');
      if (
        source.kind !== 'body' ||
        source.attributes !== 0 ||
        source.body_extra_bytes !== 0 ||
        source.margins.some((value) => value !== 0)
      )
        throw Error('OracleFixtureOutsideScope');
      for (const id of body.paragraphs) {
        const key = `${body.section}:${id}`;
        const paragraph = content.paragraphs.find(
          (row) => `${row.section}:${row.paragraph}` === key,
        );
        const flows = (content.currentParagraphFlows ?? []).filter(
          (row) => row.section === body.section && row.paragraph === id,
        );
        if (
          !Number.isInteger(id) ||
          id < 0 ||
          id > 0xffffffff ||
          owners.has(key) ||
          !paragraph ||
          paragraph.clipped ||
          paragraph.tableCell ||
          paragraph.tableCaption ||
          flows.length !== 1 ||
          flows[0].host !== 'drawing' ||
          flows[0].parent_node !== body.ownerNode ||
          flows[0].list_node !== body.listNode ||
          flows[0].top_level !== false
        )
          throw Error('Hwp5DrawingTextMemberMismatch');
        owners.set(key, { drawingNode: body.ownerNode, listNode: body.listNode });
      }
      bindings.push({
        section: body.section,
        kind: body.kind,
        controlNode: body.controlNode,
        drawingNode: body.ownerNode,
        listNode: body.listNode,
        text: {
          list_node: source.list_node,
          text_direction: 0,
          line_wrap: 0,
          vertical_alignment: 0,
          margin_present: true,
          margins: [0, 0, 0, 0],
          extra_bytes: 0,
        },
        caption: null,
      });
    }
    for (const flow of content.currentParagraphFlows ?? [])
      if (flow.host === 'drawing' && !owners.has(`${flow.section}:${flow.paragraph}`))
        throw Error('MissingHwp5DrawingTextMember');
    return {
      state: 'projected',
      paragraphs: content.paragraphs.map((paragraph) => {
        const owner = owners.get(`${paragraph.section}:${paragraph.paragraph}`);
        return owner ? { ...paragraph, drawingText: owner } : { ...paragraph };
      }),
      bindings,
    };
  } catch (error) {
    return { state: 'unavailable', error: error.message };
  }
}

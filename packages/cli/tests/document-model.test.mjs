import test from 'node:test';
import assert from 'node:assert/strict';
import { readDocumentModel } from '../src/document-model.ts';
const hash = 'a'.repeat(64);
import { buildObjectReference, canonicalImageId } from '../src/object-reference.ts';
function hx() {
  const data = {
    paragraphs: [
      { paragraph: 1, text: 'body', nested: false },
      { paragraph: 2, text: 'cell', nested: true },
      { paragraph: 3, text: 'head', nested: true },
      { paragraph: 4, text: 'foot', nested: true },
    ],
    flows: [
      { paragraph: 1, source_node: 1, host: 'body', top_level: true },
      { paragraph: 2, source_node: 14, host: 'other', top_level: false },
      {
        paragraph: 3,
        source_node: 32,
        host: 'header',
        top_level: false,
        page_area: { owner_node: 30, list_node: 31, apply: 'both' },
      },
      {
        paragraph: 4,
        source_node: 42,
        host: 'footer',
        top_level: false,
        page_area: { owner_node: 40, list_node: 41, apply: 'odd' },
      },
    ],
    bindings: [
      {
        paragraph: 2,
        tableNode: 10,
        listNode: 12,
        rows: 1,
        columns: 1,
        row: 0,
        column: 0,
        rowSpan: 1,
        columnSpan: 1,
      },
    ],
    placements: [{ tableNode: 10, paragraph: 1, parentTableNode: null, parentListNode: null }],
    inventory: { cells: [{ table_node: 10, cell_node: 11, list_node: 12 }], styles: [] },
    areas: [
      { paragraph: 1, sourceElement: 30, sourceControl: 29, unit: 0 },
      { paragraph: 1, sourceElement: 40, sourceControl: 39, unit: 0 },
    ],
    sites: [{ pictureNode: 50, paragraph: 1, anchorUnit: 0 }],
    owners: [
      { pictureNode: 50, owner: { paragraph: 1, anchorNode: 50, anchorUnit: 0 }, error: null },
    ],
  };
  const sdk = {
    paragraphTextSnapshot: () => data.paragraphs,
    paragraphFlow: () => data.flows,
    anchorText: (_s, p) => `native:${data.paragraphs.find((x) => x.paragraph === p).text}`,
    tableBindings: () => data.bindings,
    tablePlacements: () => data.placements,
    tableBorderSources: () => data.inventory,
    pageAreaDeclarations: () => data.areas,
    pictureSites: () => data.sites,
    pictureOwners: () => data.owners,
  };
  return { data, sdk };
}
function h5() {
  const data = {
    text: 'native\r',
    display: 'readable',
    present: true,
    declaredUnits: 1,
    tokens: [],
    flow: {
      paragraph: 0,
      source_node: 7,
      template_node: 7,
      generated: false,
      host: 'body',
      top_level: true,
    },
    areas: [],
  };
  const sdk = {
    paragraphCount: () => 1,
    currentTextPreview: () => ({
      sections: [
        {
          index: 0,
          paragraphs: [
            {
              nodeIndex: 7,
              text: data.display,
              textPresent: data.present,
              declaredUnits: data.declaredUnits,
              tokens: data.tokens,
              rawUnknown: { text: 'DO NOT RECOVER' },
            },
          ],
        },
      ],
    }),
    paragraphFlow: () => [data.flow],
    text: () => data.text,
    tableBindings: () => [],
    tablePlacements: () => [],
    tableLayoutSources: () => [],
    cellLayoutSources: () => [],
    pageAreaSources: () => data.areas,
    tableAnchors: () => [],
    drawingSources: () => [],
    drawingAnchors: () => [],
    pictureSources: () => [],
  };
  return { data, sdk };
}
const read = (format, sdk, sectionCount = 1) =>
  readDocumentModel({ format, sourceSha256: hash, sectionCount, sdk });
function paragraphs(model) {
  const out = [];
  const stack = [
    ...model.sections.flatMap((s) => [
      ...s.body,
      ...s.header.definitions.flatMap((d) => d.blocks),
      ...s.footer.definitions.flatMap((d) => d.blocks),
    ]),
    ...model.unplaced.map((x) => x.block),
  ];
  while (stack.length) {
    const b = stack.pop();
    if (b.type === 'paragraph') out.push(b);
    if (b.type === 'table') for (const c of b.cells) stack.push(...c.blocks);
  }
  return out;
}

function objectBlocks(model) {
  const output = [];
  const stack = [
    ...model.sections.flatMap((s) => [
      ...s.body,
      ...s.header.definitions.flatMap((d) => d.blocks),
      ...s.footer.definitions.flatMap((d) => d.blocks),
    ]),
    ...model.unplaced.map((r) => r.block),
  ];
  while (stack.length) {
    const block = stack.pop();
    if (block.type !== 'paragraph') output.push(block);
    if (block.type === 'table')
      for (const cell of block.cells) for (const child of cell.blocks) stack.push(child);
  }
  return output;
}

test('개체 참조는 실제 표와 이미지 재고의 원본 노드 및 문서 SHA를 사용한다', async () => {
  const { sdk } = hx();
  const model = await read('hwpx', sdk);
  const table = objectBlocks(model).find((b) => b.type === 'table');
  const image = objectBlocks(model).find((b) => b.type === 'image');
  assert.equal(
    table.reference,
    buildObjectReference({
      sourceSha256: hash,
      format: 'hwpx',
      section: 0,
      kind: 'table',
      node: 10,
    }),
  );
  assert.equal(
    image.reference,
    buildObjectReference({
      sourceSha256: hash,
      format: 'hwpx',
      section: 0,
      kind: 'image',
      node: 50,
    }),
  );
  assert.equal(image.imageId, canonicalImageId({ format: 'hwpx', section: 0, node: 50 }));
});

test('그림 위치 재고가 없으면 소유자 대체 관측은 추출 참조를 만들지 않는다', async () => {
  const { sdk } = hx();
  sdk.pictureSites = () => {
    throw new Error('미지원');
  };
  const image = objectBlocks(await read('hwpx', sdk)).find((b) => b.type === 'image');
  assert.equal(image.reference, null);
  assert.equal(image.imageId, null);
});

test('H5 확인된 그림과 프로필 대체 그림은 동일 노드를 중복하지 않으며 참조가 구분된다', async () => {
  const { sdk } = h5();
  sdk.pictureSources = () => [
    { component_node: 9, picture_node: 10, owner_node: 8, bin_data_id: 1 },
  ];
  sdk.drawingSources = () => [{ component_node: 9, control_node: 8, kind_id: 0x24706963 }];
  sdk.drawingComponentSources = () => [{ component_node: 9, owner_node: 8, kind_id: 0x24706963 }];
  const first = objectBlocks(await read('hwp5', sdk)).filter((b) => b.type === 'image');
  assert.equal(first.length, 1);
  assert.equal(first[0].imageId, 'hwp5:s0:i9');
  sdk.pictureSources = () => {
    throw new Error('프로필 미지원');
  };
  const fallback = objectBlocks(await read('hwp5', sdk)).filter((b) => b.type === 'image');
  assert.equal(fallback.length, 1);
  assert.equal(fallback[0].reference, null);
});

test('H5 잔여 code11은 현재 위치의 정식 앵커 합집합을 제외하고 raw 없이 미분류로 표시한다', async () => {
  const { sdk, data } = h5();
  const token = (unit) => ({
    type: 'control',
    code: 11,
    startUnit: unit,
    get raw() {
      throw new Error('raw 접근 금지');
    },
  });
  data.tokens = [token(8), token(16), token(24)];
  sdk.tableAnchors = () => [{ paragraph: 0, current_unit: 8, source_unit: 24 }];
  sdk.drawingAnchors = () => [
    { paragraph: 0, current_unit: 16, source_unit: 24, component_node: 99 },
  ];
  sdk.drawingComponentSources = () => [];
  const model = await read('hwp5', sdk);
  const residual = objectBlocks(model).filter((b) => b.kind === 'unknown');
  assert.equal(residual.length, 1);
  assert.equal(residual[0].source.anchorUnit, 24);
  assert.equal(residual[0].reference, null);
  assert.equal(Object.hasOwn(residual[0].source, 'node'), false);
  assert.equal(model.coverage.objectInventoryComplete, false);
});

test('H5 앵커 미관측과 중복 토큰은 위치를 추정하지 않고 불완전 재고로 남긴다', async () => {
  for (const duplicate of [false, true]) {
    const { sdk, data } = h5();
    data.tokens = Array.from({ length: duplicate ? 2 : 1 }, () => ({
      type: 'control',
      code: 11,
      startUnit: 8,
    }));
    sdk.drawingComponentSources = () => [];
    if (!duplicate)
      sdk.tableAnchors = () => {
        throw new Error('앵커 미지원');
      };
    const model = await read('hwp5', sdk);
    assert.equal(model.coverage.objectsKnown, false);
    assert.equal(model.unplaced.filter((r) => r.block.kind === 'unknown').length, 1);
    assert.equal(model.coverage.objectsUnplaced, 1);
  }
});

test('HX 실제 종류 재고만 읽고 차트 수식 OLE 상세와 바이너리는 읽지 않는다', async () => {
  const { sdk } = hx();
  sdk.chartSites = () => [{ wrapper: 60, paragraph: 1, anchorUnit: 8, error_name: null }];
  sdk.equationSites = () => [
    { source: { node: 61, issue: null }, paragraph: 1, anchor_unit: 16, error_name: null },
  ];
  sdk.oleSites = () => [{ ole_node: 62, paragraph: 1, error_name: 'UnsupportedSource' }];
  sdk.rectangleNodes = () => [63];
  sdk.lineNodes = sdk.connectorNodes = sdk.ellipseSources = () => [];
  sdk.drawingTextBindings = () => [{ drawingNode: 63, paragraph: 2 }];
  for (const key of ['chartDisplay', 'chartPoints', 'equationScript', 'oleBytes', 'binaryResource'])
    sdk[key] = () => {
      throw new Error('읽기에서 상세 호출 금지');
    };
  const model = await read('hwpx', sdk);
  const objects = objectBlocks(model);
  for (const kind of ['chart', 'equation', 'ole', 'drawing'])
    assert.equal(objects.filter((b) => b.kind === kind).length, 1);
  assert.equal(objects.find((b) => b.kind === 'ole').detailUnavailable, true);
  assert.equal(model.coverage.objectsKnown, true);
  assert.equal(model.coverage.objectInventoryComplete, false);
  assert.ok(model.unplaced.some((r) => r.block.kind === 'drawing'));
});

test('추가 개체 재고의 실패와 잘못된 행은 관측된 영 개로 숨기지 않는다', async () => {
  for (const value of [null, [{ wrapper: '잘못된 노드' }]]) {
    const { sdk } = hx();
    sdk.chartSites = () => value;
    const model = await read('hwpx', sdk);
    assert.equal(model.coverage.objectsKnown, false);
    assert.equal(model.coverage.inventoryComplete, false);
    assert.ok(model.warnings.some((w) => w.code === 'ObjectInventoryIncomplete'));
  }
  const { sdk } = h5();
  sdk.drawingComponentSources = () => [{ component_node: 9, owner_node: null, kind_id: 1 }];
  assert.equal((await read('hwp5', sdk)).coverage.objectsKnown, false);
});

test('HX 동일 원본 노드의 충돌하는 종류를 첫 행 우선으로 숨기지 않는다', async () => {
  const { sdk } = hx();
  sdk.chartSites = () => [{ wrapper: 60, paragraph: 1, anchorUnit: 0, error_name: null }];
  sdk.oleSites = () => [{ ole_node: 60, paragraph: 1, error_name: null }];
  await assert.rejects(read('hwpx', sdk), /ConflictingObjectKind/);
});

test('H5 토큰 재고는 문단 개수와 preview 전체 범위가 확인된 경우에만 알려짐으로 표시한다', async () => {
  for (const mode of [
    'count-unavailable',
    'preview-unavailable',
    'rows-unavailable',
    'rows-mismatch',
    'complete',
  ]) {
    const { sdk, data } = h5();
    sdk.drawingComponentSources = () => [];
    data.tokens = [{ type: 'control', code: 11, startUnit: 8 }];
    if (mode === 'count-unavailable') {
      sdk.paragraphCount = () => {
        throw new Error('문단 개수 미관측');
      };
      sdk.paragraphFlow = () => [];
    } else if (mode === 'preview-unavailable') {
      sdk.currentTextPreview = () => {
        throw new Error('preview 미관측');
      };
    } else if (mode === 'rows-unavailable') {
      sdk.currentTextPreview = () => ({ sections: [{ index: 0, paragraphs: null }] });
    } else if (mode === 'rows-mismatch') {
      const preview = sdk.currentTextPreview();
      preview.sections[0].paragraphs.push({
        nodeIndex: 99,
        text: '',
        textPresent: true,
        tokens: data.tokens,
      });
      sdk.currentTextPreview = () => preview;
    }
    const model = await read('hwp5', sdk);
    assert.equal(model.coverage.objectsKnown, mode === 'complete', mode);
    if (mode === 'count-unavailable') {
      assert.equal(model.coverage.objectTotal, 0);
      assert.equal(model.coverage.inventoryComplete, false);
      assert.equal(
        model.sections[0].body.some((block) => block.reference),
        false,
      );
    }
  }
});
test('model H5 native zero ordinal and owned displayText without raw text', async () => {
  const { sdk } = h5();
  const m = await read('hwp5', sdk);
  assert.equal(m.sourceSha256, hash);
  assert.equal(m.sections[0].body[0].id, 's0:p0');
  assert.equal(Object.hasOwn(m.sections[0].body[0], 'text'), false);
  assert.equal(m.sections[0].body[0].displayText, 'readable');
  assert.equal(m.sections[0].body[0].editability, 'range-check-required');
  assert.equal(m.coverage.placed, 1);
});
test('model HX native one ordinals exactonce header footer table and image', async () => {
  const { sdk } = hx();
  const m = await read('hwpx', sdk);
  assert.equal(m.coordinates.paragraphBase, 1);
  assert.deepEqual(
    paragraphs(m)
      .map((p) => p.id)
      .sort(),
    ['s0:p1', 's0:p2', 's0:p3', 's0:p4'],
  );
  assert.equal(m.coverage.observedParagraphs, 4);
  assert.equal(m.coverage.placed, 4);
  assert.equal(m.coverage.unplaced, 0);
  assert.equal(m.sections[0].header.definitions[0].blocks[0].id, 's0:p3');
  assert.equal(m.sections[0].footer.definitions[0].apply, 'odd');
  assert.equal(m.sections[0].body.filter((b) => b.type === 'paragraph').length, 1);
  assert.equal(m.sections[0].body.find((b) => b.type === 'image').altState, 'not-exposed');
});
test('model no own declaration never resolves inheritance by previous section', async () => {
  const { data, sdk } = h5();
  const m = await read('hwp5', sdk, 2);
  assert.equal(data.areas.length, 0);
  for (const s of m.sections) {
    assert.deepEqual(s.header.definitions, []);
    assert.equal(s.header.declarations, 'known');
    assert.equal(s.header.inheritance.state, 'unresolved');
  }
  assert.equal(m.coverage.pageAreaInheritanceKnown, false);
});
test('model unavailable page area inventory is explicit not none', async () => {
  const { sdk } = h5();
  sdk.pageAreaSources = () => {
    throw Error('UnreadableHeader');
  };
  const m = await read('hwp5', sdk);
  assert.equal(m.sections[0].header.declarations, 'unavailable');
  assert.equal(m.coverage.pageAreasKnown, false);
  assert.ok(m.warnings.some((w) => w.message.includes('UnreadableHeader')));
});
test('model empty displayText never falls back to native control payload', async () => {
  const { data, sdk } = h5();
  data.display = '';
  data.text = '\u0002捤獥\0\r';
  const m = await read('hwp5', sdk);
  assert.equal(m.sections[0].body[0].displayText, '');
  assert.equal(Object.hasOwn(m.sections[0].body[0], 'text'), false);
  assert.equal(JSON.stringify(m).includes('DO NOT RECOVER'), false);
});
test('model missing displayText remains own null with coverage warning', async () => {
  const { data, sdk } = h5();
  data.present = false;
  const m = await read('hwp5', sdk);
  assert.ok(Object.hasOwn(m.sections[0].body[0], 'displayText'));
  assert.equal(m.sections[0].body[0].displayText, null);
  assert.equal(m.coverage.unknownBlocks, 1);
  assert.ok(m.warnings.some((w) => w.code === 'DisplayTextUnavailable'));
});
test('model observed empty H5 paragraphs do not require a text record', async () => {
  for (const units of [0, 1]) {
    const { data, sdk } = h5();
    data.display = '';
    data.present = false;
    data.declaredUnits = units;
    const m = await read('hwp5', sdk);
    assert.equal(m.sections[0].body[0].displayText, '');
    assert.equal(m.coverage.unknownBlocks, 0);
    assert.equal(
      m.warnings.some((w) => w.code === 'DisplayTextUnavailable'),
      false,
    );
    assert.equal(sdk.currentTextPreview().sections[0].paragraphs[0].textPresent, false);
  }
});
test('model absent H5 text cannot conceal inconsistent or unavailable observations', async () => {
  for (const change of [
    { declaredUnits: 2 },
    { declaredUnits: undefined },
    { declaredUnits: -1 },
    { tokens: undefined },
    { tokens: [{ type: 'control', code: 13 }] },
    { display: undefined },
    { present: undefined },
  ]) {
    const { data, sdk } = h5();
    Object.assign(data, { display: '', present: false }, change);
    const m = await read('hwp5', sdk);
    assert.equal(m.sections[0].body[0].displayText, null);
    assert.ok(m.warnings.some((w) => w.code === 'DisplayTextUnavailable'));
  }
});
test('model empty H5 text cannot conceal missing preview or mismatched identity', async () => {
  for (const mismatch of [false, true]) {
    const { data, sdk } = h5();
    data.display = '';
    data.present = false;
    if (mismatch) data.flow.source_node = 8;
    else sdk.currentTextPreview = () => ({ sections: [{ index: 0, paragraphs: [] }] });
    const m = await read('hwp5', sdk);
    assert.equal(paragraphs(m)[0].displayText, null);
    assert.ok(m.warnings.some((w) => w.code === 'DisplayTextUnavailable'));
    if (mismatch) assert.ok(m.warnings.some((w) => w.code === 'ParagraphSourceMismatch'));
  }
});
test('model never calls raw editing text getters', async () => {
  const { sdk } = h5();
  sdk.text = () => {
    throw Error('UnknownNativeText');
  };
  const m = await read('hwp5', sdk);
  assert.equal(m.sections[0].body[0].type, 'paragraph');
  assert.equal(m.sections[0].body[0].displayText, 'readable');
  assert.equal(m.coverage.placed, 1);
});
test('model body ownership absent yields unplaced readable paragraph once', async () => {
  const { data, sdk } = h5();
  data.flow.host = 'other';
  data.flow.top_level = false;
  const m = await read('hwp5', sdk);
  assert.equal(m.sections[0].body.length, 0);
  assert.equal(m.unplaced.length, 1);
  assert.equal(m.coverage.unplaced, 1);
  assert.equal(paragraphs(m).length, 1);
});
test('model duplicate paragraph identities are rejected instead of first wins', async () => {
  const { data, sdk } = hx();
  data.paragraphs.push({ ...data.paragraphs[0] });
  await assert.rejects(read('hwpx', sdk), /DuplicateParagraphIdentity/);
});
test('model duplicate cell binding makes ownership ambiguous not guessed', async () => {
  const { data, sdk } = hx();
  data.bindings.push({ ...data.bindings[0] });
  const m = await read('hwpx', sdk);
  assert.equal(m.coverage.unplaced, 1);
  assert.equal(paragraphs(m).filter((p) => p.id === 's0:p2').length, 1);
  assert.ok(m.warnings.some((w) => w.code === 'AmbiguousSourceIdentity'));
});
test('model sparse billion dimensions do not allocate dense grid or fillers', async () => {
  const { data, sdk } = hx();
  data.bindings[0].rows = 1000000000;
  data.bindings[0].columns = 1000000000;
  const m = await read('hwpx', sdk);
  const t = m.sections[0].body.find((b) => b.type === 'table');
  assert.equal(t.rows, 1000000000);
  assert.equal(t.cells.length, 1);
  assert.equal(t.cells[0].rowSpan, 1);
});
test('model missing cell geometry is null with unknown diagnostic not 1x1', async () => {
  const { data, sdk } = hx();
  data.bindings = [];
  const m = await read('hwpx', sdk);
  const t = m.sections[0].body.find((b) => b.type === 'table');
  assert.equal(t.cells[0].rowSpan, null);
  assert.equal(t.cells[0].geometryKnown, false);
  assert.equal(t.cells[0].blocks[0].type, 'unknown');
  assert.equal(m.coverage.unplaced, 1);
});
test('model cyclic table parent cannot duplicate paragraphs or output object cycles', async () => {
  const { data, sdk } = hx();
  data.placements[0].paragraph = 2;
  const m = await read('hwpx', sdk);
  assert.doesNotThrow(() => JSON.stringify(m));
  assert.equal(paragraphs(m).length, 4);
  assert.equal(m.coverage.unplaced, 1);
});
test('model image missing owner stays image in unplaced with metadata only', async () => {
  const { data, sdk } = hx();
  data.owners[0].owner = null;
  data.owners[0].error = 'MissingPictureOwner';
  const m = await read('hwpx', sdk);
  assert.equal(m.unplaced.find((x) => x.block.type === 'image').block.alt, null);
  assert.equal(
    m.sections[0].body.some((x) => x.type === 'image'),
    false,
  );
});
test('model source and sdk data are not retained by projected blocks', async () => {
  const { data, sdk } = hx();
  const m = await read('hwpx', sdk);
  const before = JSON.stringify(m);
  data.flows[0].source_node = 999;
  data.bindings[0].rows = 999;
  data.paragraphs[0].text = 'mutated';
  data.owners[0].owner.paragraph = 100;
  assert.equal(JSON.stringify(m), before);
  assert.equal(JSON.stringify(m).includes('sdk'), false);
});
test('model unreadable section has unknown block and total unknown not empty document', async () => {
  const { sdk } = hx();
  sdk.paragraphTextSnapshot = () => {
    throw Error('UnreadableSection');
  };
  const m = await read('hwpx', sdk);
  assert.equal(m.coverage.paragraphTotal, null);
  assert.equal(m.coverage.inventoryComplete, false);
  assert.equal(m.coverage.unreadableSections, 1);
  assert.equal(m.sections[0].body[0].type, 'unknown');
});
test('model unknown apply never defaults to both', async () => {
  const { data, sdk } = hx();
  data.flows[2].page_area.apply = null;
  const m = await read('hwpx', sdk);
  assert.equal(m.sections[0].header.definitions[0].apply, null);
});
test('model validates stamp and format before accessing sdk', async () => {
  const sdk = new Proxy(
    {},
    {
      get() {
        throw Error('ShouldNotAccessSdk');
      },
    },
  );
  await assert.rejects(
    readDocumentModel({ format: 'hwp5', sourceSha256: 'bad', sectionCount: 1, sdk }),
    /InvalidSourceSha256/,
  );
  await assert.rejects(
    readDocumentModel({ format: 'unknown', sourceSha256: hash, sectionCount: 1, sdk }),
    /InvalidDocumentFormat/,
  );
});
test('model unpaired Unicode is refused rather than silently replaced', async () => {
  const { data, sdk } = h5();
  data.display = '\ud800';
  await assert.rejects(read('hwp5', sdk), /InvalidDocumentText/);
});
test('model known H5 drawing still reports image when picture profile unavailable', async () => {
  const { sdk } = h5();
  sdk.pictureSources = () => {
    throw Error('UnsupportedPicturePrefix');
  };
  sdk.drawingSources = () => [
    { kind_id: 0x24706963, component_node: 9, control_node: 8, width: 1000, height: 2000 },
  ];
  sdk.drawingAnchors = () => [
    { component_node: 9, control_node: 8, paragraph: 0, current_unit: 0 },
  ];
  const m = await read('hwp5', sdk);
  const image = m.sections[0].body.find((b) => b.type === 'image');
  assert.equal(image.sourceInfo.componentNode, 9);
  assert.equal(image.altState, 'not-exposed');
  assert.equal(m.coverage.imagesKnown, false);
  assert.ok(m.warnings.some((w) => w.code === 'PictureSourceUnobserved'));
});
test('model known HX image remains present if sites getter unavailable', async () => {
  const { sdk } = hx();
  sdk.pictureSites = () => {
    throw Error('SitesUnavailable');
  };
  const m = await read('hwpx', sdk);
  assert.equal(m.sections[0].body.filter((b) => b.type === 'image').length, 1);
  assert.equal(m.coverage.imagesKnown, false);
});
test('model collector does not mutate returned SDK arrays during image fallback', async () => {
  const { data, sdk } = hx();
  data.sites = [];
  const before = JSON.stringify(data);
  await read('hwpx', sdk);
  assert.equal(JSON.stringify(data), before);
});
test('model memoized deep ownership is bounded and every observed paragraph stays exactonce', async () => {
  const { data, sdk } = hx();
  const n = 80;
  data.paragraphs = [];
  data.flows = [];
  data.bindings = [];
  data.placements = [];
  data.inventory = { cells: [], styles: [] };
  data.areas = [];
  data.sites = [];
  data.owners = [];
  for (let i = 1; i <= n; i++) {
    data.paragraphs.push({ paragraph: i, text: `p${i}`, nested: i !== 1 });
    data.flows.push({
      paragraph: i,
      source_node: i,
      host: i === 1 ? 'body' : 'other',
      top_level: i === 1,
    });
    if (i < n) {
      const tableNode = 1000 + i,
        listNode = 2000 + i;
      data.placements.push({
        tableNode,
        paragraph: i,
        parentTableNode: i === 1 ? null : 1000 + i - 1,
        parentListNode: i === 1 ? null : 2000 + i - 1,
      });
      data.inventory.cells.push({
        table_node: tableNode,
        cell_node: 3000 + i,
        list_node: listNode,
      });
      data.bindings.push({
        paragraph: i + 1,
        tableNode,
        listNode,
        rows: 1,
        columns: 1,
        row: 0,
        column: 0,
        rowSpan: 1,
        columnSpan: 1,
      });
    }
  }
  const m = await read('hwpx', sdk);
  assert.equal(paragraphs(m).length, n);
  assert.equal(new Set(paragraphs(m).map((p) => p.id)).size, n);
  assert.equal(m.coverage.placed + m.coverage.unplaced, n);
  assert.ok(m.coverage.unplaced > 0);
  assert.ok(m.unplaced.some((u) => u.diagnostic.code === 'ModelDepthLimitExceeded'));
  assert.doesNotThrow(() => JSON.stringify(m));
});

test('model HX raw editing getter is never called', async () => {
  const { sdk } = hx();
  sdk.anchorText = () => {
    throw Error('MustNotCall');
  };
  const m = await read('hwpx', sdk);
  assert.equal(paragraphs(m).length, 4);
  assert.ok(paragraphs(m).every((p) => !Object.hasOwn(p, 'text')));
  assert.ok(!m.warnings.some((w) => w.message.includes('MustNotCall')));
});
test('model unavailable table inventory is explicit incomplete observation', async () => {
  const { sdk } = hx();
  delete sdk.tableBindings;
  delete sdk.tableBorderSources;
  const m = await read('hwpx', sdk);
  assert.equal(m.coverage.inventoryComplete, false);
  assert.ok(m.coverage.unknownBlocks > 0);
  assert.ok(m.sections[0].body.some((b) => b.kind === 'table-inventory'));
});
test('model malformed HX snapshot preserves observed flow identities with unknown display', async () => {
  const { sdk } = hx();
  sdk.paragraphTextSnapshot = () => null;
  const m = await read('hwpx', sdk);
  assert.equal(m.coverage.paragraphTotal, null);
  assert.equal(m.coverage.inventoryComplete, false);
  assert.equal(paragraphs(m).length, 4);
  assert.ok(paragraphs(m).every((p) => p.displayText === null));
});

// Adversarial round 1: canonical source identities must not be first-wins.
test('adversarial r1 conflicting original cell nodes reject instead of retaining first owner', async () => {
  const { data, sdk } = hx();
  data.inventory.cells.push({ table_node: 10, list_node: 12, cell_node: 99 });
  await assert.rejects(read('hwpx', sdk), /ConflictingCellSourceIdentity/);
});
test('adversarial r1 one original list node cannot belong to two tables', async () => {
  const { data, sdk } = hx();
  data.inventory.cells.push({ table_node: 90, list_node: 12, cell_node: 11 });
  await assert.rejects(read('hwpx', sdk), /ConflictingCellSourceIdentity/);
});
test('adversarial r1 duplicate paragraph source node cannot grant two identities', async () => {
  const { data, sdk } = hx();
  data.flows[1].source_node = data.flows[0].source_node;
  await assert.rejects(read('hwpx', sdk), /DuplicateParagraphSourceIdentity/);
});

test('adversarial r1 duplicate H5 preview section cannot silently replace display text', async () => {
  const { sdk } = h5();
  const first = sdk.currentTextPreview().sections[0];
  sdk.currentTextPreview = () => ({
    sections: [
      first,
      { ...first, paragraphs: [{ ...first.paragraphs[0], text: 'forged-last-wins' }] },
    ],
  });
  const m = await read('hwp5', sdk);
  assert.equal(paragraphs(m)[0].displayText, null);
  assert.ok(m.warnings.some((w) => w.code === 'AmbiguousSourceIdentity'));
  assert.equal(JSON.stringify(m).includes('forged-last-wins'), false);
});
test('adversarial r1 H5 count unavailable preserves already observed flow paragraph', async () => {
  const { sdk } = h5();
  sdk.paragraphCount = () => {
    throw Error('CountUnavailable');
  };
  const m = await read('hwp5', sdk);
  assert.equal(m.coverage.paragraphTotal, null);
  assert.equal(m.coverage.inventoryComplete, false);
  assert.equal(paragraphs(m).length, 1);
  assert.equal(paragraphs(m)[0].id, 's0:p0');
  assert.equal(paragraphs(m)[0].displayText, 'readable');
});
test('adversarial r1 late invalid cell geometry rejects without mutating observations', async () => {
  const { data, sdk } = hx();
  data.bindings.push({ ...data.bindings[0], paragraph: 77, rowSpan: 0 });
  const before = JSON.stringify(data);
  await assert.rejects(read('hwpx', sdk), /InvalidCellGeometry/);
  assert.equal(JSON.stringify(data), before);
});
test('adversarial r1 header footer same owner collision is refused', async () => {
  const { data, sdk } = hx();
  data.flows[3].page_area = { ...data.flows[2].page_area };
  await assert.rejects(read('hwpx', sdk), /AmbiguousPageAreaDefinition/);
});
test('adversarial r1 reverse ordered sparse fanout retains exactonce without dense geometry', async () => {
  const { data, sdk } = hx();
  const n = 1024;
  data.paragraphs = [{ paragraph: 1, text: 'root' }];
  data.flows = [{ paragraph: 1, source_node: 1, host: 'body', top_level: true }];
  data.bindings = [];
  data.placements = [];
  data.inventory.cells = [];
  data.areas = [];
  data.sites = [];
  data.owners = [];
  for (let i = n; i >= 1; i--) {
    const p = i + 1,
      t = 10000 + i,
      l = 20000 + i;
    data.paragraphs.push({ paragraph: p, text: `cell${i}` });
    data.flows.push({ paragraph: p, source_node: 30000 + i, host: 'other', top_level: false });
    data.bindings.push({
      paragraph: p,
      tableNode: t,
      listNode: l,
      rows: 1000000000,
      columns: 1000000000,
      row: i,
      column: i,
      rowSpan: 2,
      columnSpan: 3,
    });
    data.placements.push({
      tableNode: t,
      paragraph: 1,
      parentTableNode: null,
      parentListNode: null,
    });
    data.inventory.cells.push({ table_node: t, list_node: l, cell_node: 40000 + i });
  }
  const m = await read('hwpx', sdk);
  assert.equal(m.coverage.placed, n + 1);
  assert.equal(m.coverage.unplaced, 0);
  assert.equal(new Set(paragraphs(m).map((p) => p.id)).size, n + 1);
  const tables = m.sections[0].body.filter((b) => b.type === 'table');
  assert.equal(tables.length, n);
  assert.ok(tables.every((t) => t.cells.length === 1 && t.cells[0].rowSpan === 2));
  assert.ok(JSON.stringify(m).length < 2000000);
});

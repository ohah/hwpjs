import test from 'node:test';
import assert from 'node:assert/strict';
import { composePageAreaBody } from '../../web/preview/page-area-body-composition.mjs';
import { partitionPageAreaOwnership } from '../../web/preview/page-area-ownership.mjs';
import { layoutPageAreaContent } from '../../web/preview/page-area-content-layout.mjs';

function fixture() {
  const area = {
    owner_node: 10,
    list_node: 11,
    apply: 'both',
    width: 7500,
    height: 1500,
    vertical_alignment: 'top',
  };
  const numbering = {
    supported: true,
    start_page: 3,
    hide_first_header: false,
    hide_first_footer: false,
  };
  const content = {
    limited: false,
    paragraphs: [
      { section: 0, paragraph: 0, text: 'body' },
      { section: 0, paragraph: 1, text: 'header' },
    ],
    paragraphFlows: [
      { section: 0, paragraph: 0, host: 'body', top_level: true },
      {
        section: 0,
        paragraph: 1,
        host: 'header',
        top_level: false,
        page_area: area,
        page_number_source: numbering,
      },
    ],
    tables: [{ section: 0, tableNode: 90, hostParagraph: 0 }],
    pageSettings: [{ section_ordinal: 0, margin: { top: 750, bottom: 1500, header: 1500 } }],
  };
  const pages = [0, 1].map((ordinal) => ({
    ordinal,
    section: 0,
    paper: { x: 0, y: ordinal * 260, width: 140, height: 240 },
    page: { x: 20, y: 40 + ordinal * 260, width: 100, height: 160 },
  }));
  const result = {
    state: 'paginated',
    limited: false,
    pages,
    height: 500,
    rows: [
      { kind: 'text', section: 0, paragraph: 0, text: 'body', x: 20, y: 40, width: 40, height: 10 },
    ],
    boxes: [{ tableNode: 90 }],
    flowPictures: [],
    tableAnchors: [],
  };
  return { content, result };
}
const measure = () => ({ width: 5, height: 10 });

test('compatibility entrypoint delegates identical results and bounds to the composition owner', () => {
  const { content, result } = fixture(),
    before = structuredClone(content);
  const body = () => result;
  assert.deepEqual(
    layoutPageAreaContent(content, measure, 100, body, [8, 9]),
    composePageAreaBody(content, measure, 100, body, { pageNumbers: [8, 9] }),
  );
  assert.equal(
    layoutPageAreaContent(content, measure, 0, body).error,
    'InvalidPageAreaComposition',
  );
  assert.deepEqual(content, before);
});

test('page areas compose after body objects and preserve callback options and source identities', () => {
  const { content, result } = fixture(),
    before = structuredClone(content);
  const rowY = () => 0,
    minimumRowPage = () => 0;
  let calls = 0;
  const placed = composePageAreaBody(
    content,
    measure,
    100,
    (body, m, budget, options) => {
      calls++;
      assert.equal(m, measure);
      assert.equal(budget, 100);
      assert.deepEqual(
        body.paragraphs.map((p) => p.paragraph),
        [0],
      );
      assert.deepEqual(
        body.paragraphFlows.map((p) => p.host),
        ['body'],
      );
      assert.equal(body.tables[0], content.tables[0]);
      assert.equal(options.rowY, rowY);
      assert.equal(options.minimumRowPage, minimumRowPage);
      return result;
    },
    { rowY, minimumRowPage },
  );
  assert.equal(calls, 1);
  assert.equal(placed.state, 'paginated', placed.error);
  assert.deepEqual(
    placed.pages.map((page) => page.number),
    [3, 4],
  );
  assert.deepEqual(
    placed.rows.filter((row) => row.pageArea).map((row) => [row.paragraph, row.pageOrdinal]),
    [
      [1, 0],
      [1, 1],
    ],
  );
  assert.equal(placed.boxes, result.boxes);
  assert.deepEqual(content, before);
});

test('page area composition propagates body failure without hiding source objects', () => {
  const { content, result } = fixture();
  assert.equal(
    composePageAreaBody(content, measure, 100, () => ({
      state: 'unavailable',
      error: 'BodyTableFailure',
    })).error,
    'BodyTableFailure',
  );
  content.pictures = [{ section: 0, pictureNode: 99, paragraph: 1 }];
  assert.equal(
    composePageAreaBody(content, measure, 100, (body) => {
      assert.deepEqual(body.pictures, []);
      return result;
    }).error,
    'UnsupportedPageAreaObjects',
  );
});

test('page area composition requires exact page numbering and bounded complete instances', () => {
  const { content, result } = fixture();
  const run = (options) => composePageAreaBody(content, measure, 100, () => result, options);
  assert.equal(run({ pageNumbers: [8] }).error, 'MissingEffectivePageNumber');
  assert.equal(run({ pageNumbers: [0, 9] }).error, 'MissingEffectivePageNumber');
  assert.deepEqual(
    run({ pageNumbers: [8, 9] }).pages.map((page) => page.number),
    [8, 9],
  );
  result.pages[1].ordinal = 5;
  assert.equal(run().error, 'AmbiguousPageAreaInstance');
  assert.equal(
    composePageAreaBody(content, measure, 0, () => result).error,
    'InvalidPageAreaComposition',
  );
  assert.equal(
    composePageAreaBody(content, measure, result.rows.length, () => result).error,
    'PageAreaOverflow',
  );
  assert.equal(
    composePageAreaBody(content, measure, 100, () => ({ ...result, limited: true })).error,
    'PageAreaOverflow',
  );
  assert.equal(
    composePageAreaBody(content, measure, 100, () => ({ ...result, pages: [] })).error,
    'InvalidPageAreaComposition',
  );
});

test('page area ownership follows table cells and rejects malformed and cyclic links', () => {
  const { content } = fixture();
  content.tables[0].hostParagraph = 1;
  content.tables[0].cells = [{ listNode: 20, paragraphs: [2] }];
  content.paragraphs.push({
    section: 0,
    paragraph: 2,
    text: 'cell',
    tableCell: { tableNode: 90, listNode: 20 },
  });
  content.paragraphFlows.push({ section: 0, paragraph: 2, host: 'other' });
  const result = partitionPageAreaOwnership(content);
  assert.equal(result.state, 'partitioned', result.error);
  assert.deepEqual(result.body.tables, []);
  assert.deepEqual(
    result.areas[0].paragraphs.map((p) => p.paragraph),
    [1, 2],
  );
  for (const malformed of [null, { section: '0', paragraph: 2 }, { section: 0, paragraph: -1 }]) {
    assert.equal(
      partitionPageAreaOwnership({ ...content, paragraphs: [malformed] }).error,
      'InvalidPageAreaOwnership',
    );
  }
  content.tables[0].hostParagraph = 2;
  assert.equal(partitionPageAreaOwnership(content).error, 'CyclicPageAreaOwnership');
});

import type { DocumentFormat } from '../types/native-document.ts';
import type {
  DocumentView,
  DocumentBlock,
  DocumentCoverage,
  Diagnostic,
  SourceLocation,
  PageArea,
  PageAreaDefinition,
  DocumentSection,
  TableBlock,
  TableCell,
  ParagraphBlock,
  ImageBlock,
  ImageSource,
  UnknownBlock,
  DocumentObservations,
  Observation,
  ModelLimits,
  TableBinding,
  TablePlacement,
  TableLayout,
  CellLayout,
  PageAreaObservation,
} from '../types/document-view.ts';
interface GraphBase {
  id: string;
  parent?: string | null;
  reason?: string;
  native?: number | null;
}
type GraphRoot = GraphBase & { kind: 'root'; root: true; target: DocumentBlock[]; block?: never };
type AreaNode = GraphBase & {
  kind: 'area';
  root: true;
  target: DocumentBlock[];
  block: PageAreaDefinition & { observedParagraphs: number };
};
type TableNode = GraphBase & {
  kind: 'table';
  root?: false;
  block: TableBlock & { source: SourceLocation & { tableNode: number } };
};
type CellNode = GraphBase & {
  kind: 'cell';
  root?: false;
  target: DocumentBlock[];
  block: TableCell & {
    source: SourceLocation & { tableNode: number; listNode: number; cellNode?: number };
  };
};
type ParagraphNode = GraphBase & { kind: 'paragraph'; root?: false; block: ParagraphBlock };
type ObjectNode = GraphBase & {
  kind: 'image' | 'object';
  root?: false;
  block: ImageBlock | UnknownBlock;
};
type GraphNode = GraphRoot | AreaNode | TableNode | CellNode | ParagraphNode | ObjectNode;
interface Resolution {
  placed: boolean;
  depth: number;
  reason?: string;
}
const isPageArea = (value: unknown): value is 'header' | 'footer' =>
  value === 'header' || value === 'footer';
const isApply = (value: unknown): value is 'both' | 'odd' | 'even' =>
  value === 'both' || value === 'odd' || value === 'even';
import { LIMITS, uint, diagnostic, unique } from './common.ts';
import { buildObjectReference, canonicalImageId } from '../object-reference.ts';
const cellKey = (s: number, t: number | null | undefined, l: number | null | undefined): string =>
  `s${s}:t${t}:c${l}`;
const paragraphId = (s: number, p: number): string => `s${s}:p${p}`;
const list = <T>(result: Observation<unknown> | null | undefined): T[] =>
  result?.ok && Array.isArray(result.value) ? (result.value as T[]) : [];
const known = (result: Observation<unknown> | null | undefined): boolean => result?.ok === true;

/** 소유자가 분리된 읽기 투영이며 부모 식별자는 실제 관측에서만 가져옵니다. */
export function project(
  {
    format,
    sourceSha256,
    observations,
  }: { format: DocumentFormat; sourceSha256: string; observations: DocumentObservations },
  limits: ModelLimits = LIMITS,
): DocumentView {
  const warnings = observations.warnings.map((w) => ({
    ...w,
    ...(w.source ? { source: { ...w.source } } : {}),
  }));
  const model: DocumentView & { coverage: Required<DocumentCoverage> } = {
    version: 1,
    format,
    sourceSha256,
    coordinates: {
      sectionBase: 0,
      paragraphBase: format === 'hwp5' ? 0 : 1,
      paragraphScope: format === 'hwp5' ? 'section' : 'document',
      textUnit: 'native-utf16',
    },
    sections: [],
    unplaced: [],
    warnings,
    coverage: {
      paragraphTotal: 0,
      observedParagraphs: 0,
      placed: 0,
      unplaced: 0,
      unknownBlocks: 0,
      unreadableSections: 0,
      pageAreasKnown: true,
      imagesKnown: true,
      pageAreaInheritanceKnown: false,
      tablesWithCompleteCellInventory: 0,
      inventoryComplete: true,
      objectsKnown: true,
      objectInventoryComplete: false,
      objectInventoryScope: 'supported-native-inventories-only',
      objectTotal: 0,
      objectsPlaced: 0,
      objectsUnplaced: 0,
    },
  };
  const nodes = new Map<string, GraphNode>(),
    children = new Map<string, GraphNode[]>(),
    paragraphs = new Map<string, ParagraphNode>();
  let blockCount = 0,
    textUnits = 0;
  const warn = (code: string, message: string, source?: Diagnostic['source']) =>
    warnings.push(diagnostic(code, message, source));
  const add = <T extends GraphNode>(node: T): T => {
    if (nodes.has(node.id)) throw new Error('DuplicateModelIdentity');
    if (++blockCount > limits.maxBlocks) throw new RangeError('ModelBlockLimitExceeded');
    nodes.set(node.id, node);
    return node;
  };
  const unknown = (
    id: string,
    kind: string,
    code: string,
    source?: SourceLocation,
  ): UnknownBlock => ({
    id,
    type: 'unknown',
    kind,
    diagnostic: diagnostic(code, code, source),
    ...(source ? { source: { ...source } } : {}),
    editability: 'unknown',
  });
  const collection = (): PageArea => ({
    declarations: 'known',
    definitions: [],
    inheritance: { state: 'unresolved' },
  });

  for (const observation of observations.sections) {
    const s = observation.section,
      source = { section: s },
      section: DocumentSection = {
        id: `s${s}`,
        source,
        header: collection(),
        body: [],
        footer: collection(),
      };
    model.sections.push(section);
    const body = add({ id: `@s${s}:body`, root: true, target: section.body, kind: 'root' });
    const byOrdinal = new Map<number, ParagraphNode>(),
      defs = new Map<string, AreaNode>(),
      byTable = new Map<number, TableNode>(),
      cells = new Map<string, CellNode>(),
      cellOwners = new Map<number, number>(),
      paragraphSources = new Set<number>();
    const placementMap = unique(
      list<TablePlacement>(observation.placements),
      (r) => r.tableNode,
      warnings,
      'table placement',
    );
    const bindings = list<TableBinding>(observation.bindings),
      paragraphBindings = unique(bindings, (r) => r.paragraph, warnings, 'paragraph cell binding');
    if (!observation.flowsKnown)
      warn('ParagraphOwnershipUnavailable', 'Native paragraph ownership unavailable', source);
    if (observation.paragraphTotal === null) {
      model.coverage.paragraphTotal = null;
      model.coverage.inventoryComplete = false;
      model.coverage.unreadableSections++;
      section.body.push(unknown(`s${s}:unreadable`, 'section', 'SectionTextUnavailable', source));
      model.coverage.unknownBlocks++;
    } else if (model.coverage.paragraphTotal !== null)
      model.coverage.paragraphTotal += observation.paragraphTotal;

    const structuralReads = [
      observation.bindings,
      observation.placements,
      observation.tableInventory,
      ...(format === 'hwp5' ? [observation.cellInventory] : []),
    ];
    if (structuralReads.some((result) => !result?.ok)) {
      model.coverage.inventoryComplete = false;
      section.body.push(
        unknown(`s${s}:inventory`, 'table-inventory', 'TableInventoryUnavailable', source),
      );
      model.coverage.unknownBlocks++;
      warn('TableInventoryUnavailable', 'Table ownership or cell inventory unavailable', source);
    }
    if (!observation.flowsKnown || !observation.areas?.ok || !observation.picturesKnown)
      model.coverage.inventoryComplete = false;

    function definition(
      kind: 'header' | 'footer',
      owner: number,
      listNode: number,
      apply: PageAreaDefinition['apply'],
      declaredParagraphs: number | null | undefined,
      declaration?: { declarationParagraph?: number; declarationUnit?: number },
    ): AreaNode {
      if (!uint(owner) || !uint(listNode)) throw new Error('InvalidPageAreaIdentity');
      const key = `${owner}:${listNode}`;
      const existing = defs.get(key);
      if (existing) {
        if (existing.block.kind !== kind || existing.block.apply !== apply)
          throw new Error('AmbiguousPageAreaDefinition');
        return existing;
      }
      const block: AreaNode['block'] = {
        id: `s${s}:${kind}:n${owner}:l${listNode}`,
        kind,
        source: { section: s, ownerNode: owner, listNode, ...(declaration ? declaration : {}) },
        apply,
        range: { state: 'unresolved' },
        blocks: [],
        observedParagraphs: 0,
        ...(uint(declaredParagraphs) ? { declaredParagraphs } : {}),
      };
      section[kind].definitions.push(block);
      const node = add({ id: block.id, root: true, target: block.blocks, block, kind: 'area' });
      defs.set(key, node);
      return node;
    }
    if (!known(observation.areas)) {
      section.header.declarations = section.footer.declarations = 'unavailable';
      model.coverage.pageAreasKnown = false;
    } else if (format === 'hwp5') {
      for (const area of list<PageAreaObservation>(observation.areas)) {
        if (!isPageArea(area.kind) || !uint(area.owner_node) || !uint(area.list_node))
          throw new Error('InvalidPageAreaObservation');
        const apply = uint(area.control_attributes)
          ? ((['both', 'even', 'odd'] as const)[area.control_attributes & 3] ?? null)
          : null;
        definition(area.kind, area.owner_node, area.list_node, apply, area.paragraph_count);
      }
    } else {
      const declarations = unique(
        list<PageAreaObservation>(observation.areas),
        (d) => d.sourceElement,
        warnings,
        'page area declaration',
      );
      const represented = new Set();
      for (const p of observation.paragraphs) {
        const flow = p.flow,
          area = flow?.page_area;
        if (!isPageArea(flow?.host) || !area) continue;
        const declaration = declarations.get(area.owner_node);
        if (!declaration) {
          section.header.declarations = section.footer.declarations = 'unavailable';
          model.coverage.pageAreasKnown = false;
          warn('PageAreaDeclarationUnverified', 'Owner has no unique declaration', source);
          continue;
        }
        represented.add(area.owner_node);
        definition(
          flow.host,
          area.owner_node,
          area.list_node,
          isApply(area.apply) ? area.apply : null,
          null,
          { declarationParagraph: declaration.paragraph, declarationUnit: declaration.unit },
        );
      }
      if (represented.size !== declarations.size) {
        section.header.declarations = section.footer.declarations = 'unavailable';
        model.coverage.pageAreasKnown = false;
        warn(
          'UnclassifiedPageAreaDeclaration',
          'A declaration has no verified header/footer paragraph owner',
          source,
        );
      }
    }

    function table(
      tableNode: number,
      rows: number | null = null,
      columns: number | null = null,
    ): TableNode {
      if (!uint(tableNode)) throw new Error('InvalidTableIdentity');
      const previous = byTable.get(tableNode);
      if (previous) return previous;
      const block: TableNode['block'] = {
        id: `s${s}:t${tableNode}`,
        type: 'table',
        reference: buildObjectReference({
          sourceSha256,
          format,
          section: s,
          kind: 'table',
          node: tableNode,
        }),
        source: { section: s, tableNode },
        rows: uint(rows) ? rows : null,
        columns: uint(columns) ? columns : null,
        cells: [],
      };
      const node: TableNode = add({
        id: block.id,
        kind: 'table',
        block,
        parent: null,
        reason: 'TableOwnerUnverified',
        native: tableNode,
      });
      byTable.set(tableNode, node);
      model.coverage.objectTotal++;
      return node;
    }
    function cell(tableNode: number, listNode: number, cellNode?: number): CellNode {
      if (!uint(listNode)) throw new Error('InvalidCellIdentity');
      const t = table(tableNode),
        id = cellKey(s, tableNode, listNode);
      const previousOwner = cellOwners.get(listNode);
      if (previousOwner !== undefined && previousOwner !== tableNode)
        throw new Error('ConflictingCellSourceIdentity');
      cellOwners.set(listNode, tableNode);
      if (cells.has(id)) {
        const existing = cells.get(id)!;
        if (uint(cellNode)) {
          if (uint(existing.block.source.cellNode) && existing.block.source.cellNode !== cellNode)
            throw new Error('ConflictingCellSourceIdentity');
          existing.block.source.cellNode = cellNode;
        }
        return existing;
      }
      const block: CellNode['block'] = {
        id,
        source: { section: s, tableNode, listNode, ...(uint(cellNode) ? { cellNode } : {}) },
        row: null,
        column: null,
        rowSpan: null,
        columnSpan: null,
        blocks: [],
        geometryKnown: false,
        contentState: 'not-observed',
      };
      t.block.cells.push(block);
      const node: CellNode = add({ id, kind: 'cell', block, target: block.blocks, parent: t.id });
      cells.set(id, node);
      return node;
    }
    if (format === 'hwp5') {
      for (const row of list<TableLayout>(observation.tableInventory))
        table(row.table_record_node, row.rows, row.columns);
      for (const row of list<CellLayout>(observation.cellInventory))
        cell(row.table_record_node, row.list_node);
    } else {
      const inventoryValue = observation.tableInventory.ok
        ? observation.tableInventory.value
        : null;
      const inventory =
        inventoryValue && !Array.isArray(inventoryValue) ? inventoryValue.cells : null;
      if (Array.isArray(inventory))
        for (const row of inventory) cell(row.table_node, row.list_node, row.cell_node);
      else warn('CellInventoryUnavailable', 'Native original-cell inventory unavailable', source);
    }
    for (const binding of bindings) {
      if (!uint(binding.rows) || !binding.rows || !uint(binding.columns) || !binding.columns)
        throw new Error('InvalidTableGeometry');
      const t = table(binding.tableNode, binding.rows, binding.columns),
        c = cell(binding.tableNode, binding.listNode);
      if (t.block.rows === null) t.block.rows = binding.rows;
      if (t.block.columns === null) t.block.columns = binding.columns;
      if (t.block.rows !== binding.rows || t.block.columns !== binding.columns)
        throw new Error('ConflictingTableGeometry');
      const names = ['row', 'column', 'rowSpan', 'columnSpan'] as const;
      if (
        !names.every((n) => uint(binding[n])) ||
        !binding.rowSpan ||
        !binding.columnSpan ||
        binding.row + binding.rowSpan > binding.rows ||
        binding.column + binding.columnSpan > binding.columns
      )
        throw new Error('InvalidCellGeometry');
      if (c.block.geometryKnown && names.some((n) => c.block[n] !== binding[n]))
        throw new Error('ConflictingCellGeometry');
      for (const n of names) c.block[n] = binding[n];
      c.block.geometryKnown = true;
    }

    for (const p of observation.paragraphs) {
      if (!uint(p.paragraph) || (format === 'hwpx' && !p.paragraph))
        throw new Error('InvalidNativeParagraphOrdinal');
      const id = paragraphId(s, p.paragraph),
        pSource = { section: s, paragraph: p.paragraph, ...(uint(p.node) ? { node: p.node } : {}) };
      if (paragraphs.has(id)) throw new Error('DuplicateParagraphIdentity');
      if (p.identityKnown && uint(p.node)) {
        if (paragraphSources.has(p.node)) throw new Error('DuplicateParagraphSourceIdentity');
        paragraphSources.add(p.node);
      }
      const displayText = typeof p.displayText === 'string' ? p.displayText : null;
      if (displayText !== null && !displayText.isWellFormed())
        throw new Error('InvalidDocumentText');
      textUnits += displayText?.length ?? 0;
      if (textUnits > limits.maxTextUnits) throw new RangeError('ModelTextLimitExceeded');
      const block: ParagraphBlock = {
        id,
        type: 'paragraph',
        displayText,
        source: pSource,
        editability: p.identityKnown ? 'range-check-required' : 'unknown',
        ...(p.identityKnown ? {} : { reason: 'SourceIdentityUnverified' }),
      };
      if (displayText === null) {
        warn('DisplayTextUnavailable', 'Known display text unavailable', pSource);
        model.coverage.unknownBlocks++;
      }
      const node: ParagraphNode = add({
        id,
        kind: 'paragraph',
        block,
        parent: null,
        reason: 'ParagraphOwnerUnverified',
        native: p.node,
      });
      paragraphs.set(id, node);
      byOrdinal.set(p.paragraph, node);
      model.coverage.observedParagraphs++;
      if (!p.identityKnown) continue;
      const binding = paragraphBindings.get(p.paragraph);
      if (binding) {
        const c = cells.get(cellKey(s, binding.tableNode, binding.listNode));
        if (c) {
          node.parent = c.id;
          c.block.contentState = 'observed';
        }
      } else if (paragraphBindings.has(p.paragraph)) node.reason = 'AmbiguousCellOwner';
      else if (p.flow?.host === 'body' && p.flow.top_level === true) node.parent = body.id;
      else if (isPageArea(p.flow?.host)) {
        const area =
          format === 'hwp5'
            ? { owner_node: p.flow.parent_node, list_node: p.flow.list_node }
            : p.flow.page_area;
        const def = area && defs.get(`${area.owner_node}:${area.list_node}`);
        if (def && def.block.kind === p.flow.host) {
          node.parent = def.id;
          def.block.observedParagraphs++;
        } else {
          section[p.flow.host].declarations = 'unavailable';
          model.coverage.pageAreasKnown = false;
          node.reason = 'PageAreaOwnerUnverified';
        }
      }
    }
    for (const [tableNode, t] of byTable) {
      const placement = placementMap.get(tableNode),
        host = placement && byOrdinal.get(placement.paragraph);
      if (!host) continue;
      if (placement.parentTableNode !== null && placement.parentTableNode !== undefined) {
        if (host.parent !== cellKey(s, placement.parentTableNode, placement.parentListNode)) {
          t.reason = 'NestedTableOwnerMismatch';
          continue;
        }
      }
      t.parent = host.id;
      delete t.reason;
    }
    const geometryCount = new Map();
    for (const c of cells.values()) {
      if (!c.block.geometryKnown || c.block.contentState !== 'observed') {
        const code = !c.block.geometryKnown ? 'CellGeometryUnavailable' : 'CellContentNotObserved';
        c.block.blocks.push(unknown(`${c.id}:unknown`, 'cell', code, c.block.source));
        model.coverage.unknownBlocks++;
        warn(code, code, c.block.source);
      } else
        geometryCount.set(
          c.block.source.tableNode,
          (geometryCount.get(c.block.source.tableNode) ?? 0) + 1,
        );
    }
    for (const [n, t] of byTable)
      if (
        t.block.cells.length > 0 &&
        geometryCount.get(n) === t.block.cells.length &&
        known(observation.tableInventory) &&
        (format !== 'hwp5' || known(observation.cellInventory))
      )
        model.coverage.tablesWithCompleteCellInventory++;
    for (const def of defs.values())
      if (
        uint(def.block.declaredParagraphs) &&
        def.block.observedParagraphs !== def.block.declaredParagraphs
      )
        warn(
          'PageAreaParagraphCountMismatch',
          'Native definition count differs from observed direct paragraph owners',
          def.block.source,
        );
    if (!observation.picturesKnown) model.coverage.imagesKnown = false;
    for (const image of observation.pictures) {
      if (!uint(image.pictureNode)) throw new Error('InvalidPictureIdentity');
      const id = `s${s}:i${image.pictureNode}`;
      const sourceInfo: ImageSource = {};
      for (const name of [
        'section',
        'pictureNode',
        'recordNode',
        'componentNode',
        'ownerNode',
        'resourceId',
      ] as const)
        if (uint(image.sourceInfo?.[name])) sourceInfo[name] = image.sourceInfo[name];
      const block: ImageBlock = {
        id,
        type: 'image',
        reference:
          image.inventorySiteKnown === true
            ? buildObjectReference({
                sourceSha256,
                format,
                section: s,
                kind: 'image',
                node: image.pictureNode,
              })
            : null,
        imageId:
          image.inventorySiteKnown === true
            ? canonicalImageId({ format, section: s, node: image.pictureNode })
            : null,
        label: 'image',
        alt: null,
        altState: 'not-exposed',
        sourceInfo,
        ...(uint(image.width) ? { width: image.width } : {}),
        ...(uint(image.height) ? { height: image.height } : {}),
        sizeUnit: 'hwp-unit',
      };
      add({
        id,
        kind: 'image',
        block,
        parent:
          uint(image.parentParagraph) && byOrdinal.has(image.parentParagraph)
            ? paragraphId(s, image.parentParagraph)
            : null,
        reason: image.reason ?? 'PictureOwnerUnverified',
        native: image.pictureNode,
      });
      model.coverage.objectTotal++;
    }
    if (observation.objectsKnown !== true) {
      model.coverage.objectsKnown = false;
      model.coverage.inventoryComplete = false;
      warn(
        'ObjectInventoryIncomplete',
        observation.objectInventoryScope ?? 'Native object inventory unavailable',
        source,
      );
    }
    const objectNodes = new Map();
    for (const object of observation.objects ?? []) {
      const nodeKnown = object.siteKnown === true && uint(object.node);
      const id = nodeKnown
        ? `s${s}:o${object.node}`
        : `s${s}:object:p${object.paragraph}:u${object.anchorUnit}`;
      const objectSource = {
        section: s,
        ...(uint(object.node) ? { node: object.node } : {}),
        ...(uint(object.paragraph) ? { paragraph: object.paragraph } : {}),
        ...(uint(object.anchorUnit) ? { anchorUnit: object.anchorUnit } : {}),
      };
      const block = {
        ...unknown(id, object.kind, object.reason ?? 'ObjectDetailsDeferred', objectSource),
        reference: nodeKnown
          ? buildObjectReference({
              sourceSha256,
              format,
              section: s,
              kind: object.kind,
              node: object.node,
            })
          : null,
        detailUnavailable: object.detailUnavailable === true,
        ...(uint(object.nativeKind) ? { nativeKind: object.nativeKind } : {}),
        ...(typeof object.subtype === 'string' ? { subtype: object.subtype } : {}),
      };
      const node = add({
        id,
        kind: 'object',
        block,
        parent:
          uint(object.parentParagraph) && byOrdinal.has(object.parentParagraph)
            ? paragraphId(s, object.parentParagraph)
            : null,
        reason: object.reason ?? 'ObjectOwnerUnverified',
      });
      if (nodeKnown) objectNodes.set(object.node, node);
      model.coverage.unknownBlocks++;
      model.coverage.objectTotal++;
    }
    for (const object of observation.objects ?? []) {
      if (!uint(object.node) || !uint(object.parentObjectNode)) continue;
      const node = objectNodes.get(object.node),
        parent = objectNodes.get(object.parentObjectNode);
      if (node && parent && node.parent === null) node.parent = parent.id;
    }
  }

  // 소유자 경로는 한 번만 해석합니다. 메모이제이션으로 순환을 찾고
  // 각 문단에서 전체 조상 경로를 반복해 걷지 않습니다.
  const resolved = new Map<string, Resolution>();
  for (const node of nodes.values()) {
    if (resolved.has(node.id)) continue;
    const path: GraphNode[] = [],
      active = new Set();
    let cursor: GraphNode | null | undefined = node;
    let result: Resolution | undefined;
    while (cursor && !resolved.has(cursor.id) && !active.has(cursor.id)) {
      if (cursor.root) {
        result = { placed: true, depth: 0 };
        break;
      }
      active.add(cursor.id);
      path.push(cursor);
      cursor = cursor.parent ? nodes.get(cursor.parent) : null;
    }
    result ??= (cursor && resolved.get(cursor.id)) || {
      placed: false,
      depth: 0,
      reason: cursor ? 'CyclicOwner' : 'MissingOwner',
    };
    for (let i = path.length - 1; i >= 0; i--) {
      result = { placed: result.placed, depth: result.depth + 1, reason: result.reason };
      if (result.depth > limits.maxDepth)
        result = { ...result, placed: false, reason: 'ModelDepthLimitExceeded' };
      resolved.set(path[i].id, result);
    }
    if (node.root) resolved.set(node.id, { placed: true, depth: 0 });
  }
  for (const node of nodes.values())
    if (!node.root && node.parent && nodes.has(node.parent)) {
      const bucket = children.get(node.parent) ?? [];
      bucket.push(node);
      children.set(node.parent, bucket);
    }
  const emitted = new Set();
  function emit(first: GraphNode, target: DocumentBlock[], placed: boolean): void {
    const stack = [{ node: first, target, depth: 0 }];
    while (stack.length) {
      const { node, target: output, depth } = stack.pop()!;
      if (emitted.has(node.id) || depth > limits.maxDepth) continue;
      emitted.add(node.id);
      let next = output;
      if (node.kind === 'cell' || node.root) next = node.target;
      else output.push(node.block);
      if (node.kind === 'paragraph') model.coverage[placed ? 'placed' : 'unplaced']++;
      if (['image', 'table', 'object'].includes(node.kind))
        model.coverage[placed ? 'objectsPlaced' : 'objectsUnplaced']++;
      const descendants = children.get(node.id) ?? [];
      for (let i = descendants.length - 1; i >= 0; i--)
        stack.push({ node: descendants[i], target: next, depth: depth + 1 });
    }
  }
  for (const node of nodes.values()) if (node.root) emit(node, node.target, true);
  for (const node of nodes.values())
    if (!emitted.has(node.id) && node.kind !== 'cell') {
      const blocks: DocumentBlock[] = [];
      emit(node, blocks, false);
      const code = node.reason ?? resolved.get(node.id)?.reason ?? 'UnplacedSource';
      for (const block of blocks)
        model.unplaced.push({
          block,
          diagnostic: diagnostic(
            code,
            'Source owner could not be placed safely',
            block.type === 'image' ? block.sourceInfo : block.source,
          ),
        });
    }
  if (model.coverage.observedParagraphs !== model.coverage.placed + model.coverage.unplaced)
    throw new Error('ParagraphAccountingMismatch');
  return model;
}

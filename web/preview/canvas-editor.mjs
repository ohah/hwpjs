import {
  matchHistoryModelSelection,
  sameHistoryModelObservation,
} from './history-model-readiness.mjs';
import {
  createHistoryPaintBarrier,
  historySelectionStamp,
  sameHistoryPaintStamp,
} from './history-paint-authority.mjs';
import { LINE_HEIGHT } from './layout.mjs';
import {
  canvasDocumentPoint,
  canvasDocumentBounds,
  canvasCaretScrollLeft,
} from './canvas-pointer-coordinates.mjs';
import { structureErrorMessage } from './structure-error-message.mjs';
import {
  hitText,
  caretGeometry,
  sameParagraph,
  selectableText,
  paragraphTarget,
} from './text-geometry.mjs';
import { textChange, snapUnit, wordBoundary } from './text-input.mjs';
import { navigateText, adjacentParagraphBoundary } from './text-navigation.mjs';
import { sourceTextChange } from './text-offsets.mjs';
import { normalizeParagraphReplacement } from '../../js/paragraph-replacement.mjs';
import { paragraphSelectionEdge, paragraphSelectionRanges } from './paragraph-selection.mjs';
import { paragraphCompositionProjection } from './paragraph-composition.mjs';
import { navigationIntent } from './navigation-intent.mjs';
import { characterFontNameArgs } from '../../js/character-font-name-args.mjs';
import { characterShadeArgs } from '../../js/character-shade-args.mjs';
import { characterEffectArgs, characterEffectMode } from '../../js/character-effect-args.mjs';
import { hwp5CharacterOutlineArg } from '../../js/character-outline-args.mjs';
import { encodeCharacterRanges } from '../../js/character-range-batch.mjs';
import {
  characterTypingState,
  characterTypingSize,
  mergeTypingProperties,
  typingSourceSpan,
} from './character-typing-properties.mjs';
import { projectTypingDraftRanges } from './typing-format-draft.mjs';
import { createHistorySelectionStore } from './history-selection.mjs';
import { hitDrawingBoundary } from './drawing-boundary-hit.mjs';
import { hitTableBoundary } from './table-boundary-geometry.mjs';
import { appendQueuedText } from './queued-input.mjs';
import { createInputIntentQueue } from './input-intent-queue.mjs';
import { paragraphBreakShortcut } from './paragraph-break-shortcut.mjs';
import { paragraphBreakIntent } from './paragraph-split-command.mjs';
import { createSelectionEditPermission } from './selection-edit-permission.mjs';
import { pictureResizeTarget } from './picture-resize-target.mjs';
import { transferSelectedText, pasteClipboardText } from './clipboard-transfer.mjs';
import { installCanvasPointerFrameGate } from './canvas-pointer-frame-gate.mjs';
import { createHistoryInputIntentQueue } from './history-input-intent-queue.mjs';

/** DOM draft and interaction only. Native acknowledgements own committed text. */
export function createCanvasEditor({
  canvas,
  viewport,
  input,
  renderer,
  controls,
  note,
  queryEditRange = null,
  querySplitRange = null,
  platform = null,
  environment = {},
  historyAvailability = null,
  historyModelState = null,
  prepareHistoryModelSelection = null,
  onCommittedSelection = () => {},
  onComposition = () => {},
}) {
  const ownerDocument = environment.ownerDocument ?? input.ownerDocument ?? globalThis.document;
  const realm = ownerDocument?.defaultView ?? globalThis;
  const AbortController = environment.AbortController ?? realm.AbortController;
  platform ??= realm.navigator?.userAgentData?.platform ?? realm.navigator?.platform ?? '';
  const clipboard = environment.clipboard ?? realm.navigator?.clipboard;
  const activeElement =
    environment.activeElement ??
    (() => input.getRootNode?.().activeElement ?? ownerDocument?.activeElement);
  const events = new AbortController(),
    listen = (node, type, fn) => node.addEventListener(type, fn, { signal: events.signal });
  let historyPaintBarrier;
  const hostControls = controls;
  controls = {
    ready: () => !events.signal.aborted && hostControls.ready(),
    busy: () =>
      events.signal.aborted || hostControls.busy() || historyPaintBarrier?.pending === true,
    request: (message) => !events.signal.aborted && hostControls.request(message),
  };
  let target = null,
    committed = '',
    anchor = null,
    focus = null,
    pending = null,
    composing = false,
    drag = null;
  let preferredX = null,
    dragScale = 1;
  let selectionOrigin = 'canvas';
  const viewScale = () => renderer.viewScale?.() ?? 1;
  let pictureResizeAvailable = false;
  let typingFont = null;
  let typingProperties = null;
  let multiComposition = null;
  let draftSelection = null;
  const inputIntents = createInputIntentQueue();
  let queuedInputCapture = null;
  let compositionInputCapture = null;
  let compositionInvalidated = false;
  const clearInputIntents = () => {
    if (composing) compositionInvalidated = true;
    inputIntents.clear();
    queuedInputCapture = compositionInputCapture = null;
  };
  const textPending = () =>
    ['splice', 'splice-font-name', 'splice-character-properties', 'created-cell-text'].includes(
      pending?.kind,
    );
  // Buffer only a draft descended from an active text edit. Native submission
  // still uses textEditable(), including a fresh selection-scoped permission.
  const pendingDraftEditable = () =>
    Boolean(target) &&
    controls.ready() &&
    !historyPending &&
    !multipleParagraphs() &&
    (textPending() || inputIntents.size > 0) &&
    Boolean(renderer.paragraph(target)?.selectable || renderer.paragraph(target)?.editable);
  const historySelections = createHistorySelectionStore();
  let historyRevision = null;
  let historyAvailable = false,
    historyPending = false,
    structureAvailable = false,
    mergeAvailable = false,
    structureTarget = null;
  let deferredComposition = null,
    deferredReplies = [];
  let historyModelWitness = null;
  let historyModelPreparation = null;
  let historyPresentationReport = null;
  const historyModelReady = () => {
    if (
      !historyModelWitness ||
      events.signal.aborted ||
      ownerDocument?.visibilityState === 'hidden' ||
      typeof historyModelState !== 'function'
    )
      return false;
    const state = historyModelState();
    return (
      sameHistoryModelObservation(historyModelWitness, state) &&
      matchHistoryModelSelection(
        state,
        historyRevision,
        { anchor, focus },
        renderer.paragraph(focus),
      )
    );
  };
  const nativeHistoryReady = () =>
    !events.signal.aborted &&
    !deferredComposition &&
    !composing &&
    !pending &&
    !historyPending &&
    !inputIntents.size &&
    (!target || input.value === committed) &&
    hostControls.ready() &&
    !hostControls.busy() &&
    (!historyPaintBarrier?.pending || historyModelReady());
  const historyIntents = createHistoryInputIntentQueue({
    ...(typeof historyModelState === 'function'
      ? {
          nativeReady: nativeHistoryReady,
          readyForKind: (kind) => (kind === 'history' && historyModelReady() ? true : undefined),
        }
      : {}),
    ready: () =>
      !deferredComposition &&
      !composing &&
      !pending &&
      !historyPending &&
      !inputIntents.size &&
      (!target || input.value === committed) &&
      controls.ready() &&
      !controls.busy(),
    history: (kind) => performHistory(kind),
    input: (intent) => applyOrderedInput(intent),
    error: (error) => report(`대기 명령을 적용할 수 없습니다: ${error.message}`),
  });
  const historyInputPending = () =>
    historyIntents.size > 0 || historyPaintBarrier?.pending === true;
  historyPaintBarrier = createHistoryPaintBarrier({
    isPainted(selection) {
      if (historyModelPreparation) return false;
      if (
        events.signal.aborted ||
        ownerDocument?.visibilityState === 'hidden' ||
        !sameHistoryPaintStamp(
          historySelectionStamp(selection),
          historySelectionStamp({ anchor, focus }),
        ) ||
        renderer.isSelectionPainted?.(selection) !== true
      )
        return false;
      // 기존 경로는 ACK에서 geometry를 확인했습니다. 빠른 모델 경로만 최종 frame에서 확인합니다.
      if (!historyModelWitness) return true;
      if (!historyModelReady()) return false;
      const paragraph = renderer.paragraph(selection.focus);
      if (
        !paragraphSelectionRanges([paragraph], selection.anchor, selection.focus, () => 'single', {
          sourcePositions: false,
          includeEmpty: true,
        })
      )
        return false;
      const currentLayout = renderer.layout();
      if (
        !caretGeometry(currentLayout, selection.anchor) ||
        !caretGeometry(currentLayout, selection.focus)
      )
        return false;
      const top = viewport.scrollTop,
        left = viewport.scrollLeft;
      reveal();
      if (top !== viewport.scrollTop || left !== viewport.scrollLeft) {
        paint();
        return false;
      }
      // layout/reveal 중 재진입이나 stamp 변경이 있으면 이전 paint로 다음 입력을 해제하지 않습니다.
      return (
        historyModelReady() &&
        sameHistoryPaintStamp(
          historySelectionStamp(selection),
          historySelectionStamp({ anchor, focus }),
        ) &&
        renderer.isSelectionPainted?.(selection) === true
      );
    },
    release() {
      const completedReport = historyPresentationReport;
      historyPresentationReport = null;
      canvas.dataset.selectionAuthority = 'current';
      input.setAttribute('aria-busy', 'false');
      // 확인한 Canvas 선택을 DOM에도 재확정한 뒤 대기 의도를 실행합니다.
      setSelection(anchor, focus, preferredX, selectionOrigin);
      // 실제 선택 paint를 확인한 이력의 문구만 끝냅니다. 재진입한 다른 알림은 보존합니다.
      if (completedReport !== null && reportedNoteRevision === completedReport)
        report('실행 취소/다시 실행 적용 · 화면 반영 완료');
      historyIntents.wake();
    },
  });
  let splitQueryAvailable = false;
  let paragraphBreakAvailable = false;
  const multipleParagraphs = () => Boolean(anchor && focus && !sameParagraph(anchor, focus));
  const rangePermission = createSelectionEditPermission();
  const splitPermission = createSelectionEditPermission({ kind: 'query-split-range' });
  const intentChange = (intent) => ({
    startUnit: intent.startUnit,
    endUnit: intent.endUnit,
    text: intent.text,
  });
  const draftTextChange = () => {
    if (!pending && !composing && inputIntents.size) {
      try {
        return intentChange(inputIntents.peek(committed));
      } catch {
        return null;
      }
    }
    return textChange(
      committed,
      input.value,
      draftSelection && {
        startUnit: Math.min(draftSelection.anchor.unit, draftSelection.focus.unit),
        endUnit: Math.max(draftSelection.anchor.unit, draftSelection.focus.unit),
        inputType: draftSelection.inputType,
      },
    );
  };
  const wholeTextEditable = () =>
    Boolean(target) && !multipleParagraphs() && renderer.paragraph(target)?.editable === true;
  const editRange = () => {
    if (target?.createdCell) return null;
    if (!target || !anchor || !focus || multipleParagraphs()) return null;
    const change = input.value !== committed ? draftTextChange() : null;
    const range = change ?? {
      startUnit: Math.min(anchor.unit, focus.unit),
      endUnit: Math.max(anchor.unit, focus.unit),
      text: '',
    };
    const source = sourceTextChange(range, renderer.paragraph(target)?.sourceOffsets);
    return {
      section: target.section,
      paragraph: target.paragraph,
      startUnit: source.startUnit,
      endUnit: source.endUnit,
    };
  };
  const textEditable = () =>
    wholeTextEditable() || Boolean(editRange() && rangePermission.allowed(editRange()));
  const multiCompositionAvailable = () => {
    if (!multipleParagraphs() || renderer.paragraphReplacementAvailable?.() !== true) return false;
    const ranges = renderer.replacementRanges?.(anchor, focus);
    return Boolean(
      ranges?.length && ranges.every((range) => renderer.paragraph(range)?.editable === true),
    );
  };
  const updateReadOnly = () => {
    input.readOnly =
      compositionInvalidated ||
      !controls.ready() ||
      (!textEditable() && !multiCompositionAvailable() && !pendingDraftEditable());
    if (
      typeof queryEditRange === 'function' &&
      controls.ready() &&
      !controls.busy() &&
      !pending &&
      !historyPending &&
      target &&
      !wholeTextEditable() &&
      renderer.paragraph(target)?.selectable &&
      editRange()
    ) {
      const request = rangePermission.request(editRange());
      if (request && queryEditRange(request) === false) rangePermission.invalidate();
    }
    if (
      typeof querySplitRange === 'function' &&
      splitQueryAvailable &&
      controls.ready() &&
      !controls.busy() &&
      structureAvailable &&
      !pending &&
      !historyPending &&
      target &&
      !wholeTextEditable() &&
      renderer.paragraph(target)?.selectable &&
      editRange() &&
      input.value === committed
    ) {
      const request = splitPermission.request(editRange());
      if (
        request &&
        querySplitRange({
          ...request,
          anchored: renderer.paragraph(target)?.anchoredSplitAvailable === true,
        }) === false
      )
        splitPermission.invalidate();
    }
  };
  let reportedNote = '';
  let reportedNoteRevision = 0;
  const report = (text) => {
    note.textContent = text;
    reportedNote = text;
    reportedNoteRevision++;
  };
  const compositionProjection = () => {
    if (!multiComposition) return null;
    const start = paragraphSelectionEdge(multiComposition.anchor, multiComposition.focus);
    return paragraphCompositionProjection(renderer.paragraph(start), start, input.value);
  };
  const extendedNavigation = (key, paragraphEdge, extend = true, word = false) => {
    if (
      pending ||
      historyPending ||
      composing ||
      input.value !== committed ||
      !controls.ready() ||
      controls.busy()
    )
      return null;
    const paragraph = renderer.paragraph(focus);
    if (!paragraph) return null;
    // 선택을 접는 좌우 이동은 기존 선택의 끝점에서 멈춘다.
    if (!extend && anchor.unit !== focus.unit && ['ArrowLeft', 'ArrowRight'].includes(key)) {
      return navigateText(renderer.layout(), paragraph.text, anchor, focus, key);
    }
    const acceptRow = (row) =>
      sameParagraph(row, focus) ||
      Boolean(
        renderer.selectionRanges?.(anchor, {
          ...focus,
          section: row.section,
          paragraph: row.paragraph,
          unit: row.startUnit,
        }),
      );
    let next = navigateText(renderer.layout(), paragraph.text, anchor, focus, key, {
      extend: true,
      paragraphEdge,
      crossParagraph: true,
      preferredX,
      word,
      acceptRow,
    });
    if (
      (!paragraphEdge || word) &&
      next?.focus.unit === focus.unit &&
      ['ArrowLeft', 'ArrowRight'].includes(key)
    ) {
      if (!extend && renderer.adjacentParagraph) {
        const point = renderer.adjacentParagraph(focus, key === 'ArrowRight');
        return point ? { anchor: point, focus: point } : null;
      }
      const point = adjacentParagraphBoundary(renderer.layout(), focus, key);
      if (point) next = { anchor, focus: point };
    }
    if (!next) return null;
    if (
      !sameParagraph(next.anchor, next.focus) &&
      !renderer.selectionRanges?.(next.anchor, next.focus)
    )
      return null;
    if (!extend) next = { ...next, anchor: next.focus };
    return next;
  };
  const place = () => {
    const caret = caretGeometry(
      renderer.layout(),
      compositionProjection()?.composition.focus ?? focus,
    );
    if (!caret) return;
    const bounds = canvasDocumentBounds(caret.screenBounds ?? caret, viewScale());
    if (!bounds) return;
    // Keep the real IME target at the painted caret, not far offscreen.
    const left = viewport.scrollLeft ?? 0;
    input.style.left = `${Math.max(left, Math.min(bounds.x, left + viewport.clientWidth - 2))}px`;
    input.style.height = `${bounds.height}px`;
    input.style.top = `${Math.max(viewport.scrollTop, Math.min(bounds.y, viewport.scrollTop + viewport.clientHeight - bounds.height))}px`;
  };
  renderer.onGeometry(() => {
    place();
    historyPaintBarrier.notify();
  });
  if (ownerDocument?.addEventListener)
    listen(ownerDocument, 'visibilitychange', () => {
      if (ownerDocument.visibilityState !== 'hidden') historyPaintBarrier.notify();
    });
  const paint = ({ deferGeometry = false } = {}) => {
    let composition;
    if (multiComposition) composition = compositionProjection()?.composition;
    const change = composing && !multiComposition && draftTextChange();
    if (change)
      composition = {
        anchor: { ...target, unit: change.startUnit },
        focus: { ...target, unit: change.startUnit + change.text.length },
      };
    renderer.select({
      anchor,
      focus,
      active: activeElement() === input || drag !== null,
      composition,
      historyPending,
    });
    canvas.dataset.caret = focus ? `${focus.section}:${focus.paragraph}:${focus.unit}` : '';
    canvas.dataset.selection = anchor && focus ? `${anchor.unit}:${focus.unit}` : '';
    canvas.dataset.composing = String(composing);
    if (!deferGeometry) place();
    onComposition({
      composing,
      pending: Boolean(
        pending || historyPending || historyPaintBarrier.pending || inputIntents.size,
      ),
    });
    if (
      !composing &&
      !pending &&
      !historyPending &&
      !historyPaintBarrier.pending &&
      !inputIntents.size &&
      input.value === committed
    )
      onCommittedSelection(
        anchor && focus ? { anchor: { ...anchor }, focus: { ...focus } } : null,
        { origin: selectionOrigin },
      );
  };
  const sync = () => {
    // 늦은 DOM select/keyup은 이력이 복원 중인 선택의 권위가 아닙니다.
    if (historyPaintBarrier.pending) return;
    if (!target || multipleParagraphs()) return;
    const backward = input.selectionDirection === 'backward';
    const start = snapUnit(input.value, input.selectionStart),
      end = snapUnit(input.value, input.selectionEnd, true);
    const anchorUnit = backward ? end : start,
      focusUnit = backward ? start : end;
    if (anchor?.unit !== anchorUnit || focus?.unit !== focusUnit) preferredX = null;
    if (
      !(
        sameParagraph(anchor, target) &&
        anchor.unit === anchorUnit &&
        anchor.pageArea === target.pageArea &&
        anchor.pageOrdinal === target.pageOrdinal
      )
    )
      anchor = {
        ...target,
        unit: anchorUnit,
        affinity: anchor?.unit === anchorUnit ? anchor.affinity : 'forward',
      };
    if (
      !(
        sameParagraph(focus, target) &&
        focus.unit === focusUnit &&
        focus.pageArea === target.pageArea &&
        focus.pageOrdinal === target.pageOrdinal
      )
    )
      focus = {
        ...target,
        unit: focusUnit,
        affinity: focus?.unit === focusUnit ? focus.affinity : 'forward',
      };
    updateReadOnly();
    paint();
  };
  const setSelection = (a, f, nextX = null, origin = 'canvas') => {
    selectionOrigin = origin;
    if (draftSelection && !sameParagraph(draftSelection.focus, f)) draftSelection = null;
    if (typingFont && !sameParagraph(typingFont, f)) typingFont = null;
    if (typingProperties && !sameParagraph(typingProperties, f)) typingProperties = null;
    preferredX = nextX;
    anchor = a;
    focus = f;
    if (sameParagraph(a, f))
      input.setSelectionRange(
        Math.min(a.unit, f.unit),
        Math.max(a.unit, f.unit),
        a.unit > f.unit ? 'backward' : 'forward',
      );
    updateReadOnly();
    paint();
  };
  const pump = (requestedChange = null) => {
    if (!target || composing || pending || historyPending || !controls.ready() || controls.busy())
      return;
    const sourceRange =
      requestedChange &&
      sourceTextChange(requestedChange, renderer.paragraph(target)?.sourceOffsets);
    const permitted = requestedChange
      ? wholeTextEditable() ||
        rangePermission.allowed({
          ...target,
          startUnit: sourceRange.startUnit,
          endUnit: sourceRange.endUnit,
        })
      : textEditable();
    if (!permitted) return;
    let queued = null,
      change;
    try {
      queued = !requestedChange && inputIntents.size ? inputIntents.peek(committed) : null;
      change = requestedChange ?? (queued ? intentChange(queued) : draftTextChange());
    } catch {
      clearInputIntents();
      input.value = committed;
      renderer.preview(null);
      sync();
      report('대기 입력의 기준 문서를 확인할 수 없어 적용하지 않았습니다.');
      return;
    }
    if (!change) {
      draftSelection = null;
      return;
    }
    preferredX = null;
    const font = change.text && typingFont && sameParagraph(typingFont, target) ? typingFont : null;
    const properties =
      change.text && typingProperties && sameParagraph(typingProperties, target)
        ? { ...typingProperties.properties }
        : null;
    pending = {
      kind: target.createdCell
        ? 'created-cell-text'
        : font
          ? 'splice-font-name'
          : properties
            ? 'splice-character-properties'
            : 'splice',
      start: change.startUnit,
      end: change.endUnit,
      afterText:
        committed.slice(0, change.startUnit) + change.text + committed.slice(change.endUnit),
      beforeSelection: queued?.beforeSelection ??
        draftSelection ?? {
          anchor: { ...target, unit: change.startUnit },
          focus: { ...target, unit: change.endUnit },
        },
    };
    draftSelection = null;
    const command =
      sourceRange ?? sourceTextChange(change, renderer.paragraph(target)?.sourceOffsets);
    const request = target.createdCell
      ? {
          kind: pending.kind,
          origin: 'canvas',
          section: target.section,
          identity: target.createdCell.identity,
          row: target.createdCell.row,
          column: target.createdCell.column,
          text: pending.afterText,
        }
      : {
          kind: pending.kind,
          origin: 'canvas',
          section: target.section,
          paragraph: target.paragraph,
          ...command,
          ...(font ? { language: font.language, name: font.name } : {}),
          ...(properties ? { properties } : {}),
        };
    const reference = renderer.paragraph(target)?.currentReference;
    if (['splice', 'created-cell-text'].includes(pending.kind) && reference)
      request.reference = reference;
    if (!controls.request(request)) pending = null;
    else if (queued) inputIntents.consume(committed);
    input.setAttribute('aria-busy', String(Boolean(pending)));
  };
  const reveal = () => {
    const caret = caretGeometry(renderer.layout(), focus);
    if (!caret || activeElement() !== input) return;
    const bounds = canvasDocumentBounds(caret.screenBounds ?? caret, viewScale());
    if (!bounds) return;
    const left = canvasCaretScrollLeft(bounds.x, viewport.scrollLeft ?? 0, viewport.clientWidth);
    if (left !== null) viewport.scrollLeft = left;
    if (bounds.y < viewport.scrollTop) viewport.scrollTop = bounds.y;
    else if (bounds.y + bounds.height > viewport.scrollTop + viewport.clientHeight)
      viewport.scrollTop = bounds.y + bounds.height - viewport.clientHeight;
    place();
    input.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  const draftPreview = () => {
    const change =
      pending && textPending()
        ? { startUnit: pending.start, endUnit: pending.end }
        : draftTextChange();
    return {
      ...target,
      text: input.value,
      characterRanges: projectTypingDraftRanges(renderer.paragraph(target), input.value, change),
    };
  };
  const preview = () => {
    renderer.preview(draftPreview());
    sync();
    reveal();
  };
  const coordinates = (event) => {
    const box = canvas.getBoundingClientRect();
    return canvasDocumentPoint(
      event,
      box,
      viewport.scrollTop,
      viewScale(),
      viewport.scrollLeft ?? 0,
    );
  };
  installCanvasPointerFrameGate({
    canvas,
    renderer,
    signal: events.signal,
    cancelDrag(pointerId) {
      if (drag !== pointerId) return;
      drag = null;
      if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    },
    onBlocked(event) {
      if (event.type === 'pointerdown')
        report('화면 갱신 중입니다. 갱신된 화면에서 다시 선택하세요.');
    },
  });
  const point = (event, constrained = null) => {
    const { x, y } = coordinates(event);
    const layout = renderer.layout();
    return (
      hitTableBoundary(layout, x, y, (target) => renderer.paragraph(target), constrained) ??
      hitDrawingBoundary(layout, x, y, constrained) ??
      hitText(layout, x, y, constrained)
    );
  };
  listen(canvas, 'pointermove', (event) => {
    if (historyPaintBarrier.pending) return;
    canvas.style.cursor = point(event) ? 'text' : 'default';
    if (drag !== event.pointerId || !target) return;
    if (dragScale !== viewScale()) {
      release(event);
      return;
    }
    const box = viewport.getBoundingClientRect();
    if (event.clientY < box.top || event.clientY > box.bottom)
      viewport.scrollTop += event.clientY < box.top ? -LINE_HEIGHT : LINE_HEIGHT;
    if (Number.isFinite(box.left) && Number.isFinite(box.right)) {
      if (event.clientX < box.left)
        viewport.scrollLeft = Math.max(0, (viewport.scrollLeft ?? 0) - LINE_HEIGHT);
      else if (event.clientX > box.right)
        viewport.scrollLeft = (viewport.scrollLeft ?? 0) + LINE_HEIGHT;
    }
    const free =
      !pending && !composing && !historyPending && input.value === committed ? point(event) : null;
    const ranges = free ? renderer.selectionRanges?.(anchor, free) : null;
    const next = ranges ? free : point(event, target);
    if (next) setSelection(anchor, next);
  });
  listen(canvas, 'pointerdown', (event) => {
    if (event.button !== 0) return;
    if (historyPaintBarrier.pending) {
      event.preventDefault();
      report('이력의 입력 위치를 확인 중입니다. 화면 반영 뒤 다시 선택하세요.');
      return;
    }
    const location = coordinates(event);
    const picture =
      !event.shiftKey && !event.metaKey && !event.ctrlKey
        ? renderer.pictureAtLogicalPoint?.(location.x, location.y, {
            includeBehind: event.altKey === true,
          })
        : null;
    if (picture) {
      event.preventDefault();
      if (historyPending || composing || pending || input.value !== committed || controls.busy()) {
        report('입력 반영 중에는 그림 선택을 변경할 수 없습니다.');
        return;
      }
      if (drag !== null && canvas.hasPointerCapture(drag)) canvas.releasePointerCapture(drag);
      rangePermission.invalidate();
      splitPermission.invalidate();
      typingFont = null;
      typingProperties = null;
      draftSelection = null;
      selectionOrigin = 'canvas';
      anchor = null;
      focus = null;
      target = null;
      drag = null;
      input.blur();
      input.value = '';
      committed = '';
      input.disabled = true;
      renderer.selectPicture?.(picture.picture);
      paint();
      report('그림을 선택했습니다. 지원되는 그림은 크기를 입력해 변경할 수 있습니다.');
      if (!controls.ready() && !controls.busy())
        controls.request({ kind: 'enable', origin: 'canvas' });
      return;
    }
    const next = point(event);
    if (!next) {
      renderer.selectPicture?.(null);
      input.blur();
      return;
    }
    event.preventDefault();
    if (
      historyPending ||
      composing ||
      ((pending || input.value !== committed) && !sameParagraph(next, target))
    ) {
      report('입력 반영 중입니다. 같은 문단에서 이어서 입력하거나 잠시 기다리세요.');
      return;
    }
    renderer.selectPicture?.(null);
    const extended =
      event.shiftKey &&
      anchor &&
      (sameParagraph(anchor, next) || renderer.selectionRanges?.(anchor, next))
        ? anchor
        : next;
    if (!sameParagraph(next, target)) {
      target = { section: next.section, paragraph: next.paragraph };
      committed = renderer.paragraph(next).text;
      input.value = committed;
    }
    target = paragraphTarget(next);
    setSelection(extended, next);
    input.disabled = false;
    updateReadOnly();
    input.focus({ preventScroll: true });
    drag = event.pointerId;
    dragScale = viewScale();
    canvas.setPointerCapture(drag);
    paint();
    if (!controls.ready() && !controls.busy()) {
      report('편집 세션을 여는 중…');
      controls.request({ kind: 'enable', origin: 'canvas' });
    }
  });
  const release = (event) => {
    if (drag === event.pointerId) {
      drag = null;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      paint();
    }
  };
  listen(canvas, 'pointerup', release);
  listen(canvas, 'pointercancel', release);
  listen(canvas, 'lostpointercapture', release);
  const performHistory = (kind) => {
    if (!['undo', 'redo'].includes(kind)) return false;
    if (!historyAvailable) {
      report('이 문서 형식은 실행 취소/다시 실행을 아직 지원하지 않습니다.');
      return false;
    }
    const modelReady = historyModelReady();
    if (
      composing ||
      pending ||
      inputIntents.size ||
      historyPending ||
      (target && input.value !== committed) ||
      !controls.ready() ||
      (controls.busy() && !modelReady)
    ) {
      report('입력 반영이 끝난 뒤 실행 취소/다시 실행하세요.');
      return false;
    }
    historyModelWitness = null;
    historyModelPreparation = null;
    historyPending = true;
    historyPaintBarrier.begin();
    if (historyRevision !== null && anchor && focus)
      historySelections.remember(historyRevision, { anchor, focus });
    const previousNote = reportedNote;
    const pendingNote =
      '실행 취소/다시 실행 반영 중 · 현재 커서는 새 입력 위치가 아닙니다. 입력은 복원 위치 확인 뒤 적용됩니다.';
    canvas.dataset.selectionAuthority = 'history-pending';
    input.setAttribute('aria-busy', 'true');
    report(pendingNote);
    paint({ deferGeometry: modelReady });
    if (!controls.request({ kind, origin: 'canvas' })) {
      historyPending = false;
      historyModelWitness = null;
      historyModelPreparation = null;
      historyPaintBarrier.reset();
      canvas.dataset.selectionAuthority = 'current';
      input.setAttribute('aria-busy', 'false');
      if (reportedNote === pendingNote) report(previousNote);
      updateReadOnly();
      paint();
      return false;
    }
    return true;
  };
  const canRequestHistory = (kind) => {
    if (
      !['undo', 'redo'].includes(kind) ||
      !historyAvailable ||
      !controls.ready() ||
      !historyIntents.hasCapacity
    )
      return false;
    const available = historyAvailability?.();
    if (available?.available === false) return false;
    return (
      composing ||
      Boolean(
        pending ||
        inputIntents.size ||
        historyPending ||
        historyIntents.size ||
        (target && input.value !== committed),
      ) ||
      !available ||
      available[kind === 'undo' ? 'canUndo' : 'canRedo'] === true
    );
  };
  const travel = (kind) => {
    if (!canRequestHistory(kind)) return false;
    return historyIntents.history(kind);
  };
  const applyOrderedInput = ({ inputType, data }) => {
    if (!target || !anchor || !focus) return false;
    if (inputType === 'navigation') {
      const action = JSON.parse(data);
      if (action.key === 'SelectAll') {
        setSelection({ ...target, unit: 0 }, { ...target, unit: committed.length });
        reveal();
        return true;
      }
      const next = extendedNavigation(action.key, action.paragraphEdge, action.extend, action.word);
      if (!next) return true;
      if (!action.extend && !sameParagraph(target, next.focus)) {
        target = paragraphTarget(next.focus);
        committed = renderer.paragraph(target).text;
        input.value = committed;
      }
      setSelection(next.anchor, next.focus, next.preferredX);
      reveal();
      return true;
    }
    if (['insertText', 'insertReplacementText', 'insertFromPaste'].includes(inputType))
      return replaceSelectedText(data);
    if (['insertLineBreak', 'insertParagraph'].includes(inputType)) return split() !== false;
    if (
      [
        'deleteContentBackward',
        'deleteContentForward',
        'deleteWordBackward',
        'deleteWordForward',
        'deleteByCut',
      ].includes(inputType)
    ) {
      if (
        !multipleParagraphs() &&
        input.selectionStart === input.selectionEnd &&
        inputType !== 'deleteByCut'
      ) {
        const unit = input.selectionStart;
        const backward = inputType.endsWith('Backward');
        const next = inputType.startsWith('deleteWord')
          ? wordBoundary(committed, unit, !backward)
          : snapUnit(committed, unit + (backward ? -1 : 1), !backward);
        if (next === unit) {
          mergeBoundary(backward);
          return true;
        }
        setSelection(
          { ...target, unit: Math.min(unit, next) },
          { ...target, unit: Math.max(unit, next) },
        );
      }
      return replaceSelectedText('');
    }
    return false;
  };
  const queueOrderedInput = (inputType, data = '') => {
    if (
      ![
        'insertText',
        'insertReplacementText',
        'insertFromPaste',
        'insertLineBreak',
        'insertParagraph',
        'deleteContentBackward',
        'deleteContentForward',
        'deleteWordBackward',
        'deleteWordForward',
        'deleteByCut',
        'navigation',
      ].includes(inputType)
    )
      return false;
    const accepted = historyIntents.input(inputType, data ?? '');
    if (!accepted) report('대기 입력 한도에 도달했습니다. 명령 반영 후 이어서 입력하세요.');
    return accepted;
  };
  const split = (breakBefore = null) => {
    if (breakBefore !== null && !paragraphBreakAvailable) {
      report('수정키+Enter 명령은 아직 지원하지 않습니다. 문단은 변경하지 않았습니다.');
      return false;
    }
    if (breakBefore !== null && multipleParagraphs()) {
      report('쪽·단 나누기는 한 문단 안에서 선택한 범위에 적용하세요.');
      return false;
    }
    if (target?.createdCell) {
      report('생성 셀의 여러 문단 편집은 아직 지원하지 않습니다.');
      return;
    }
    if (
      !textEditable() &&
      !(splitQueryAvailable && editRange() && splitPermission.allowed(editRange()))
    ) {
      if (splitQueryAvailable && editRange())
        report(
          splitPermission.pending(editRange())
            ? '문단 분할 범위를 확인 중입니다. 확인 후 Enter를 다시 누르세요.'
            : '이 범위는 문단을 분할할 수 없습니다.',
        );
      return false;
    }
    if (!structureAvailable) {
      report('이 문서 형식의 문단 분할은 아직 지원하지 않습니다.');
      return false;
    }
    if (
      !target ||
      composing ||
      pending ||
      historyPending ||
      input.value !== committed ||
      !controls.ready() ||
      controls.busy()
    ) {
      report('입력 반영이 끝난 뒤 문단을 분할하세요.');
      return false;
    }
    const unit = snapUnit(committed, input.selectionStart);
    const end = snapUnit(committed, input.selectionEnd, true);
    const position = sourceTextChange(
      { startUnit: unit, endUnit: end, text: '' },
      renderer.paragraph(target)?.sourceOffsets,
    );
    structureTarget = {
      kind: 'split',
      ...paragraphTarget(target),
      paragraph: target.paragraph + 1,
    };
    historyPending = true;
    input.readOnly = false;
    const anchored =
      breakBefore === null && renderer.paragraph(target)?.anchoredSplitAvailable === true
        ? { anchored: true }
        : {};
    if (
      !controls.request({
        kind: 'split',
        origin: 'canvas',
        ...target,
        ...anchored,
        ...(breakBefore === null ? {} : { breakBefore }),
        atUnit: position.startUnit,
        endUnit: position.endUnit,
      })
    ) {
      structureTarget = null;
      historyPending = false;
      updateReadOnly();
      return false;
    }
    input.setAttribute('aria-busy', 'true');
    return true;
  };
  const selectedCharacterPropertyRanges = () => {
    if (
      !multipleParagraphs() ||
      renderer.characterPropertyRangesAvailable?.() !== true ||
      composing ||
      pending ||
      historyPending ||
      input.value !== committed ||
      !controls.ready() ||
      controls.busy()
    )
      return null;
    return renderer.selectionRanges?.(anchor, focus) ?? null;
  };
  const setCharacterProperties = (properties) => {
    if (multipleParagraphs()) {
      const ranges = selectedCharacterPropertyRanges();
      if (!ranges?.length) return false;
      pending = { kind: 'character-properties-ranges', anchor: { ...anchor }, focus: { ...focus } };
      if (
        !controls.request({
          kind: pending.kind,
          origin: 'canvas',
          ranges,
          properties: { ...properties },
        })
      ) {
        pending = null;
        return false;
      }
      input.setAttribute('aria-busy', 'true');
      return true;
    }
    const range = selectedRange();
    if (!range) return false;
    if (range.startUnit === range.endUnit) {
      if (!canSetTypingProperties()) return false;
      const previous =
        typingProperties && sameParagraph(typingProperties, target)
          ? typingProperties.properties
          : {};
      let merged;
      try {
        merged = mergeTypingProperties(previous, properties);
      } catch {
        return false;
      }
      typingProperties = { ...target, properties: merged };
      report('다음 입력의 글자 속성을 지정했습니다. 입력 전에는 문서가 변경되지 않습니다.');
      return true;
    }
    pending = {
      kind: 'character-properties',
      start: input.selectionStart,
      end: input.selectionEnd,
    };
    if (
      !controls.request({
        kind: 'character-properties',
        origin: 'canvas',
        ...range,
        properties: { ...properties },
      })
    ) {
      pending = null;
      return false;
    }
    input.setAttribute('aria-busy', 'true');
    return true;
  };
  const replaceSelection = (text) => {
    if (
      !target ||
      !anchor ||
      !focus ||
      typeof text !== 'string' ||
      !text.isWellFormed() ||
      composing ||
      pending ||
      historyPending ||
      input.value !== committed ||
      !controls.ready() ||
      controls.busy()
    )
      return false;
    if (target.createdCell) {
      const normalized = normalizeParagraphReplacement(text);
      if (
        !textEditable() ||
        inputIntents.size ||
        (normalized.includes('\n') && renderer.paragraph(target)?.softLineBreakAvailable !== true)
      )
        return false;
      sync();
      const start = snapUnit(committed, input.selectionStart),
        end = snapUnit(committed, input.selectionEnd, true);
      draftSelection = { anchor: { ...anchor }, focus: { ...focus } };
      input.value = committed.slice(0, start) + normalized + committed.slice(end);
      input.setSelectionRange(start + normalized.length, start + normalized.length);
      preview();
      pump({ startUnit: start, endUnit: end, text: normalized });
      return Boolean(pending);
    }
    if (renderer.paragraphReplacementAvailable?.() === false) {
      report('현재 WASM은 문단 교체를 지원하지 않습니다.');
      return false;
    }
    const ranges = renderer.replacementRanges?.(anchor, focus);
    if (!ranges?.length || ranges.some((range) => renderer.paragraph(range)?.editable !== true))
      return false;
    const start = paragraphSelectionEdge(anchor, focus);
    const lines = normalizeParagraphReplacement(text).split('\n');
    const font = typingFont && sameParagraph(typingFont, target) ? typingFont : null;
    const properties =
      typingProperties && sameParagraph(typingProperties, target)
        ? { ...typingProperties.properties }
        : null;
    if (font && renderer.namedFontReplacementAvailable?.() !== true) {
      report('현재 WASM은 지정 글꼴의 문단 교체를 지원하지 않습니다.');
      return false;
    }
    if (
      properties &&
      (font
        ? renderer.namedFontPropertyReplacementAvailable?.()
        : renderer.characterPropertyReplacementAvailable?.()) !== true
    ) {
      report('현재 WASM은 입력 속성을 포함한 문단 교체를 지원하지 않습니다.');
      return false;
    }
    pending = {
      kind: 'replace-paragraph-ranges',
      font,
      properties,
      anchor: { ...anchor },
      focus: { ...focus },
      target: { section: start.section, paragraph: start.paragraph + lines.length - 1 },
      unit: lines.length === 1 ? start.unit + text.length : lines.at(-1).length,
    };
    if (
      !controls.request({
        kind: pending.kind,
        origin: 'canvas',
        ranges,
        text,
        ...(font ? { language: font.language, name: font.name } : {}),
        ...(properties ? { properties: { ...properties } } : {}),
      })
    ) {
      pending = null;
      return false;
    }
    input.setAttribute('aria-busy', 'true');
    return true;
  };
  // 후속 입력은 교체 성공 위치에만 적용하며 native 문서 값을 복제하지 않는다.
  const queueReplacementTyping = (text) => {
    if (pending?.kind !== 'replace-paragraph-ranges') return false;
    return queueTyping(pending, text);
  };
  const queueTyping = (request, text) => {
    const queued = appendQueuedText(request.queuedText ?? '', text);
    if (!queued.accepted) return false;
    if (queued.overflow) {
      report('대기 입력 한도에 도달했습니다. 반영 후 다시 입력하세요.');
      return true;
    }
    request.queuedText = queued.text;
    return true;
  };
  const queueSplitTyping = (text) =>
    structureTarget?.kind === 'split' && historyPending && queueTyping(structureTarget, text);
  const selectedCharacterPropertyState = (property) => {
    if (multipleParagraphs()) {
      if (
        !['bold', 'italic', 'underline', 'strike'].includes(property) ||
        (property === 'strike' && renderer.characterStrikeRangesAvailable?.() !== true) ||
        (property === 'underline' && renderer.characterUnderlineRangesAvailable?.() !== true) ||
        composing ||
        pending ||
        historyPending ||
        input.value !== committed ||
        !controls.ready() ||
        controls.busy()
      )
        return null;
      return renderer.selectionCharacterState?.(anchor, focus, property) ?? null;
    }
    if (!selectedRange()) return null;
    if (property === 'strike' && input.selectionStart === input.selectionEnd) return null;
    if (input.selectionStart === input.selectionEnd) {
      if (!canSetTypingProperties()) return null;
      const properties =
        typingProperties && sameParagraph(typingProperties, target)
          ? typingProperties.properties
          : null;
      return characterTypingState(
        committed,
        input.selectionStart,
        property,
        properties,
        (start, end, key) => renderer.characterState?.(target, start, end, key),
      );
    }
    return (
      renderer.characterState?.(
        target,
        snapUnit(committed, input.selectionStart),
        snapUnit(committed, input.selectionEnd, true),
        property,
      ) ?? null
    );
  };
  const setCharacterUnderline = (underlineKind) => {
    if (multipleParagraphs()) {
      if (
        renderer.characterUnderlineRangesAvailable?.() !== true ||
        composing ||
        pending ||
        historyPending ||
        input.value !== committed ||
        !controls.ready() ||
        controls.busy()
      )
        return false;
      const ranges = renderer.selectionRanges?.(anchor, focus);
      if (!ranges?.length) return false;
      pending = { kind: 'character-underline-ranges', anchor: { ...anchor }, focus: { ...focus } };
      if (!controls.request({ kind: pending.kind, origin: 'canvas', ranges, underlineKind })) {
        pending = null;
        return false;
      }
      input.setAttribute('aria-busy', 'true');
      return true;
    }
    const range = selectedRange();
    if (!range || range.startUnit === range.endUnit) return false;
    pending = { kind: 'character-underline', start: input.selectionStart, end: input.selectionEnd };
    if (
      !controls.request({ kind: 'character-underline', origin: 'canvas', ...range, underlineKind })
    ) {
      pending = null;
      return false;
    }
    input.setAttribute('aria-busy', 'true');
    return true;
  };
  const toggleCharacterProperty = (property) => {
    if (property === 'strike') {
      if (
        composing ||
        pending ||
        historyPending ||
        input.value !== committed ||
        !controls.ready() ||
        controls.busy()
      )
        return false;
      if (multipleParagraphs()) {
        if (renderer.characterStrikeRangesAvailable?.() !== true) return false;
        const state = selectedCharacterPropertyState(property);
        const ranges = renderer.selectionRanges?.(anchor, focus);
        if (state === null || !ranges?.length) return false;
        pending = { kind: 'character-strike-ranges', anchor: { ...anchor }, focus: { ...focus } };
        if (
          !controls.request({
            kind: pending.kind,
            origin: 'canvas',
            ranges,
            enabled: state !== true,
          })
        ) {
          pending = null;
          return false;
        }
        input.setAttribute('aria-busy', 'true');
        return true;
      }
      const range = selectedRange();
      if (!range || range.startUnit === range.endUnit) return false;
      const state = selectedCharacterPropertyState(property);
      if (state === null) return false;
      pending = { kind: 'character-strike', start: input.selectionStart, end: input.selectionEnd };
      if (
        !controls.request({
          kind: pending.kind,
          origin: 'canvas',
          ...range,
          enabled: state !== true,
        })
      ) {
        pending = null;
        return false;
      }
      input.setAttribute('aria-busy', 'true');
      return true;
    }
    if (multipleParagraphs()) {
      const state = selectedCharacterPropertyState(property);
      return state === null
        ? false
        : property === 'underline'
          ? setCharacterUnderline(state === true ? 'none' : 'bottom')
          : setCharacterProperties({ [property]: state !== true });
    }
    if (!selectedRange()) return false;
    if (input.selectionStart === input.selectionEnd && ['bold', 'italic'].includes(property)) {
      const state = selectedCharacterPropertyState(property);
      return state === null ? false : setCharacterProperties({ [property]: !state });
    }
    const properties = renderer.characterToggle?.(
      target,
      snapUnit(committed, input.selectionStart),
      snapUnit(committed, input.selectionEnd, true),
      property,
    );
    if (!properties) return false;
    return property === 'underline'
      ? setCharacterUnderline(properties.underline ? 'bottom' : 'none')
      : setCharacterProperties(properties);
  };
  const setCharacterColor = (kind, color) => {
    const range = selectedRange();
    if (!range || range.startUnit === range.endUnit) return false;
    pending = { kind, start: input.selectionStart, end: input.selectionEnd };
    if (!controls.request({ kind, origin: 'canvas', ...range, color })) {
      pending = null;
      return false;
    }
    input.setAttribute('aria-busy', 'true');
    return true;
  };
  const setCharacterUnderlineColor = (color) =>
    setCharacterColor('character-underline-color', color);
  const setCharacterStrikeColor = (color) =>
    renderer.characterStrikeColorAvailable?.() === true &&
    setCharacterColor('character-strike-color', color);
  const selectedShadeRanges = () => {
    if (!multipleParagraphs()) {
      const range = selectedRange();
      return range ? [range] : null;
    }
    if (
      renderer.characterShadeRangesAvailable?.() !== true ||
      composing ||
      pending ||
      historyPending ||
      input.value !== committed ||
      !controls.ready() ||
      controls.busy()
    )
      return null;
    return renderer.selectionRanges?.(anchor, focus) ?? null;
  };
  const selectedOutlineRanges = () => {
    if (!multipleParagraphs()) {
      const range = renderer.characterOutlineAvailable?.() === true ? selectedRange() : null;
      return range ? [range] : null;
    }
    if (
      renderer.characterOutlineRangesAvailable?.() !== true ||
      composing ||
      pending ||
      historyPending ||
      input.value !== committed ||
      !controls.ready() ||
      controls.busy()
    )
      return null;
    const ranges = renderer.selectionRanges?.(anchor, focus);
    try {
      encodeCharacterRanges(ranges);
    } catch {
      return null;
    }
    return ranges;
  };
  const selectedOutlineValue = (named = false) => {
    if (
      composing ||
      pending ||
      historyPending ||
      input.value !== committed ||
      !controls.ready() ||
      controls.busy()
    )
      return null;
    if (multipleParagraphs())
      return selectedOutlineRanges()
        ? (renderer[named ? 'characterOutlineKindState' : 'characterOutlineState']?.(
            anchor,
            focus,
          ) ?? null)
        : null;
    if (!selectedRange() || input.selectionStart === input.selectionEnd) return null;
    return (
      renderer[named ? 'characterOutlineKind' : 'characterOutline']?.(
        target,
        snapUnit(committed, input.selectionStart),
        snapUnit(committed, input.selectionEnd, true),
      ) ?? null
    );
  };
  const characterOutlineKindAvailable = (kind) => {
    let value;
    try {
      value = hwp5CharacterOutlineArg(kind);
    } catch {
      return false;
    }
    if (!selectedOutlineRanges()?.some((range) => range.startUnit < range.endUnit)) return false;
    return (
      value <= 1 ||
      (multipleParagraphs()
        ? renderer.characterOutlineRangesExtendedAvailable?.()
        : renderer.characterOutlineExtendedAvailable?.()) === true
    );
  };
  const selectedEffectRanges = (exclusive = false) => {
    try {
      characterEffectMode(exclusive);
    } catch {
      return null;
    }
    if (multipleParagraphs()) {
      const available = exclusive
        ? renderer.characterEffectRangesExclusiveAvailable?.()
        : renderer.characterEffectRangesAvailable?.();
      if (
        available !== true ||
        composing ||
        pending ||
        historyPending ||
        input.value !== committed ||
        !controls.ready() ||
        controls.busy()
      )
        return null;
      const ranges = renderer.selectionRanges?.(anchor, focus);
      try {
        encodeCharacterRanges(ranges);
      } catch {
        return null;
      }
      return ranges;
    }
    if (
      (exclusive
        ? renderer.characterEffectExclusiveAvailable?.()
        : renderer.characterEffectAvailable?.()) !== true
    )
      return null;
    const range = selectedRange();
    return range ? [range] : null;
  };
  const setCharacterShade = (color) => {
    if (renderer.characterShadeAvailable?.() !== true) return false;
    try {
      characterShadeArgs(color);
    } catch {
      return false;
    }
    if (multipleParagraphs()) {
      if (renderer.characterShadeRangesAvailable?.() !== true) return false;
      const ranges = selectedShadeRanges();
      if (!ranges?.some((range) => range.startUnit < range.endUnit)) return false;
      pending = { kind: 'character-shade-ranges', anchor: { ...anchor }, focus: { ...focus } };
      if (!controls.request({ kind: pending.kind, origin: 'canvas', ranges, color })) {
        pending = null;
        return false;
      }
      input.setAttribute('aria-busy', 'true');
      return true;
    }
    return setCharacterColor('character-shade', color);
  };
  const setCharacterFont = (language, fontId) => {
    if (multipleParagraphs()) {
      const ranges = selectedFontRanges();
      if (!ranges?.some((range) => range.startUnit < range.endUnit)) return false;
      pending = { kind: 'character-font-ranges', anchor: { ...anchor }, focus: { ...focus } };
      if (!controls.request({ kind: pending.kind, origin: 'canvas', ranges, language, fontId })) {
        pending = null;
        return false;
      }
      input.setAttribute('aria-busy', 'true');
      return true;
    }
    if (renderer.characterFontAvailable?.() !== true) return false;
    const range = selectedRange();
    if (!range || range.startUnit === range.endUnit) return false;
    pending = { kind: 'character-font', start: input.selectionStart, end: input.selectionEnd };
    if (
      !controls.request({ kind: 'character-font', origin: 'canvas', ...range, language, fontId })
    ) {
      pending = null;
      return false;
    }
    input.setAttribute('aria-busy', 'true');
    return true;
  };
  const setCharacterFontName = (language, name) => {
    if (multipleParagraphs()) {
      const ranges = selectedFontNameRanges();
      if (!ranges?.some((range) => range.startUnit < range.endUnit)) return false;
      pending = { kind: 'character-font-name-ranges', anchor: { ...anchor }, focus: { ...focus } };
      if (!controls.request({ kind: pending.kind, origin: 'canvas', ranges, language, name })) {
        pending = null;
        return false;
      }
      input.setAttribute('aria-busy', 'true');
      return true;
    }
    const range = selectedRange();
    if (!range) return false;
    if (range.startUnit === range.endUnit) {
      if (renderer.namedFontTextAvailable?.() !== true || !textEditable()) return false;
      if (typingProperties && renderer.namedFontPropertyTextAvailable?.() !== true) return false;
      try {
        characterFontNameArgs(language, name);
      } catch {
        return false;
      }
      typingFont = { ...target, language, name };
      report('다음 입력의 글꼴을 지정했습니다. 입력 전에는 문서가 변경되지 않습니다.');
      return true;
    }
    if (renderer.characterFontNameAvailable?.() !== true) return false;
    pending = { kind: 'character-font-name', start: input.selectionStart, end: input.selectionEnd };
    if (!controls.request({ kind: pending.kind, origin: 'canvas', ...range, language, name })) {
      pending = null;
      return false;
    }
    input.setAttribute('aria-busy', 'true');
    return true;
  };
  const selectedFontRanges = () => {
    if (!multipleParagraphs()) {
      const range = selectedRange();
      return range ? [range] : null;
    }
    if (
      renderer.characterFontRangesAvailable?.() !== true ||
      composing ||
      pending ||
      historyPending ||
      input.value !== committed ||
      !controls.ready() ||
      controls.busy()
    )
      return null;
    return renderer.selectionRanges?.(anchor, focus) ?? null;
  };
  const selectedFontNameRanges = () => {
    if (!multipleParagraphs()) {
      const range = selectedRange();
      if (range?.startUnit === range?.endUnit && !textEditable()) return null;
      return range;
    }
    if (
      renderer.characterFontNameRangesAvailable?.() !== true ||
      composing ||
      pending ||
      historyPending ||
      input.value !== committed ||
      !controls.ready() ||
      controls.busy()
    )
      return null;
    return renderer.selectionRanges?.(anchor, focus) ?? null;
  };
  const selectedTextColorRanges = () => {
    if (!multipleParagraphs()) {
      const range = selectedRange();
      return range ? [range] : null;
    }
    if (renderer.textColorRangesAvailable?.() === false) return null;
    if (
      composing ||
      pending ||
      historyPending ||
      input.value !== committed ||
      !controls.ready() ||
      controls.busy()
    )
      return null;
    return renderer.selectionRanges?.(anchor, focus) ?? null;
  };
  const setCharacterTextColor = (color) => {
    if (!multipleParagraphs()) return setCharacterColor('character-text-color', color);
    const ranges = selectedTextColorRanges();
    if (!ranges?.some((range) => range.startUnit < range.endUnit)) return false;
    pending = { kind: 'character-text-color-ranges', anchor: { ...anchor }, focus: { ...focus } };
    if (!controls.request({ kind: pending.kind, origin: 'canvas', ranges, color })) {
      pending = null;
      return false;
    }
    input.setAttribute('aria-busy', 'true');
    return true;
  };
  const mergeBoundary = (backward) => {
    if (target?.createdCell) return false;
    if (!textEditable()) return false;
    if (
      !target ||
      input.selectionStart !== input.selectionEnd ||
      input.selectionStart !== (backward ? 0 : input.value.length)
    )
      return false;
    if (!mergeAvailable) return false;
    if (
      composing ||
      pending ||
      historyPending ||
      input.value !== committed ||
      !controls.ready() ||
      controls.busy()
    )
      return true;
    const current = renderer.paragraph(target);
    const neighbor = backward ? current?.previousMergeParagraph : current?.nextMergeParagraph;
    if (neighbor === null) return true;
    const explicit = Number.isInteger(neighbor);
    const left = {
      ...paragraphTarget(target),
      paragraph: backward ? (explicit ? neighbor : target.paragraph - 1) : target.paragraph,
    };
    const rightParagraph = backward ? target.paragraph : explicit ? neighbor : target.paragraph + 1;
    const paragraph = renderer.paragraph(left);
    if (!paragraph || !renderer.paragraph({ ...left, paragraph: rightParagraph })) return true;
    structureTarget = { kind: 'merge', ...left, unit: paragraph.text.length };
    historyPending = true;
    input.readOnly = true;
    if (
      !controls.request({
        kind: 'merge',
        origin: 'canvas',
        ...left,
        ...(explicit ? { rightParagraph } : {}),
      })
    ) {
      structureTarget = null;
      historyPending = false;
      updateReadOnly();
    } else input.setAttribute('aria-busy', 'true');
    return true;
  };
  listen(input, 'beforeinput', (event) => {
    if (event.defaultPrevented) return;
    if (compositionInvalidated) {
      event.preventDefault();
      return;
    }
    if (
      ['historyUndo', 'historyRedo'].includes(event.inputType) &&
      !composing &&
      !event.isComposing
    ) {
      event.preventDefault();
      travel(event.inputType === 'historyUndo' ? 'undo' : 'redo');
      return;
    }
    if (deferredComposition) return;
    if (historyInputPending() && !composing && !event.isComposing) {
      event.preventDefault();
      if (!queueOrderedInput(event.inputType, event.data))
        report('현재 대기 명령 뒤에 이 입력을 적용할 수 없습니다.');
      return;
    }
    if (structureTarget?.kind === 'split' && historyPending) {
      event.preventDefault();
      if (
        !event.isComposing &&
        !composing &&
        ['insertText', 'insertReplacementText'].includes(event.inputType)
      )
        queueSplitTyping(event.data);
      return;
    }
    if (!target || !controls.ready() || historyPending) {
      event.preventDefault();
      return;
    }
    if (['historyUndo', 'historyRedo'].includes(event.inputType)) {
      event.preventDefault();
      travel(event.inputType === 'historyUndo' ? 'undo' : 'redo');
      return;
    }
    if (pending?.kind === 'replace-paragraph-ranges' && !multipleParagraphs()) {
      event.preventDefault();
      if (!event.isComposing && !composing && event.inputType === 'insertText')
        queueReplacementTyping(event.data);
      return;
    }
    if (multipleParagraphs()) {
      if (multiComposition && composing) return;
      event.preventDefault();
      if (event.isComposing || composing) return;
      if (
        ['insertText', 'insertReplacementText', 'insertFromPaste'].includes(event.inputType) &&
        typeof event.data === 'string'
      ) {
        if (event.inputType !== 'insertText' || !queueReplacementTyping(event.data))
          replaceSelection(event.data);
      } else if (['insertLineBreak', 'insertParagraph'].includes(event.inputType))
        replaceSelection('\n');
      else if (
        ['deleteContentBackward', 'deleteContentForward', 'deleteByCut'].includes(event.inputType)
      )
        replaceSelection('');
      return;
    }
    if (
      event.inputType === 'insertLineBreak' &&
      target.createdCell &&
      renderer.paragraph(target)?.softLineBreakAvailable === true
    ) {
      event.preventDefault();
      replaceSelection('\n');
      return;
    }
    if (
      event.inputType === 'insertFromPaste' &&
      typeof event.data === 'string' &&
      /[\r\n]/.test(event.data)
    ) {
      event.preventDefault();
      sync();
      replaceSelection(event.data);
      return;
    }
    if (['insertLineBreak', 'insertParagraph'].includes(event.inputType)) {
      event.preventDefault();
      split();
      return;
    }
    if (!textEditable() && !pendingDraftEditable()) {
      event.preventDefault();
      return;
    }
    if (pendingDraftEditable() && !composing) {
      if (!inputIntents.hasCapacity) {
        event.preventDefault();
        report('대기 입력 한도에 도달했습니다. 반영 후 이어서 입력하세요.');
        return;
      }
      sync();
      queuedInputCapture = {
        before: input.value,
        selection: {
          startUnit: input.selectionStart,
          endUnit: input.selectionEnd,
          inputType: event.inputType,
        },
        beforeSelection: { anchor: { ...anchor }, focus: { ...focus } },
      };
    }
    if (!pending && !composing && input.value === committed) {
      sync();
      draftSelection = { anchor: { ...anchor }, focus: { ...focus }, inputType: event.inputType };
    }
    if (
      ['deleteContentBackward', 'deleteContentForward'].includes(event.inputType) &&
      mergeBoundary(event.inputType === 'deleteContentBackward')
    ) {
      event.preventDefault();
      return;
    }
    if (['insertLineBreak', 'insertParagraph'].includes(event.inputType)) {
      event.preventDefault();
      split();
    }
  });
  listen(input, 'input', () => {
    if (compositionInvalidated) {
      input.value = committed;
      renderer.preview(null);
      sync();
      return;
    }
    if (deferredComposition) return;
    if (!target) return;
    if (multiComposition && composing) {
      const projected = compositionProjection();
      if (!projected) {
        report('조합 문자열의 표시 경계를 확인할 수 없습니다.');
        return;
      }
      renderer.preview(projected.draft);
      paint();
      return;
    }
    if (!textEditable() && !pendingDraftEditable()) {
      if (
        typeof queryEditRange === 'function' &&
        renderer.paragraph(target)?.selectable &&
        !multipleParagraphs()
      ) {
        updateReadOnly();
        return;
      }
      input.value = committed;
      sync();
      return;
    }
    if (pendingDraftEditable() && !composing) {
      const capture = queuedInputCapture ?? {
        before: inputIntents.projected ?? pending?.afterText,
        selection: null,
        beforeSelection: null,
      };
      queuedInputCapture = null;
      try {
        inputIntents.append(
          capture.before,
          input.value,
          capture.selection,
          capture.beforeSelection,
        );
      } catch (error) {
        input.value = capture.before;
        renderer.preview(draftPreview());
        sync();
        report(`대기 입력을 추가하지 못했습니다: ${error.message}`);
        return;
      }
    }
    preview();
    if (!composing) pump();
  });
  listen(input, 'compositionstart', () => {
    if (!target || !controls.ready()) return;
    compositionInvalidated = false;
    if (historyInputPending()) {
      const token = historyIntents.composition();
      if (!token) {
        report('조합 입력을 위한 대기 공간이 없습니다.');
        return;
      }
      deferredComposition = {
        token,
        before: input.value,
        start: input.selectionStart,
        end: input.selectionEnd,
        direction: input.selectionDirection,
      };
      composing = true;
      return;
    }
    if (historyPending) {
      input.readOnly = true;
      report('문단 변경 반영 뒤 조합 입력을 시작하세요.');
      return;
    }
    if (multipleParagraphs()) {
      if (
        !multiCompositionAvailable() ||
        pending ||
        historyPending ||
        controls.busy() ||
        input.value !== committed
      )
        return;
      multiComposition = { anchor: { ...anchor }, focus: { ...focus } };
      input.value = '';
      input.setSelectionRange(0, 0);
      composing = true;
      paint();
      return;
    }
    if (!textEditable() && !pendingDraftEditable()) return;
    if (textPending() || inputIntents.size) {
      sync();
      compositionInputCapture = {
        before: input.value,
        selection: { startUnit: input.selectionStart, endUnit: input.selectionEnd },
        beforeSelection: { anchor: { ...anchor }, focus: { ...focus } },
      };
      queuedInputCapture = null;
    }
    if (!pending && input.value === committed) {
      sync();
      draftSelection = { anchor: { ...anchor }, focus: { ...focus } };
    }
    composing = true;
    paint();
  });
  listen(input, 'compositionend', (event) => {
    if (compositionInvalidated) {
      compositionInvalidated = false;
      composing = false;
      multiComposition = null;
      input.value = committed;
      renderer.preview(null);
      sync();
      paint();
      return;
    }
    if (deferredComposition) {
      const capture = deferredComposition;
      const data =
        typeof event.data === 'string'
          ? event.data
          : (textChange(capture.before, input.value, {
              startUnit: capture.start,
              endUnit: capture.end,
            })?.text ?? '');
      deferredComposition = null;
      composing = false;
      input.value = capture.before;
      input.setSelectionRange(capture.start, capture.end, capture.direction);
      const replies = deferredReplies;
      deferredReplies = [];
      for (const reply of replies) controller.message(reply);
      if (!historyIntents.completeComposition(capture.token, data)) {
        historyIntents.clear();
        report('조합 입력의 대기 문서를 확인할 수 없습니다.');
      }
      historyIntents.wake();
      return;
    }
    if (!composing) return;
    if (multiComposition) {
      const selected = multiComposition;
      const text = typeof event.data === 'string' ? event.data : input.value;
      multiComposition = null;
      composing = false;
      input.value = committed;
      renderer.preview(null);
      setSelection(selected.anchor, selected.focus);
      if (text) replaceSelection(text);
      return;
    }
    composing = false;
    if (compositionInputCapture) {
      const capture = compositionInputCapture;
      compositionInputCapture = null;
      try {
        inputIntents.append(
          capture.before,
          input.value,
          capture.selection,
          capture.beforeSelection,
        );
      } catch (error) {
        input.value = capture.before;
        renderer.preview(draftPreview());
        sync();
        report(`조합 입력을 추가하지 못했습니다: ${error.message}`);
        return;
      }
    }
    preview();
    queueMicrotask(pump);
    historyIntents.wake();
  });
  listen(input, 'keydown', (event) => {
    if (
      !target ||
      event.defaultPrevented ||
      event.getModifierState?.('AltGraph') ||
      composing ||
      event.isComposing ||
      event.keyCode === 229
    )
      return;
    const navigation = navigationIntent(event, platform);
    const key = navigation?.key ?? event.key;
    if (
      historyInputPending() &&
      navigation &&
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)
    ) {
      event.preventDefault();
      queueOrderedInput(
        'navigation',
        JSON.stringify({
          key,
          paragraphEdge: navigation.paragraphEdge,
          extend: event.shiftKey === true,
          word: navigation.word,
        }),
      );
      return;
    }
    if (
      historyInputPending() &&
      !event.altKey &&
      !event.metaKey &&
      !event.ctrlKey &&
      ['Backspace', 'Delete'].includes(key) &&
      multipleParagraphs()
    ) {
      event.preventDefault();
      queueOrderedInput(key === 'Backspace' ? 'deleteContentBackward' : 'deleteContentForward');
      return;
    }
    if (
      historyInputPending() &&
      !event.altKey &&
      !event.metaKey &&
      !event.ctrlKey &&
      key === 'Enter'
    ) {
      event.preventDefault();
      queueOrderedInput(event.shiftKey ? 'insertLineBreak' : 'insertParagraph');
      return;
    }
    if (
      historyInputPending() &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      (multipleParagraphs() || pending?.kind === 'replace-paragraph-ranges') &&
      Array.from(key).length === 1 &&
      key.isWellFormed()
    ) {
      event.preventDefault();
      queueOrderedInput('insertText', key);
      return;
    }
    if (
      structureTarget?.kind === 'split' &&
      historyPending &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      Array.from(key).length === 1 &&
      key.isWellFormed()
    ) {
      event.preventDefault();
      queueSplitTyping(key);
      return;
    }
    if (
      (multipleParagraphs() || pending?.kind === 'replace-paragraph-ranges') &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      Array.from(key).length === 1 &&
      key.isWellFormed()
    ) {
      event.preventDefault();
      if (!queueReplacementTyping(key)) replaceSelection(key);
      return;
    }
    if (
      multipleParagraphs() &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      ['Backspace', 'Delete'].includes(key)
    ) {
      event.preventDefault();
      replaceSelection('');
      return;
    }
    if (
      multipleParagraphs() &&
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      ['c', 'x'].includes(key.toLowerCase())
    ) {
      event.preventDefault();
      transferSelection({ cut: key.toLowerCase() === 'x' });
      return;
    }
    if (
      multipleParagraphs() &&
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)
    ) {
      if (!navigation) return;
      event.preventDefault();
      if (
        pending ||
        historyPending ||
        input.value !== committed ||
        !controls.ready() ||
        controls.busy()
      )
        return;
      if (event.shiftKey) {
        const paragraph = renderer.paragraph(focus);
        if (!paragraph || !navigation) return;
        const next = extendedNavigation(key, navigation.paragraphEdge, true, navigation.word);
        if (next && renderer.selectionRanges?.(next.anchor, next.focus)) {
          setSelection(next.anchor, next.focus, next.preferredX);
          reveal();
        }
        return;
      }
      const point =
        key === 'ArrowLeft' || key === 'ArrowRight'
          ? paragraphSelectionEdge(anchor, focus, key === 'ArrowRight')
          : focus;
      if (!point || !renderer.paragraph(point)) return;
      target = paragraphTarget(point);
      committed = renderer.paragraph(target).text;
      input.value = committed;
      setSelection(point, point);
      if (key !== event.key) {
        const next = extendedNavigation(key, navigation.paragraphEdge, false, navigation.word);
        if (next) setSelection(next.anchor, next.focus, next.preferredX);
      }
      reveal();
      return;
    }
    if (
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      !event.shiftKey &&
      !event.defaultPrevented &&
      ['b', 'i', 'u'].includes(key.toLowerCase())
    ) {
      event.preventDefault();
      if (event.repeat) return;
      toggleCharacterProperty({ b: 'bold', i: 'italic', u: 'underline' }[key.toLowerCase()]);
      return;
    }
    if (
      key === 'Tab' &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      (target?.createdCell || renderer.paragraph(target)?.tableCell)
    ) {
      if (
        pending ||
        historyPending ||
        input.value !== committed ||
        !controls.ready() ||
        controls.busy()
      ) {
        event.preventDefault();
        report('입력 반영이 끝난 뒤 셀을 이동하세요.');
        return;
      }
      const next = renderer.adjacentCell?.(target, event.shiftKey);
      if (!next) return;
      event.preventDefault();
      target = paragraphTarget(next);
      committed = renderer.paragraph(target).text;
      input.value = committed;
      updateReadOnly();
      setSelection(next, next);
      reveal();
      return;
    }
    if (
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      !event.shiftKey &&
      key.toLowerCase() === 'a'
    ) {
      event.preventDefault();
      if (historyInputPending()) {
        queueOrderedInput('navigation', JSON.stringify({ key: 'SelectAll' }));
        return;
      }
      setSelection({ ...target, unit: 0 }, { ...target, unit: input.value.length });
      reveal();
      return;
    }
    if (
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      ['z', 'y'].includes(key.toLowerCase())
    ) {
      event.preventDefault();
      travel(key.toLowerCase() === 'y' || event.shiftKey ? 'redo' : 'undo');
      return;
    }
    if (key === 'Enter') {
      event.preventDefault();
      if (event.metaKey || event.ctrlKey || event.altKey) {
        const intent = paragraphBreakShortcut(event);
        if (intent !== null) split(intent);
        else report('수정키+Enter 명령은 아직 지원하지 않습니다. 문단은 변경하지 않았습니다.');
        return;
      }
      if (
        multipleParagraphs() ||
        (event.shiftKey &&
          target?.createdCell &&
          renderer.paragraph(target)?.softLineBreakAvailable === true)
      )
        replaceSelection('\n');
      else split();
      return;
    }
    if (
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      ['Backspace', 'Delete'].includes(key) &&
      mergeBoundary(key === 'Backspace')
    ) {
      event.preventDefault();
      return;
    }
    if (!navigation) return;
    event.preventDefault();
    const next = extendedNavigation(
      key,
      navigation.paragraphEdge,
      event.shiftKey === true,
      navigation.word,
    );
    if (!next) return;
    if (!event.shiftKey && !sameParagraph(target, next.focus)) {
      target = paragraphTarget(next.focus);
      committed = renderer.paragraph(target).text;
      input.value = committed;
    }
    setSelection(next.anchor, next.focus, next.preferredX);
    reveal();
  });
  listen(input, 'keyup', sync);
  listen(input, 'select', sync);
  for (const kind of ['copy', 'cut'])
    listen(input, kind, (event) => {
      if (!multipleParagraphs()) return;
      event.preventDefault();
      const text = renderer.selectionText?.(anchor, focus);
      if (
        typeof text !== 'string' ||
        !event.clipboardData ||
        pending ||
        composing ||
        historyPending ||
        input.value !== committed
      )
        return;
      event.clipboardData.setData('text/plain', text);
      if (kind === 'cut') replaceSelection('');
    });
  listen(input, 'paste', (event) => {
    const text = event.clipboardData?.getData('text/plain');
    if (historyInputPending() && typeof text === 'string' && !composing) {
      event.preventDefault();
      queueOrderedInput('insertFromPaste', text);
      return;
    }
    if (structureTarget?.kind === 'split' && historyPending) {
      event.preventDefault();
      if (!queueSplitTyping(text)) report('문단 분할 반영 뒤 여러 줄을 붙여넣으세요.');
      return;
    }
    if (!multipleParagraphs() && (typeof text !== 'string' || !/[\r\n]/.test(text))) return;
    event.preventDefault();
    if (!multipleParagraphs()) sync();
    if (typeof text === 'string') replaceSelection(text);
  });
  // A dialog/browser can restore an older textarea range while focusing it.
  // In a settled projection the Canvas anchor/focus is the view authority;
  // reapply it before a queued select event can publish the restored DOM range.
  // Do not touch composing text, pending drafts or asynchronous acknowledgments.
  const focusedSelection = () => {
    if (
      activeElement() === input &&
      target &&
      anchor &&
      focus &&
      sameParagraph(anchor, target) &&
      sameParagraph(focus, target) &&
      !composing &&
      !pending &&
      !historyPending &&
      !inputIntents.size &&
      input.value === committed &&
      !controls.busy()
    ) {
      input.setSelectionRange(
        Math.min(anchor.unit, focus.unit),
        Math.max(anchor.unit, focus.unit),
        anchor.unit > focus.unit ? 'backward' : 'forward',
      );
    }
    paint();
  };
  const focusInput = () => {
    if (events.signal.aborted) return false;
    input.focus({ preventScroll: true });
    if (activeElement() !== input) return false;
    // focus() on an already active input need not emit a focus event.
    focusedSelection();
    return true;
  };
  listen(input, 'focus', focusedSelection);
  listen(input, 'blur', paint);
  const selectedRange = () => {
    if (target?.createdCell) return null;
    if (
      !target ||
      multipleParagraphs() ||
      composing ||
      pending ||
      historyPending ||
      !controls.ready() ||
      controls.busy() ||
      input.value !== committed
    )
      return null;
    const startUnit = snapUnit(committed, input.selectionStart);
    const endUnit = snapUnit(committed, input.selectionEnd, true);
    const range = sourceTextChange(
      { startUnit, endUnit, text: '' },
      renderer.paragraph(target)?.sourceOffsets,
    );
    return {
      section: target.section,
      paragraph: target.paragraph,
      startUnit: range.startUnit,
      endUnit: range.endUnit,
    };
  };
  const canInsertParagraphBreak = () =>
    !events.signal.aborted &&
    paragraphBreakAvailable &&
    structureAvailable &&
    !inputIntents.size &&
    drag === null &&
    selectedRange() !== null &&
    renderer.paragraph(target)?.selectionOwner === `section:${target.section}:body` &&
    (textEditable() ||
      Boolean(splitQueryAvailable && editRange() && splitPermission.allowed(editRange())));
  const canSetTypingProperties = () =>
    Boolean(selectedRange()) &&
    input.selectionStart === input.selectionEnd &&
    textEditable() &&
    renderer.characterPropertyTextAvailable?.() === true &&
    (!typingFont || renderer.namedFontPropertyTextAvailable?.() === true);
  const resetExternalSelection = (controller, origin = 'canvas') => {
    if (historyRevision !== null && anchor && focus)
      historySelections.remember(historyRevision, { anchor, focus });
    const available = historyAvailable,
      structure = structureAvailable,
      merge = mergeAvailable,
      splitQuery = splitQueryAvailable,
      breaks = paragraphBreakAvailable;
    controller.reset({ preserveHistory: true, selectionOrigin: origin });
    historyAvailable = available;
    structureAvailable = structure;
    mergeAvailable = merge;
    splitQueryAvailable = splitQuery;
    paragraphBreakAvailable = breaks;
  };
  const settledSelection = (allowEmpty = false) => {
    if (
      events.signal.aborted ||
      !target ||
      !anchor ||
      !focus ||
      composing ||
      pending ||
      historyPending ||
      controls.busy() ||
      input.value !== committed
    )
      return null;
    const text = multipleParagraphs()
      ? renderer.selectionText?.(anchor, focus)
      : committed.slice(
          snapUnit(committed, input.selectionStart),
          snapUnit(committed, input.selectionEnd, true),
        );
    if (typeof text !== 'string' || (!allowEmpty && !text)) return null;
    return {
      text,
      allowEmpty,
      anchor,
      focus,
      target,
      committed,
      revision: historyRevision,
      start: input.selectionStart,
      end: input.selectionEnd,
    };
  };
  const selectionCurrent = (saved) => {
    const current = settledSelection(saved.allowEmpty);
    return (
      current !== null &&
      current.anchor === saved.anchor &&
      current.focus === saved.focus &&
      current.target === saved.target &&
      current.committed === saved.committed &&
      current.revision === saved.revision &&
      current.start === saved.start &&
      current.end === saved.end &&
      current.text === saved.text
    );
  };
  const selectionTextEditAvailable = () => {
    if (!controls.ready()) return false;
    if (!multipleParagraphs()) return textEditable();
    if (renderer.paragraphReplacementAvailable?.() === false) return false;
    const ranges = renderer.replacementRanges?.(anchor, focus);
    return Boolean(
      ranges?.length && ranges.every((range) => renderer.paragraph(range)?.editable === true),
    );
  };
  const replaceSelectedText = (text) => {
    if (typeof text !== 'string' || !text.isWellFormed()) return false;
    if (/[\r\n]/.test(text) || multipleParagraphs()) return replaceSelection(text);
    if (
      !target ||
      composing ||
      pending ||
      historyPending ||
      input.value !== committed ||
      !controls.ready() ||
      controls.busy() ||
      !textEditable()
    )
      return false;
    const start = snapUnit(committed, input.selectionStart),
      end = snapUnit(committed, input.selectionEnd, true);
    const next = committed.slice(0, start) + text + committed.slice(end);
    if (next === committed) return true;
    const previous = { anchor: { ...anchor }, focus: { ...focus } };
    draftSelection = previous;
    input.value = next;
    input.setSelectionRange(start + text.length, start + text.length);
    pump({ startUnit: start, endUnit: end, text });
    if (!pending) {
      input.value = committed;
      draftSelection = null;
      setSelection(previous.anchor, previous.focus);
      return false;
    }
    preview();
    return true;
  };
  const transferSelection = ({
    cut = false,
    clipboard = environment.clipboard ?? realm.navigator?.clipboard,
  } = {}) => {
    const saved = settledSelection();
    if (!saved || (cut && !selectionTextEditAvailable())) return Promise.resolve(false);
    return transferSelectedText({
      clipboard,
      text: saved.text,
      isCurrent: () => selectionCurrent(saved),
      cut,
      remove: () => replaceSelectedText(''),
      report,
    });
  };
  const canDeleteSelection = () => settledSelection() !== null && selectionTextEditAvailable();
  const controller = {
    focusInput,
    canInsertParagraphBreak,
    insertParagraphBreak(kind) {
      const intent = paragraphBreakIntent({ kind: 'split', breakBefore: kind });
      if (!canInsertParagraphBreak()) return false;
      const accepted = split(intent) === true;
      if (accepted) input.focus({ preventScroll: true });
      return accepted;
    },
    canDeleteSelection,
    deleteSelection() {
      if (!canDeleteSelection()) return false;
      const accepted = replaceSelectedText('');
      if (accepted) input.focus({ preventScroll: true });
      return accepted;
    },
    canPasteSelection() {
      return (
        typeof clipboard?.readText === 'function' &&
        settledSelection(true) !== null &&
        selectionTextEditAvailable()
      );
    },
    canPasteInput() {
      return settledSelection(true) !== null && selectionTextEditAvailable();
    },
    pasteSelection({ clipboard = environment.clipboard ?? realm.navigator?.clipboard } = {}) {
      const saved = settledSelection(true);
      if (!saved || !selectionTextEditAvailable()) return Promise.resolve(false);
      return pasteClipboardText({
        clipboard,
        isCurrent: () => selectionCurrent(saved) && selectionTextEditAvailable(),
        replace: replaceSelectedText,
        report,
        onDenied: () => input.focus({ preventScroll: true }),
      });
    },
    canTransferSelection(cut = false) {
      return (
        typeof clipboard?.writeText === 'function' &&
        settledSelection() !== null &&
        (!cut || selectionTextEditAvailable())
      );
    },
    transferSelection,
    selectTextRange(
      { section, paragraph, startUnit, endUnit, affinity = 'forward' },
      { focusInput = true, selectionOrigin: origin = 'canvas' } = {},
    ) {
      if (!['forward', 'backward'].includes(affinity)) return false;
      if (
        composing ||
        pending ||
        historyPending ||
        drag !== null ||
        input.value !== committed ||
        controls.busy()
      )
        return false;
      const next = { section, paragraph },
        row = renderer.paragraph(next);
      if (
        !row ||
        row.clipped ||
        !selectableText(row) ||
        ![startUnit, endUnit].every(Number.isInteger) ||
        startUnit < 0 ||
        endUnit < startUnit ||
        endUnit > row.text.length
      )
        return false;
      if (snapUnit(row.text, startUnit) !== startUnit || snapUnit(row.text, endUnit) !== endUnit)
        return false;
      if (!caretGeometry(renderer.layout(), { ...next, unit: startUnit })) return false;
      target = next;
      committed = row.text;
      input.value = committed;
      input.disabled = false;
      setSelection(
        { ...next, unit: affinity === 'backward' ? endUnit : startUnit },
        { ...next, unit: affinity === 'backward' ? startUnit : endUnit },
        null,
        origin,
      );
      if (focusInput) input.focus({ preventScroll: true });
      paint();
      reveal();
      return true;
    },
    replaceSelection,
    replaceSelectedText,
    selectedRange,
    selectedCharacterPropertyState,
    selectedCharacterPropertyRanges,
    selectedCharacterSize() {
      if (
        composing ||
        pending ||
        historyPending ||
        input.value !== committed ||
        !controls.ready() ||
        controls.busy()
      )
        return null;
      if (multipleParagraphs()) return renderer.selectionCharacterSize?.(anchor, focus) ?? null;
      if (!selectedRange()) return null;
      if (input.selectionStart === input.selectionEnd) {
        const properties =
          typingProperties && sameParagraph(typingProperties, target)
            ? typingProperties.properties
            : null;
        return characterTypingSize(committed, input.selectionStart, properties, (start, end) =>
          renderer.characterSize?.(target, start, end),
        );
      }
      return (
        renderer.characterSize?.(
          target,
          snapUnit(committed, input.selectionStart),
          snapUnit(committed, input.selectionEnd, true),
        ) ?? null
      );
    },
    canSetTypingProperties,
    toggleCharacterProperty,
    selectedParagraphFormat() {
      if (
        !target ||
        multipleParagraphs() ||
        composing ||
        pending ||
        historyPending ||
        input.value !== committed ||
        !controls.ready() ||
        controls.busy()
      )
        return null;
      const paragraph = renderer.paragraph(target);
      return !paragraph?.clipped && Number.isInteger(paragraph?.paraShapeId)
        ? {
            ...target,
            paraShapeId: paragraph.paraShapeId,
            paragraphShape: paragraph.paragraphShape ? { ...paragraph.paragraphShape } : undefined,
          }
        : null;
    },
    tableCreationSelection() {
      if (
        !target ||
        target.createdCell ||
        multipleParagraphs() ||
        composing ||
        pending ||
        historyPending ||
        input.value !== committed ||
        !controls.ready() ||
        controls.busy() ||
        renderer.tableCreationAvailable?.() !== true ||
        input.selectionStart !== input.selectionEnd
      )
        return null;
      const paragraph = renderer.paragraph(target);
      if (!paragraph || paragraph.clipped) return null;
      const unit = snapUnit(committed, input.selectionStart);
      const source = sourceTextChange(
        { startUnit: unit, endUnit: unit, text: '' },
        paragraph.sourceOffsets,
      );
      return { section: target.section, paragraph: target.paragraph, unit: source.startUnit };
    },
    tableCreationResources() {
      return renderer.tableCreationResources?.() ?? null;
    },
    tableCreationWidthHint() {
      return this.tableCreationSelection()
        ? (renderer.tableCreationWidthHint?.(target) ?? null)
        : null;
    },
    insertTable(options) {
      const selection = this.tableCreationSelection();
      if (!selection) return false;
      pending = {
        kind: 'insert-table',
        start: input.selectionStart,
        end: input.selectionEnd,
        beforeSelection: { anchor: { ...anchor }, focus: { ...focus } },
      };
      if (!controls.request({ kind: 'insert-table', origin: 'canvas', ...selection, options })) {
        pending = null;
        return false;
      }
      input.setAttribute('aria-busy', 'true');
      return true;
    },
    setParagraphFormat(paraShapeId) {
      const paragraph = this.selectedParagraphFormat();
      if (!paragraph) return false;
      pending = { kind: 'paragraph-format', start: input.selectionStart, end: input.selectionEnd };
      if (
        !controls.request({
          kind: 'paragraph-format',
          origin: 'canvas',
          section: paragraph.section,
          paragraph: paragraph.paragraph,
          paraShapeId,
        })
      ) {
        pending = null;
        return false;
      }
      input.setAttribute('aria-busy', 'true');
      return true;
    },
    setParagraphAlignment(alignment) {
      const paragraph = this.selectedParagraphFormat();
      if (!paragraph) return false;
      pending = {
        kind: 'paragraph-alignment',
        start: input.selectionStart,
        end: input.selectionEnd,
      };
      if (
        !controls.request({
          kind: 'paragraph-alignment',
          origin: 'canvas',
          section: paragraph.section,
          paragraph: paragraph.paragraph,
          alignment,
        })
      ) {
        pending = null;
        return false;
      }
      input.setAttribute('aria-busy', 'true');
      return true;
    },
    setParagraphSpacing(type, value) {
      const paragraph = this.selectedParagraphFormat();
      if (!paragraph) return false;
      pending = { kind: 'paragraph-spacing', start: input.selectionStart, end: input.selectionEnd };
      if (
        !controls.request({
          kind: 'paragraph-spacing',
          origin: 'canvas',
          section: paragraph.section,
          paragraph: paragraph.paragraph,
          type,
          value,
        })
      ) {
        pending = null;
        return false;
      }
      input.setAttribute('aria-busy', 'true');
      return true;
    },
    setParagraphMargins(margins) {
      const paragraph = this.selectedParagraphFormat();
      if (!paragraph) return false;
      pending = { kind: 'paragraph-margins', start: input.selectionStart, end: input.selectionEnd };
      if (
        !controls.request({
          kind: 'paragraph-margins',
          origin: 'canvas',
          section: paragraph.section,
          paragraph: paragraph.paragraph,
          margins,
        })
      ) {
        pending = null;
        return false;
      }
      input.setAttribute('aria-busy', 'true');
      return true;
    },
    formatSelection(charShapeId) {
      const range = selectedRange();
      if (!range || range.startUnit === range.endUnit) return false;
      pending = { kind: 'format', start: input.selectionStart, end: input.selectionEnd };
      if (!controls.request({ kind: 'format', origin: 'canvas', ...range, charShapeId })) {
        pending = null;
        return false;
      }
      input.setAttribute('aria-busy', 'true');
      return true;
    },
    setCharacterProperties,
    setCharacterUnderline,
    setCharacterUnderlineColor,
    setCharacterStrikeColor,
    setCharacterShade,
    setCharacterOutline(kind) {
      if (!characterOutlineKindAvailable(kind)) return false;
      if (multipleParagraphs()) {
        const ranges = selectedOutlineRanges();
        if (!ranges?.some((range) => range.startUnit < range.endUnit)) return false;
        pending = { kind: 'character-outline-ranges', anchor: { ...anchor }, focus: { ...focus } };
        if (
          !controls.request({ kind: pending.kind, origin: 'canvas', ranges, outlineKind: kind })
        ) {
          pending = null;
          return false;
        }
        input.setAttribute('aria-busy', 'true');
        return true;
      }
      if (renderer.characterOutlineAvailable?.() !== true) return false;
      const range = selectedRange();
      if (!range || range.startUnit === range.endUnit) return false;
      pending = { kind: 'character-outline', start: input.selectionStart, end: input.selectionEnd };
      if (
        !controls.request({ kind: pending.kind, origin: 'canvas', ...range, outlineKind: kind })
      ) {
        pending = null;
        return false;
      }
      input.setAttribute('aria-busy', 'true');
      return true;
    },
    selectedCharacterOutline: () => selectedOutlineValue(),
    selectedCharacterOutlineKind: () => selectedOutlineValue(true),
    selectedOutlineRanges,
    characterOutlineKindAvailable,
    setCharacterEffect(effect, enabled, exclusive = false) {
      try {
        characterEffectArgs(effect, enabled);
        characterEffectMode(exclusive);
      } catch {
        return false;
      }
      const ranges = selectedEffectRanges(exclusive);
      if (!ranges?.some((range) => range.startUnit < range.endUnit)) return false;
      if (multipleParagraphs()) {
        pending = { kind: 'character-effect-ranges', anchor: { ...anchor }, focus: { ...focus } };
        if (
          !controls.request({
            kind: pending.kind,
            origin: 'canvas',
            ranges,
            effect,
            enabled,
            ...(exclusive ? { exclusive: true } : {}),
          })
        ) {
          pending = null;
          return false;
        }
        input.setAttribute('aria-busy', 'true');
        return true;
      }
      const range = ranges[0];
      pending = { kind: 'character-effect', start: input.selectionStart, end: input.selectionEnd };
      if (
        !controls.request({
          kind: pending.kind,
          origin: 'canvas',
          ...range,
          effect,
          enabled,
          ...(exclusive ? { exclusive: true } : {}),
        })
      ) {
        pending = null;
        return false;
      }
      input.setAttribute('aria-busy', 'true');
      return true;
    },
    selectedEffectRanges,
    selectedCharacterEffect(effect) {
      if (
        composing ||
        pending ||
        historyPending ||
        input.value !== committed ||
        !controls.ready() ||
        controls.busy()
      )
        return null;
      if (multipleParagraphs())
        return renderer.characterEffectState?.(anchor, focus, effect) ?? null;
      if (!selectedRange() || input.selectionStart === input.selectionEnd) return null;
      return (
        renderer.characterEffect?.(
          target,
          snapUnit(committed, input.selectionStart),
          snapUnit(committed, input.selectionEnd, true),
          effect,
        ) ?? null
      );
    },
    selectedShadeRanges,
    selectedCharacterFontIds(language) {
      if (
        composing ||
        pending ||
        historyPending ||
        input.value !== committed ||
        !controls.ready() ||
        controls.busy()
      )
        return null;
      if (multipleParagraphs()) return renderer.selectionFontIds?.(anchor, focus, language) ?? null;
      if (!selectedRange()) return null;
      if (input.selectionStart === input.selectionEnd) {
        if (typingFont && sameParagraph(typingFont, target)) return null;
        const span = typingSourceSpan(committed, input.selectionStart);
        return span
          ? (renderer.characterFontIds?.(target, span.start, span.end, language) ?? null)
          : null;
      }
      return (
        renderer.characterFontIds?.(
          target,
          snapUnit(committed, input.selectionStart),
          snapUnit(committed, input.selectionEnd, true),
          language,
        ) ?? null
      );
    },
    selectedCharacterShade() {
      if (
        composing ||
        pending ||
        historyPending ||
        input.value !== committed ||
        !controls.ready() ||
        controls.busy()
      )
        return null;
      if (multipleParagraphs()) return renderer.characterShadeState?.(anchor, focus) ?? null;
      if (!selectedRange() || input.selectionStart === input.selectionEnd) return null;
      return (
        renderer.characterShade?.(
          target,
          snapUnit(committed, input.selectionStart),
          snapUnit(committed, input.selectionEnd, true),
        ) ?? null
      );
    },
    setCharacterFont,
    setCharacterFontName,
    selectedCharacterRange: selectedRange,
    selectedFontRanges,
    selectedFontNameRanges,
    setCharacterTextColor,
    selectedTextColorRanges,
    selectedCell() {
      if (
        !target ||
        composing ||
        pending ||
        historyPending ||
        input.value !== committed ||
        !controls.ready() ||
        controls.busy()
      )
        return null;
      return renderer.cell?.(target) ?? null;
    },
    selectedFormula() {
      if (
        !target ||
        composing ||
        pending ||
        historyPending ||
        input.value !== committed ||
        !controls.ready() ||
        controls.busy()
      )
        return null;
      return renderer.formula?.(target) ?? null;
    },
    setCellSize(width, height) {
      const cell = this.selectedCell();
      if (!cell) return false;
      pending = { kind: 'cell-size', start: input.selectionStart, end: input.selectionEnd };
      if (
        !controls.request({
          kind: 'cell-size',
          origin: 'canvas',
          section: cell.section,
          listNode: cell.listNode,
          width,
          height,
        })
      ) {
        pending = null;
        return false;
      }
      input.setAttribute('aria-busy', 'true');
      return true;
    },
    setTableColumnWidth(width, height) {
      if (!this.selectedCell() || !Number.isInteger(width) || width < 1 || width > 0xffffffff)
        return false;
      if (height !== undefined && (!Number.isInteger(height) || height < 0 || height > 0xffffffff))
        return false;
      const cell = renderer.cell?.(target, { includeTableNode: true });
      if (!cell || !Number.isInteger(cell.tableNode)) return false;
      pending = {
        kind: 'table-column-width',
        start: input.selectionStart,
        end: input.selectionEnd,
      };
      if (
        !controls.request({
          kind: 'table-column-width',
          origin: 'canvas',
          section: cell.section,
          tableNode: cell.tableNode,
          listNode: cell.listNode,
          width,
          expectedWidth: cell.width,
          ...(height === undefined ? {} : { height, expectedHeight: cell.height }),
        })
      ) {
        pending = null;
        return false;
      }
      input.setAttribute('aria-busy', 'true');
      return true;
    },
    selectedPicture() {
      if (
        !pictureResizeAvailable ||
        composing ||
        pending ||
        historyPending ||
        input.value !== committed ||
        !controls.ready() ||
        controls.busy()
      )
        return null;
      return pictureResizeTarget(renderer.selectedPicture?.());
    },
    resizePicture(width, height) {
      const picture = this.selectedPicture();
      if (
        !picture ||
        ![width, height].every(
          (value) => Number.isInteger(value) && value > 0 && value <= 0xffffffff,
        )
      )
        return false;
      pending = { kind: 'picture-resize' };
      if (
        !controls.request({
          kind: 'picture-resize',
          origin: 'canvas',
          section: picture.section,
          pictureNode: picture.resizeRecordNode ?? picture.pictureNode,
          width,
          height,
        })
      ) {
        pending = null;
        return false;
      }
      input.setAttribute('aria-busy', 'true');
      return true;
    },
    initializeCapabilities(value = {}) {
      this.message({ ...value, kind: 'enable', origin: 'surface-init' });
    },
    flushComposition() {
      if (composing || pending || historyPending || inputIntents.size || historyInputPending())
        return 'blocked';
      if (target && input.value !== committed) {
        pump();
        return 'blocked';
      }
      return 'unchanged';
    },
    cancelComposition() {
      const capture = deferredComposition,
        replies = deferredReplies;
      deferredComposition = null;
      deferredReplies = [];
      historyIntents.clear();
      clearInputIntents();
      composing = false;
      multiComposition = null;
      input.value = capture?.before ?? committed;
      if (capture) input.setSelectionRange(capture.start, capture.end, capture.direction);
      for (const reply of replies) this.message(reply);
      renderer.preview(null);
      sync();
    },
    settled: () =>
      !composing &&
      !pending &&
      !inputIntents.size &&
      !historyPending &&
      !historyInputPending() &&
      (!target || input.value === committed),
    canHistory: () =>
      historyAvailable &&
      !composing &&
      !pending &&
      !inputIntents.size &&
      !historyPending &&
      !historyInputPending() &&
      (!target || input.value === committed) &&
      controls.ready() &&
      !controls.busy(),
    // 기존 동기식 도구 계약은 유지하며, 키보드와 새 surface 포트는 접수 큐를 사용합니다.
    history: (kind) => !historyIntents.size && performHistory(kind),
    canRequestHistory,
    historyModelReady,
    requestHistory: travel,
    reset({ preserveHistory = false, selectionOrigin: origin = 'canvas' } = {}) {
      historyPresentationReport = null;
      selectionOrigin = origin;
      if (events.signal.aborted) return;
      historyModelWitness = null;
      historyModelPreparation = null;
      historyPaintBarrier.reset();
      canvas.dataset.selectionAuthority = 'current';
      historyIntents.clear();
      deferredComposition = null;
      deferredReplies = [];
      if (!preserveHistory) pictureResizeAvailable = false;
      renderer.selectPicture?.(null);
      rangePermission.invalidate();
      splitPermission.invalidate();
      typingFont = null;
      typingProperties = null;
      draftSelection = null;
      clearInputIntents();
      if (drag !== null && canvas.hasPointerCapture(drag)) canvas.releasePointerCapture(drag);
      composing = false;
      multiComposition = null;
      drag = null;
      target = null;
      pending = null;
      anchor = null;
      focus = null;
      committed = '';
      preferredX = null;
      historyAvailable = false;
      historyPending = false;
      structureAvailable = false;
      mergeAvailable = false;
      structureTarget = null;
      splitQueryAvailable = false;
      paragraphBreakAvailable = false;
      if (!preserveHistory) {
        historyRevision = null;
        historySelections.reset();
      }
      input.value = '';
      input.disabled = true;
      input.setAttribute('aria-busy', 'false');
      canvas.style.cursor = 'default';
      report('');
      renderer.preview(null);
      paint();
    },
    external(message) {
      if (events.signal.aborted) return;
      if (message.kind === 'set-edit-window') return;
      if (message.origin !== 'canvas' && !['enable', 'save'].includes(message.kind)) {
        resetExternalSelection(this, message.origin === 'core' ? 'core' : 'canvas');
      }
    },
    message(message) {
      if (events.signal.aborted) return;
      const pendingHistoryReply =
        historyPaintBarrier.pending &&
        historyPending &&
        message.origin === 'canvas' &&
        ['undo', 'redo'].includes(message.kind);
      if (
        deferredComposition &&
        composing &&
        !['enable', 'save', 'query-edit-range', 'query-split-range', 'set-edit-window'].includes(
          message.kind,
        )
      ) {
        deferredReplies.push(message);
        return;
      }
      if (
        message.error &&
        !['save', 'query-edit-range', 'query-split-range'].includes(message.kind) &&
        !pendingHistoryReply
      )
        historyIntents.clear();
      historyIntents.wake();
      if (message.kind === 'set-edit-window') {
        if (!message.error) resetExternalSelection(this);
        return;
      }
      if (message.kind === 'enable' && !message.error)
        pictureResizeAvailable = message.pictureResizeAvailable === true;
      if (message.kind === 'query-split-range') {
        if (!splitPermission.accept(message) && !splitPermission.reject(message)) return;
        if (message.error) report(`문단 분할 범위를 확인하지 못했습니다: ${message.error}`);
        updateReadOnly();
        return;
      }
      if (message.kind === 'query-edit-range') {
        if (!rangePermission.accept(message) && !rangePermission.reject(message)) return;
        if (
          (!message.allowed || message.error) &&
          (input.value !== committed || inputIntents.size)
        ) {
          clearInputIntents();
          input.value = committed;
          sync();
          report('이 범위는 편집할 수 없습니다.');
        }
        if (message.error) report(`입력 범위를 확인하지 못했습니다: ${message.error}`);
        updateReadOnly();
        if (message.allowed && !message.error && input.value !== committed) {
          preview();
          pump();
        }
        return;
      }
      if (message.kind !== 'save') rangePermission.invalidate();
      if (message.kind !== 'save') splitPermission.invalidate();
      const revision = message.historyRevision;
      const versioned = Number.isInteger(revision) && revision >= 0 && revision < 0xffffffff;
      const travelMessage = ['undo', 'redo'].includes(message.kind);
      const revisionChanged = versioned && revision !== historyRevision;
      if (versioned && !message.error) {
        try {
          historySelections.retain(message.historyRevisions, revision);
        } catch {
          const available = historyAvailable,
            structure = structureAvailable,
            merge = mergeAvailable,
            splitQuery = splitQueryAvailable,
            breaks = paragraphBreakAvailable;
          this.reset();
          historyAvailable = available;
          structureAvailable = structure;
          mergeAvailable = merge;
          splitQueryAvailable = splitQuery;
          paragraphBreakAvailable = breaks;
          report('문서 이력 응답의 선택 정보를 확인할 수 없습니다. 문단을 다시 선택하세요.');
          return;
        }
      }
      if (
        versioned &&
        !message.error &&
        !travelMessage &&
        historyRevision !== null &&
        revisionChanged &&
        anchor &&
        focus
      ) {
        historySelections.remember(
          historyRevision,
          pending?.beforeSelection ??
            (pending?.anchor
              ? { anchor: pending.anchor, focus: pending.focus }
              : { anchor, focus }),
        );
      }
      try {
        if (['undo', 'redo', 'merge'].includes(message.kind)) {
          typingFont = null;
          typingProperties = null;
        }
        if (message.kind === 'save') {
          pump();
          return;
        }
        if (message.applied && message.error) {
          this.reset();
          return;
        }
        if (
          message.origin === 'canvas' &&
          message.kind === 'picture-resize' &&
          pending?.kind === 'picture-resize'
        ) {
          pending = null;
          input.setAttribute('aria-busy', 'false');
          report(
            message.error ? `그림 크기 변경 실패: ${message.error}` : '그림 크기를 변경했습니다.',
          );
          return;
        }
        if (message.kind === 'enable') {
          if (!message.error) {
            historyAvailable = message.historyAvailable === true;
            structureAvailable = message.structureAvailable === true;
            splitQueryAvailable = message.splitQueryAvailable === true;
            mergeAvailable = message.mergeAvailable === true;
            paragraphBreakAvailable = message.paragraphBreakAvailable === true;
          }
          updateReadOnly();
          report(
            message.error
              ? `편집 시작 실패: ${message.error}`
              : '클릭·드래그 선택 후 입력하세요. 변경 후 재조판이 필요합니다.',
          );
          pump();
          return;
        }
        if (
          message.origin === 'canvas' &&
          structureTarget &&
          message.kind === structureTarget.kind
        ) {
          const queued = structureTarget.queuedText ?? '';
          const next =
            message.kind === 'split' && message.splitTarget
              ? { ...structureTarget, ...message.splitTarget }
              : structureTarget;
          structureTarget = null;
          historyPending = false;
          updateReadOnly();
          input.setAttribute('aria-busy', 'false');
          const operation = message.kind === 'merge' ? '병합' : '분할';
          if (message.error) {
            report(
              structureErrorMessage(operation, message.error) +
                (queued ? ' · 대기 입력은 적용되지 않았습니다.' : ''),
            );
            return;
          }
          if (
            message.kind === 'split' &&
            Object.hasOwn(message, 'splitTarget') &&
            (!message.splitTarget ||
              message.splitTarget.section !== target.section ||
              !Number.isInteger(message.splitTarget.paragraph) ||
              message.splitTarget.paragraph <= target.paragraph)
          ) {
            this.reset();
            report(
              '문단 분할은 적용됐지만 새 문단 위치를 확인할 수 없어 직접 입력을 중단했습니다.' +
                (queued ? ' 대기 입력은 적용되지 않았습니다.' : ''),
            );
            return;
          }
          const paragraph = renderer.paragraph(next);
          if (!paragraph?.editable && !paragraph?.selectable) {
            this.reset();
            report(
              `문단 ${operation}은 적용됐지만 표시 한도로 직접 입력을 중단했습니다.${queued ? ' 대기 입력은 적용되지 않았습니다.' : ''}`,
            );
            return;
          }
          if (message.kind === 'split' && typingFont && sameParagraph(typingFont, target))
            typingFont = {
              ...paragraphTarget(next),
              language: typingFont.language,
              name: typingFont.name,
            };
          if (
            message.kind === 'split' &&
            typingProperties &&
            sameParagraph(typingProperties, target)
          )
            typingProperties = {
              ...paragraphTarget(next),
              properties: { ...typingProperties.properties },
            };
          target = paragraphTarget(next);
          committed = paragraph.text;
          input.value = committed;
          renderer.preview(null);
          const unit = snapUnit(committed, Math.min(next.unit ?? 0, committed.length));
          setSelection({ ...target, unit }, { ...target, unit });
          reveal();
          if (queued && textEditable()) {
            input.value = committed.slice(0, unit) + queued + committed.slice(unit);
            input.setSelectionRange(unit + queued.length, unit + queued.length);
            preview();
            pump();
          }
          report(
            `문단 ${operation} 적용 · 재조판 필요${queued && !textEditable() ? ' · 보호된 문단의 대기 입력은 적용되지 않았습니다.' : ''}`,
          );
          return;
        }
        if (
          ['undo', 'redo'].includes(message.kind) &&
          message.origin === 'canvas' &&
          historyPending
        ) {
          historyPending = false;
          updateReadOnly();
          if (message.error) {
            report(`실행 취소/다시 실행 실패: ${message.error}`);
            return;
          }
          const restored =
            versioned && message.changed ? historySelections.selection(revision) : null;
          const restoredParagraph = restored && renderer.paragraph(restored.focus);
          const modelState =
            message.changed === true && typeof historyModelState === 'function'
              ? historyModelState()
              : null;
          let modelSelectionAccepted = false;
          const applyModelSelection = (state) => {
            if (
              !restored ||
              !state ||
              !matchHistoryModelSelection(state, revision, restored, restoredParagraph)
            )
              return false;
            modelSelectionAccepted = true;
            target = paragraphTarget(restored.focus);
            committed = restoredParagraph.text;
            input.value = committed;
            // DOM 선택·화면 권위는 실제 최신 paint 뒤 기존 barrier가 복원합니다.
            anchor = restored.anchor;
            focus = restored.focus;
            preferredX = null;
            selectionOrigin = 'canvas';
            historyModelWitness = state;
            // 중간 paint를 생략해도 기존 선택 게시와 core의 공개 알림을 생략하지 않습니다.
            try {
              onCommittedSelection(
                { anchor: { ...anchor }, focus: { ...focus } },
                { origin: 'canvas' },
              );
            } catch (error) {
              historyModelWitness = null;
              throw error;
            }
            if (events.signal.aborted || historyModelWitness !== state) return false;
            report('실행 취소/다시 실행 적용 · 화면 반영 대기');
            historyPresentationReport = reportedNoteRevision;
            return true;
          };
          if (applyModelSelection(modelState) || modelSelectionAccepted) return;
          if (
            restored &&
            modelState &&
            modelState.selection === undefined &&
            typeof prepareHistoryModelSelection === 'function'
          ) {
            const preparation = {};
            historyModelPreparation = preparation;
            let preparing;
            try {
              preparing = prepareHistoryModelSelection({
                revision,
                selection: restored,
                sourceState: modelState,
              });
            } catch (error) {
              historyModelPreparation = null;
              throw error;
            }
            if (preparing && typeof preparing.then === 'function') {
              if (events.signal.aborted || historyModelPreparation !== preparation) return;
              // 검증·게시 대기 동안 논리 위치만 보존합니다. DOM/paint 권위는 기존 barrier가 소유합니다.
              target = paragraphTarget(restored.focus);
              committed = restoredParagraph?.text ?? committed;
              input.value = committed;
              anchor = restored.anchor;
              focus = restored.focus;
              return Promise.resolve(preparing)
                .then((freshState) => {
                  if (events.signal.aborted || historyModelPreparation !== preparation) return;
                  const accepted =
                    sameHistoryModelObservation(modelState, freshState) &&
                    freshState === historyModelState() &&
                    applyModelSelection(freshState);
                  if (events.signal.aborted || historyModelPreparation !== preparation) return;
                  if (!accepted) {
                    historyModelWitness = null;
                    historyPaintBarrier.begin();
                    historyPaintBarrier.acknowledge(null);
                    canvas.dataset.selectionAuthority = 'history-unresolved';
                    report(
                      '복원 선택을 확인하지 못했습니다. 대기 입력은 아직 적용되지 않았습니다.',
                    );
                    return;
                  }
                  historyModelPreparation = null;
                  historyIntents.wake();
                  historyPaintBarrier.notify();
                  return true;
                })
                .catch((error) => {
                  if (events.signal.aborted || historyModelPreparation !== preparation) return;
                  historyModelWitness = null;
                  historyPaintBarrier.begin();
                  historyPaintBarrier.acknowledge(null);
                  canvas.dataset.selectionAuthority = 'history-unresolved';
                  report(`복원 선택 게시를 확인하지 못했습니다: ${error.message}`);
                })
                .finally(() => {
                  if (historyModelPreparation === preparation) historyModelPreparation = null;
                });
            }
            if (historyModelPreparation === preparation) historyModelPreparation = null;
          }
          const restoredRanges =
            restored &&
            (sameParagraph(restored.anchor, restored.focus)
              ? restored.focus.createdCell
                ? Boolean(restoredParagraph)
                : paragraphSelectionRanges(
                    [restoredParagraph],
                    restored.anchor,
                    restored.focus,
                    () => 'single',
                    { sourcePositions: false, includeEmpty: true },
                  )
              : renderer.selectionRanges?.(restored.anchor, restored.focus));
          if (
            restored &&
            selectableText(restoredParagraph) &&
            restoredRanges &&
            caretGeometry(renderer.layout(), restored.anchor) &&
            caretGeometry(renderer.layout(), restored.focus)
          ) {
            target = paragraphTarget(restored.focus);
            committed = renderer.paragraph(target).text;
            input.value = committed;
            if (renderer.clearDraft) renderer.clearDraft();
            else renderer.preview(null);
            setSelection(restored.anchor, restored.focus);
            reveal();
            report('실행 취소/다시 실행 적용 · 재조판 필요');
            return;
          }
          if (message.changed) {
            // 복원 권한이 없으면 대기 입력을 보존하며 임의 위치로 보내지 않습니다.
            target = anchor = focus = null;
            input.disabled = true;
            if (renderer.clearDraft) renderer.clearDraft();
            else renderer.preview(null);
            paint();
            report('이력은 적용됐지만 복원 위치를 확인할 수 없어 대기 입력을 보존했습니다.');
            return;
          }
          if (!target) {
            report(
              message.changed
                ? '실행 취소/다시 실행 적용 · 재조판 필요'
                : '이동할 편집 이력이 없습니다.',
            );
            return;
          }
          const paragraph = renderer.paragraph(target);
          if (!selectableText(paragraph)) {
            this.reset();
            return;
          }
          const a = anchor?.unit ?? 0,
            f = focus?.unit ?? 0;
          const multi = multipleParagraphs()
            ? { anchor: { ...anchor }, focus: { ...focus } }
            : null;
          committed = paragraph.text;
          input.value = committed;
          if (renderer.clearDraft) renderer.clearDraft();
          else renderer.preview(null);
          if (multi && renderer.selectionRanges?.(multi.anchor, multi.focus))
            setSelection(multi.anchor, multi.focus);
          else
            setSelection(
              { ...target, unit: snapUnit(committed, Math.min(a, committed.length)) },
              { ...target, unit: snapUnit(committed, Math.min(f, committed.length)) },
            );
          report(
            message.changed
              ? '실행 취소/다시 실행 적용 · 재조판 필요'
              : '이동할 편집 이력이 없습니다.',
          );
          return;
        }
        if (message.origin !== 'canvas' || !pending || !target || message.kind !== pending.kind)
          return;
        const previous = pending;
        pending = null;
        input.setAttribute('aria-busy', 'false');
        if (previous.kind === 'replace-paragraph-ranges') {
          if (message.error) {
            setSelection(previous.anchor, previous.focus);
            report(
              `교체 실패: ${message.error}${previous.queuedText ? ' · 대기 입력도 적용되지 않았습니다.' : ''}`,
            );
            return;
          }
          const paragraph = renderer.paragraph(previous.target);
          if (!paragraph?.editable || paragraph.clipped) {
            this.reset();
            report('교체는 적용됐지만 표시 범위에서 입력을 계속할 수 없습니다.');
            return;
          }
          typingFont = previous.font
            ? { ...previous.target, language: previous.font.language, name: previous.font.name }
            : null;
          typingProperties = previous.properties
            ? { ...previous.target, properties: { ...previous.properties } }
            : null;
          target = previous.target;
          committed = paragraph.text;
          input.value = committed;
          renderer.preview(null);
          const unit = snapUnit(committed, Math.min(previous.unit, committed.length));
          setSelection({ ...target, unit }, { ...target, unit });
          reveal();
          report('선택 교체 적용 · 재조판 필요');
          if (previous.queuedText) {
            input.value = committed.slice(0, unit) + previous.queuedText + committed.slice(unit);
            input.setSelectionRange(
              unit + previous.queuedText.length,
              unit + previous.queuedText.length,
            );
            preview();
            pump();
          }
          return;
        }
        if (
          [
            'character-properties-ranges',
            'character-outline-ranges',
            'character-effect-ranges',
            'character-strike-ranges',
            'character-underline-ranges',
            'character-text-color-ranges',
            'character-shade-ranges',
            'character-font-ranges',
            'character-font-name-ranges',
          ].includes(previous.kind)
        ) {
          setSelection(previous.anchor, previous.focus);
          report(
            message.error
              ? `서식은 적용되지 않았습니다: ${message.error}`
              : '여러 문단 서식 적용 · 재조판 필요',
          );
          return;
        }
        if (message.error) {
          clearInputIntents();
          if (previous.kind === 'splice-font-name') typingFont = null;
          if (['splice-font-name', 'splice-character-properties'].includes(previous.kind))
            typingProperties = null;
          if (
            [
              'format',
              'character-properties',
              'character-outline',
              'character-effect',
              'character-strike',
              'character-strike-color',
              'character-underline',
              'character-underline-color',
              'character-text-color',
              'character-shade',
              'character-font',
              'character-font-name',
            ].includes(previous.kind) &&
            input.value !== committed
          ) {
            report(`서식은 적용되지 않았습니다: ${message.error}`);
            preview();
            pump();
            return;
          }
          input.value = committed;
          renderer.preview(null);
          const restored = previous.beforeSelection;
          setSelection(
            restored?.anchor ?? { ...target, unit: snapUnit(committed, previous.start) },
            restored?.focus ?? { ...target, unit: snapUnit(committed, previous.end, true) },
          );
          report(`입력이 적용되지 않았습니다: ${message.error}`);
          return;
        }
        if (previous.kind === 'insert-table') {
          const next = {
            section: target.section,
            createdCell: { identity: message.identity, row: 0, column: 0 },
          };
          const cell = renderer.paragraph(next);
          if (!cell?.editable || !caretGeometry(renderer.layout(), { ...next, unit: 0 })) {
            resetExternalSelection(this);
            report('표는 생성됐지만 현재 표시 위치에서는 셀 입력을 시작할 수 없습니다.');
            return;
          }
          target = next;
          committed = cell.text;
          input.value = committed;
          setSelection({ ...next, unit: 0 }, { ...next, unit: 0 });
          input.focus({ preventScroll: true });
          reveal();
          report('표 생성 · 첫 셀에서 입력할 수 있습니다.');
          return;
        }
        const paragraph = renderer.paragraph(target);
        if (!selectableText(paragraph)) {
          this.reset();
          report(
            '표시 한도에 도달해 직접 입력을 중단했습니다. 적용된 변경은 native 모델에 유지됩니다.',
          );
          return;
        }
        committed = paragraph.text;
        if (inputIntents.size) {
          try {
            inputIntents.peek(committed);
          } catch {
            clearInputIntents();
            input.value = committed;
            renderer.preview(null);
            sync();
            report('대기 입력의 기준 문서를 확인할 수 없어 적용하지 않았습니다.');
            return;
          }
        }
        report('변경 적용 · 재조판 필요');
        preview();
        pump();
      } finally {
        if (versioned && !message.error) {
          historyRevision = revision;
          if (revisionChanged && !travelMessage)
            historySelections.remember(revision, anchor && focus ? { anchor, focus } : null);
        }
        if (pendingHistoryReply && historyPaintBarrier.pending && !historyPending) {
          const restoredSelection = target && anchor && focus ? { anchor, focus } : null;
          historyPaintBarrier.acknowledge(restoredSelection);
          canvas.dataset.selectionAuthority = restoredSelection
            ? 'awaiting-history-paint'
            : 'history-unresolved';
          input.setAttribute('aria-busy', 'true');
          paint({ deferGeometry: Boolean(historyModelPreparation) || historyModelReady() });
        }
      }
    },
    close() {
      if (events.signal.aborted) return;
      this.reset();
      events.abort();
      renderer.onGeometry(() => {});
    },
  };
  return controller;
}

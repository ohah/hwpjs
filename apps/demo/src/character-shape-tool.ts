import {
  getSelectionFormatting,
  type HeadlessEditor,
  type CharacterFontLanguage,
} from '@hwpjs/core';
import { createCharacterShapeView } from './character-shape-view.ts';
import type {
  CharacterShapeDraft,
  CharacterShapeObservation,
  CharacterShapePort,
} from './character-shape-port.ts';
type State = ReturnType<HeadlessEditor['getEditorState']>;
export interface CharacterShapeToolOptions {
  root: HTMLElement;
  port: CharacterShapePort;
  getState(): State;
  subscribe(listener: (state: State) => void): () => void;
  onStatus(message: string): void;
  onClose?: () => void;
  onPresentationChange?: () => void;
}
interface Context {
  observation: CharacterShapeObservation;
  view: ReturnType<typeof createCharacterShapeView>;
  draft: CharacterShapeDraft;
  language: CharacterFontLanguage | '';
  pending: boolean;
  stale: boolean;
  refreshRequired: boolean;
  error: string | null;
}
export function createCharacterShapeTool(options: CharacterShapeToolOptions) {
  let disposed = false,
    context: Context | undefined;
  const notify = (callback: (() => void) | undefined) => {
    try {
      callback?.();
    } catch {
      /* UI observers never resubmit writes. */
    }
  };
  const changedPresentation = () => {
    if (!disposed) notify(options.onPresentationChange);
  };
  const active = (ctx: Context) => !disposed && context === ctx;
  const sameDocument = (a: State, b: State) =>
    a.documentId === b.documentId && a.generation === b.generation;
  const sameRange = (
    a: CharacterShapeObservation['formatting']['target'],
    b: CharacterShapeObservation['formatting']['target'],
  ) =>
    !!a &&
    !!b &&
    a.owner === b.owner &&
    a.section === b.section &&
    a.paragraph === b.paragraph &&
    a.startUnit === b.startUnit &&
    a.endUnit === b.endUnit;
  const close = (restore: boolean) => {
    const before = context;
    context = undefined;
    before?.view.dispose();
    changedPresentation();
    const latest = options.getState();
    if (
      restore &&
      before &&
      !disposed &&
      latest.status === 'ready' &&
      sameDocument(before.observation.state, latest) &&
      sameRange(before.observation.formatting.target, getSelectionFormatting(latest).target) &&
      !options.root.ownerDocument.querySelector('dialog:modal')
    )
      notify(options.onClose);
  };
  const render = (ctx: Context) => {
    if (!active(ctx)) return;
    const f = ctx.observation.formatting;
    const error = ctx.error ?? options.port.assess(ctx.observation, ctx.draft);
    const writable =
      Object.values(options.port.atomic(ctx.observation)?.query.observations.aggregate ?? {}).some(
        (v) => v.writable,
      ) ||
      f.characterAvailableReason === null ||
      f.textColorAvailableReason === null ||
      f.underlineAvailableReason === null ||
      f.strikeAvailableReason === null ||
      Object.values(f.fontNameAvailableReasons).some((x) => x === null);
    ctx.view.update({
      ...ctx,
      atomicDetails: options.port.atomic(ctx.observation),
      error,
      canApply: writable && !error && !ctx.stale && !ctx.pending && !ctx.refreshRequired,
    });
  };
  const dismiss = (ctx: Context) => {
    if (active(ctx) && !ctx.pending && !ctx.view.isComposing()) close(true);
  };
  const apply = async (ctx: Context) => {
    if (!active(ctx) || ctx.pending || ctx.stale || ctx.refreshRequired || ctx.view.isComposing())
      return;
    const problem = options.port.assess(ctx.observation, ctx.draft);
    if (problem) {
      ctx.error = problem;
      render(ctx);
      return;
    }
    ctx.pending = true;
    ctx.error = null;
    render(ctx);
    changedPresentation();
    try {
      const result = await options.port.apply(ctx.observation, ctx.draft, () => active(ctx));
      if (!active(ctx)) return;
      if (result.kind === 'rejected') {
        ctx.error = result.error;
        ctx.stale = options.getState() !== ctx.observation.state;
        return;
      }
      if (result.kind === 'unchanged') {
        notify(() => options.onStatus('변경한 서식이 없습니다.'));
        close(true);
        return;
      }
      const answer = result.result;
      // A committed-refresh-required result is committed even when it has an error.
      if (answer.status === 'committed-refresh-required') {
        ctx.refreshRequired = true;
        ctx.error = answer.error ?? 'CharacterShapeRefreshRequired';
        return;
      }
      if (answer.status === 'committed-with-snapshot' || answer.status === 'known-no-op') {
        notify(() =>
          options.onStatus(
            answer.status === 'known-no-op'
              ? '서식이 이미 같습니다.'
              : '선택한 글자 모양을 적용했습니다.',
          ),
        );
        close(true);
      } else {
        ctx.error = answer.error ?? answer.status;
        ctx.stale = options.getState() !== ctx.observation.state;
      }
    } catch (error) {
      if (active(ctx)) ctx.error = error instanceof Error ? error.message : String(error);
    } finally {
      ctx.pending = false;
      if (active(ctx)) {
        render(ctx);
        changedPresentation();
      }
    }
  };
  const unsubscribe = options.subscribe((state) => {
    const ctx = context;
    if (!ctx || disposed) return;
    if (
      !sameDocument(ctx.observation.state, state) ||
      (state.status !== 'ready' && !(ctx.pending && state.status === 'refresh-required'))
    ) {
      close(false);
      return;
    }
    if (!ctx.pending && state !== ctx.observation.state) ctx.stale = true;
    render(ctx);
    changedPresentation();
  });
  return {
    isOpen: () => context !== undefined,
    presentation() {
      const state = options.getState(),
        reason = disposed
          ? 'CharacterShapeDisposed'
          : context
            ? 'CharacterShapeOpen'
            : state.status !== 'ready'
              ? 'EditorNotReady'
              : !getSelectionFormatting(state).target
                ? 'MissingSelection'
                : options.root.ownerDocument.querySelector('dialog:modal')
                  ? 'AnotherModalOpen'
                  : undefined;
      return { 'character-properties': { enabled: !reason, reason } };
    },
    action(command: string) {
      if (command !== 'character-properties') return false;
      if (disposed) return true;
      if (context) {
        context.view.focus();
        return true;
      }
      if (!this.presentation()['character-properties'].enabled) return true;
      const observation = options.port.capture();
      const ctx: Context = {
        observation,
        draft: {},
        language: '',
        pending: false,
        stale: false,
        refreshRequired: false,
        error: null,
        view: undefined!,
      };
      ctx.view = createCharacterShapeView(options.root, {
        onDraft(draft) {
          if (!active(ctx) || ctx.pending || ctx.stale || ctx.refreshRequired) return;
          ctx.draft = draft;
          ctx.error = null;
          render(ctx);
        },
        onLanguage(language) {
          if (!active(ctx) || ctx.pending || ctx.stale || ctx.refreshRequired) return;
          const previous = ctx.draft.font;
          const value = previous ? ctx.observation.formatting.fontNames[previous.language] : null;
          if (
            previous &&
            previous.language !== language &&
            !(value?.kind === 'single' && value.name === previous.name)
          ) {
            ctx.error = '현재 언어의 글꼴 초안을 먼저 적용하거나 변경 취소하세요.';
            render(ctx);
            return;
          }
          if (previous && previous.language !== language)
            ctx.draft = { ...ctx.draft, font: undefined };
          ctx.language = language;
          ctx.error = null;
          render(ctx);
        },
        onApply: () => {
          void apply(ctx);
        },
        onDismiss: () => dismiss(ctx),
      });
      context = ctx;
      render(ctx);
      ctx.view.show();
      const preparation = options.port.prepare(observation);
      if (preparation) {
        ctx.pending = true;
        render(ctx);
        void preparation
          .catch((error: unknown) => {
            if (active(ctx)) ctx.error = error instanceof Error ? error.message : String(error);
          })
          .finally(() => {
            ctx.pending = false;
            if (active(ctx)) {
              render(ctx);
              changedPresentation();
            }
          });
      }
      changedPresentation();
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      close(false);
    },
  };
}

import type { CharacterShapePort, CharacterShapeObservation } from './character-shape-port.ts';
import {
  captureSurfaceFormatting,
  type FormattingPresentation,
} from './surface-formatting-capture.ts';
import type { SurfaceFormattingHost } from './surface-formatting-port.ts';
import type {
  HeadlessEditor,
  EditorCommand,
  SetCharacterFontNamePayload,
  CharacterFontLanguage,
  getSelectionFormatting,
  CommandResult,
} from '@hwpjs/core';
// @ts-ignore 언어 파티션과 이름 검증은 기존 단일 출처를 재사용한다.
import { FONT_LANGUAGES } from '../../../js/font-face-identity.mjs';
// @ts-ignore 문자열을 정규화하거나 새 ID를 발급하지 않는다.
import { characterFontNameArgs } from '../../../js/character-font-name-args.mjs';
import { createFontNameView, type FontNameView } from './font-name-view.ts';
export type FontNameObservation = ReturnType<typeof getSelectionFormatting>;
export interface FontNameApiPort {
  readonly command: EditorCommand<SetCharacterFontNamePayload>;
  readonly observe: typeof getSelectionFormatting;
}
export interface FontNameToolOptions {
  atomicCharacterPort?: CharacterShapePort;
  getSurfaceFormattingHost?: () => SurfaceFormattingHost | undefined;
  root: HTMLElement;
  editor: Pick<
    HeadlessEditor,
    'getEditorState' | 'update' | 'dispatchCommand' | 'registerStateListener'
  >;
  api: FontNameApiPort;
  onClose(): void;
  onStatus(message: string): void;
  onPresentationChange?(): void;
  onResult?(result: CommandResult): void;
  onUIError?(error: unknown): void;
  createView?: typeof createFontNameView;
}
interface Context {
  surfaceBindingFailed: boolean;
  rangeConsumed: boolean;
  rangeCapture: ReturnType<typeof captureSurfaceFormatting>;
  state: ReturnType<HeadlessEditor['getEditorState']>;
  observation: FontNameObservation;
  catalog: ReadonlyMap<CharacterFontLanguage, readonly string[]>;
  view?: FontNameView;
  language: CharacterFontLanguage | 'representative' | null;
  atomicObservation?: CharacterShapeObservation;
  atomicReady: boolean;
  preparing: boolean;
  draft: string;
  pending: boolean;
  refreshRequired: boolean;
  error: string | null;
}
const languages: readonly CharacterFontLanguage[] = FONT_LANGUAGES;
const languageSet = new Set<string>(languages);
export function createFontNameTool(options: FontNameToolOptions) {
  const { editor, api } = options;
  if (
    !api?.command ||
    typeof api.command.id !== 'symbol' ||
    api.command.name !== 'set-character-font-name' ||
    typeof api.observe !== 'function'
  )
    throw Error('FontNameApiRequired');
  let context: Context | undefined;
  let disposed = false;
  const notify = (callback: (() => void) | undefined) => {
    try {
      callback?.();
    } catch (error) {
      try {
        options.onUIError?.(error);
      } catch {
        /* UI 오류가 명령 재접수가 되지 않는다. */
      }
    }
  };
  const active = (ctx: Context) => !disposed && context === ctx;
  const stale = (ctx: Context) =>
    ctx.surfaceBindingFailed ||
    editor.getEditorState() !== ctx.state ||
    (ctx.rangeCapture !== null && !ctx.rangeCapture.current());
  const sameIdentity = (ctx: Context) => {
    const latest = editor.getEditorState();
    return latest.documentId === ctx.state.documentId && latest.generation === ctx.state.generation;
  };
  const sameDocument = (ctx: Context) =>
    editor.getEditorState().status === 'ready' && sameIdentity(ctx);
  const close = (restore: boolean, settledState?: ReturnType<HeadlessEditor['getEditorState']>) => {
    const previous = context;
    context = undefined;
    notify(() => previous?.view?.dispose());
    if (
      restore &&
      previous &&
      context === undefined &&
      !disposed &&
      sameDocument(previous) &&
      (settledState !== undefined
        ? editor.getEditorState() === settledState &&
          previous.rangeCapture?.settledCurrent() === true &&
          editor.getEditorState() === settledState &&
          !disposed &&
          context === undefined
        : editor.getEditorState().selection != null ||
          (previous.rangeCapture !== null && editor.getEditorState() === previous.state))
    )
      notify(options.onClose);
    if (!disposed) notify(options.onPresentationChange);
  };
  const invalid = (ctx: Context): string | null => {
    if (!ctx.language) return 'SelectFontLanguage';
    try {
      characterFontNameArgs(ctx.language === 'representative' ? 'hangul' : ctx.language, ctx.draft);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'InvalidFontName';
    }
  };
  const changed = (ctx: Context) => {
    if (!ctx.language) return false;
    return (ctx.language === 'representative' ? languages : [ctx.language]).some((language) => {
      const value = ctx.observation.fontNames[language];
      return value.kind !== 'single' || value.name !== ctx.draft;
    });
  };
  const reasonFor = (ctx: Context): string | null => {
    if (!ctx.language) return 'SelectFontLanguage';
    if (ctx.preparing) return 'FormattingPreparing';
    if (ctx.rangeCapture && !ctx.rangeCapture.hasSettlement) return 'SurfaceSettlementUnavailable';
    if (ctx.language !== 'representative')
      return ctx.observation.fontNameAvailableReasons[ctx.language];
    const denial = languages
      .map((language) => ctx.observation.fontNameAvailableReasons[language])
      .find((reason) => reason !== null);
    if (denial) return denial;
    if (ctx.rangeCapture) return ctx.rangeCapture.fontNamesAvailableReason;
    return ctx.preparing
      ? 'FormattingPreparing'
      : ctx.atomicReady
        ? null
        : 'AtomicFontNamesUnavailable';
  };
  const initialDraft = (observation: FontNameObservation, language: Context['language']) => {
    if (!language) return '';
    const values = (language === 'representative' ? languages : [language]).map(
      (id) => observation.fontNames[id],
    );
    const first = values[0];
    return first?.kind === 'single' &&
      first.name !== null &&
      values.every((value) => value.kind === 'single' && value.name === first.name)
      ? first.name
      : '';
  };
  const render = (ctx: Context) => {
    if (!active(ctx)) return;
    const reason = reasonFor(ctx);
    ctx.view?.update({
      languages,
      values: ctx.observation.fontNames,
      reasons: ctx.observation.fontNameAvailableReasons,
      representativeReason: reasonFor({ ...ctx, language: 'representative' }),
      language: ctx.language,
      draft: ctx.draft,
      suggestions:
        ctx.language === 'representative'
          ? [...new Set(languages.flatMap((language) => ctx.catalog.get(language) ?? []))]
          : ctx.language
            ? (ctx.catalog.get(ctx.language) ?? [])
            : [],
      pending: ctx.pending,
      refreshRequired: ctx.refreshRequired,
      reopenRequired: ctx.rangeConsumed && !ctx.pending,
      stale: stale(ctx),
      error: ctx.error,
      canApply:
        !ctx.pending &&
        !ctx.rangeConsumed &&
        !ctx.refreshRequired &&
        !stale(ctx) &&
        (ctx.observation.target !== null || ctx.rangeCapture !== null) &&
        reason === null &&
        invalid(ctx) === null &&
        changed(ctx),
    });
  };
  const cancel = (ctx: Context) => {
    if (!active(ctx) || ctx.pending || ctx.view?.isComposing()) return;
    close(true);
  };
  const apply = async (ctx: Context) => {
    if (
      !active(ctx) ||
      ctx.pending ||
      ctx.rangeConsumed ||
      ctx.refreshRequired ||
      ctx.view?.isComposing()
    )
      return;
    if (stale(ctx)) {
      ctx.error = 'StaleFontNameSelection';
      render(ctx);
      return;
    }
    const error = invalid(ctx);
    if (error) {
      ctx.error = error;
      render(ctx);
      return;
    }
    const language = ctx.language!;
    if ((!ctx.observation.target && !ctx.rangeCapture) || reasonFor(ctx) !== null || !changed(ctx))
      return;
    const target = ctx.observation.target;
    const name = ctx.draft;
    ctx.pending = true;
    ctx.error = null;
    render(ctx);
    notify(options.onPresentationChange);
    try {
      if (!active(ctx)) return;
      await editor.update(() => {});
      if (!active(ctx)) return;
      if (stale(ctx)) {
        ctx.error = 'StaleFontNameSelection';
        return;
      }
      const latest = ctx.rangeCapture ? ctx.observation : api.observe(editor.getEditorState());
      const latestReason =
        language === 'representative'
          ? (languages
              .map((id) => latest.fontNameAvailableReasons[id])
              .find((reason) => reason !== null) ?? null)
          : latest.fontNameAvailableReasons[language];
      if (latestReason !== null) {
        ctx.error = latestReason;
        return;
      }
      if (!active(ctx) || stale(ctx)) {
        ctx.error = 'StaleFontNameSelection';
        return;
      }
      if (ctx.rangeCapture) {
        if (!ctx.rangeCapture.hasSettlement) {
          ctx.error = 'SurfaceSettlementUnavailable';
          return;
        }
        const intent =
          language === 'representative'
            ? {
                kind: 'font-names' as const,
                names: Object.fromEntries(languages.map((id) => [id, name])) as Record<
                  CharacterFontLanguage,
                  string
                >,
              }
            : { kind: 'font-name' as const, language, name };
        if (
          !(await ctx.rangeCapture.prepare(intent)) ||
          !active(ctx) ||
          !ctx.rangeCapture.current()
        ) {
          ctx.error = 'StaleFontNameSelection';
          return;
        }
        ctx.rangeConsumed = true;
        if (!ctx.rangeCapture.request(intent)) {
          ctx.error = 'StaleFontNameSelection';
          return;
        }
        const settled = await ctx.rangeCapture.settle();
        if (!active(ctx)) return;
        const result = settled.result;
        const focusState = settled.current ? editor.getEditorState() : undefined;
        if (!result) {
          ctx.error = 'SurfaceFormattingSettlementUnknown';
          return;
        }
        notify(() => options.onResult?.(result));
        if (!active(ctx)) return;
        if (
          result.status === 'committed-refresh-required' ||
          (result.status === 'committed-with-snapshot' && !settled.current)
        ) {
          ctx.refreshRequired = true;
          ctx.error = 'FontNameRefreshRequired';
        } else if (
          (result.status === 'committed-with-snapshot' || result.status === 'known-no-op') &&
          settled.current &&
          !result.error
        ) {
          notify(() => options.onStatus('글꼴 이름을 적용했습니다.'));
          if (active(ctx)) close(true, focusState);
        } else
          ctx.error =
            result.error ??
            (result.status === 'known-no-op' && !settled.current
              ? 'SurfaceFormattingCurrentUnknown'
              : '글꼴 이름을 적용하지 못했습니다.');
        return;
      }
      if (!target) {
        ctx.error = 'MissingSelection';
        return;
      }
      let result: CommandResult;
      if (language === 'representative') {
        if (!options.atomicCharacterPort || !ctx.atomicObservation || !ctx.atomicReady) {
          ctx.error = 'AtomicFontNamesUnavailable';
          return;
        }
        const answer = await options.atomicCharacterPort.apply(
          ctx.atomicObservation,
          { atomic: { fonts: Object.fromEntries(languages.map((id) => [id, { name }])) } },
          () => active(ctx) && !stale(ctx),
        );
        if (answer.kind === 'rejected') {
          ctx.error = answer.error;
          return;
        }
        if (answer.kind === 'unchanged') {
          close(true);
          return;
        }
        result = answer.result;
      } else result = await editor.dispatchCommand(api.command, { target, language, name });
      if (!active(ctx)) return;
      notify(() => options.onResult?.(result));
      if (!active(ctx)) return;
      if (result.status === 'committed-refresh-required') {
        ctx.refreshRequired = true;
        ctx.error = 'FontNameRefreshRequired';
      } else if (result.status === 'committed-with-snapshot' || result.status === 'known-no-op') {
        notify(() => options.onStatus('글꼴 이름을 적용했습니다.'));
        if (active(ctx)) close(true);
      } else if (result.error) {
        ctx.error = result.error;
      } else ctx.error = '글꼴 이름을 적용하지 못했습니다.';
    } catch (error) {
      if (active(ctx)) ctx.error = error instanceof Error ? error.message : String(error);
    } finally {
      ctx.pending = false;
      if (active(ctx)) {
        render(ctx);
        notify(options.onPresentationChange);
      }
    }
  };
  const catalogFor = (state: Context['state']) => {
    const catalog = new Map<CharacterFontLanguage, string[]>();
    const seen = new Map<CharacterFontLanguage, Set<string>>();
    const rows = (state.content as { fontFaces?: unknown } | undefined)?.fontFaces;
    if (!Array.isArray(rows)) return catalog;
    for (const row of rows) {
      if (
        !row ||
        !languageSet.has(row.language) ||
        typeof row.name !== 'string' ||
        !row.name.length
      )
        continue;
      const language = row.language as CharacterFontLanguage;
      const names = seen.get(language) ?? new Set<string>();
      if (names.has(row.name)) continue;
      names.add(row.name);
      seen.set(language, names);
      const values = catalog.get(language) ?? [];
      values.push(row.name);
      catalog.set(language, values);
    }
    return catalog;
  };
  const unsubscribe = editor.registerStateListener(() => {
    const ctx = context;
    if (!ctx || disposed) return;
    const status = editor.getEditorState().status;
    if (
      !sameIdentity(ctx) ||
      (status !== 'ready' && !(ctx.pending && status === 'refresh-required'))
    )
      close(false);
    else render(ctx);
  });
  return {
    presentation(shared?: FormattingPresentation) {
      const state = editor.getEditorState();
      const surface = shared
        ? shared.state === state && shared.capture?.current()
          ? shared.capture
          : null
        : options.getSurfaceFormattingHost && state.status === 'ready' && state.selection == null
          ? captureSurfaceFormatting(
              editor,
              options.getSurfaceFormattingHost,
              state,
              api.observe(state),
            )
          : null;
      const surfaceReason = surface
        ? Object.values(surface.observation.fontNameAvailableReasons).find(
            (reason) => reason === null,
          ) === null
          ? null
          : 'FontNameUnavailable'
        : null;
      return {
        enabled:
          !disposed && !context?.pending && state.status === 'ready' && surfaceReason === null,
        surfaceSelection: surface !== null && surfaceReason === null,
        reason: context?.pending ? 'FontNamePending' : surfaceReason,
      };
    },
    open(initialLanguage: CharacterFontLanguage | 'representative' = 'representative') {
      if (disposed || editor.getEditorState().status !== 'ready') return false;
      if (context) {
        context.view?.show();
        return true;
      }
      const state = editor.getEditorState();
      let observation: FontNameObservation;
      let catalog: Context['catalog'];
      let rangeCapture: Context['rangeCapture'] = null;
      try {
        observation = api.observe(state);
        rangeCapture = captureSurfaceFormatting(
          editor,
          options.getSurfaceFormattingHost,
          state,
          observation,
        );
        if (rangeCapture) observation = rangeCapture.observation;
        if (
          !observation?.fontNames ||
          !observation.fontNameAvailableReasons ||
          observation.target === undefined ||
          languages.some(
            (id) =>
              !observation.fontNames[id] || observation.fontNameAvailableReasons[id] === undefined,
          )
        )
          throw Error('FontNameObservationUnavailable');
        catalog = catalogFor(state);
      } catch (error) {
        notify(() => options.onStatus(error instanceof Error ? error.message : String(error)));
        return false;
      }
      const ctx: Context = {
        surfaceBindingFailed: false,
        rangeConsumed: false,
        rangeCapture,
        state,
        observation,
        catalog,
        language:
          initialLanguage === 'representative' || languageSet.has(initialLanguage)
            ? initialLanguage
            : null,
        draft: initialDraft(observation, initialLanguage),
        atomicReady: false,
        preparing: false,
        pending: false,
        refreshRequired: false,
        error: null,
      };
      context = ctx;
      try {
        if (!ctx.rangeCapture && observation.target && options.atomicCharacterPort) {
          const atomicObservation = options.atomicCharacterPort.capture();
          if (atomicObservation.state === state) {
            ctx.atomicObservation = atomicObservation;
            ctx.preparing = true;
            void Promise.resolve()
              .then(() => options.atomicCharacterPort!.prepare(atomicObservation))
              .then(() => {
                if (!active(ctx) || stale(ctx)) return;
                const capability =
                  options.atomicCharacterPort!.atomic(atomicObservation)?.capability;
                ctx.atomicReady =
                  capability?.atomic === true &&
                  languages.every(
                    (language) =>
                      capability.fields[`character.fonts.${language}.name`]?.writable === true,
                  );
              })
              .catch((error) => {
                if (active(ctx)) ctx.error = error instanceof Error ? error.message : String(error);
              })
              .finally(() => {
                ctx.preparing = false;
                if (active(ctx)) notify(() => render(ctx));
              });
          }
        }
      } catch (error) {
        ctx.preparing = false;
        ctx.error = error instanceof Error ? error.message : String(error);
      }
      ctx.view = (options.createView ?? createFontNameView)(options.root, {
        onLanguage(value) {
          if (!active(ctx) || ctx.pending || ctx.refreshRequired || stale(ctx)) return;
          if (value === '') {
            ctx.language = null;
            ctx.draft = '';
            ctx.error = null;
            render(ctx);
            return;
          }
          if (value !== 'representative' && !languageSet.has(value)) {
            ctx.error = 'InvalidCharacterFontLanguage';
            render(ctx);
            return;
          }
          ctx.language = value as CharacterFontLanguage | 'representative';
          ctx.draft = initialDraft(observation, ctx.language);
          ctx.error = null;
          render(ctx);
        },
        onInput(value) {
          if (!active(ctx) || ctx.pending || ctx.refreshRequired || stale(ctx)) return;
          ctx.draft = value;
          ctx.error = invalid(ctx);
          render(ctx);
        },
        onApply: () => {
          void apply(ctx);
        },
        onCancel: () => cancel(ctx),
      });
      render(ctx);
      ctx.view.show();
      if (
        ctx.rangeCapture &&
        (!ctx.view.getDialogElement || !ctx.rangeCapture.bindDialog(ctx.view.getDialogElement()))
      ) {
        ctx.surfaceBindingFailed = true;
        ctx.error = 'StaleFontNameSelection';
      }
      if (ctx.rangeCapture && !ctx.surfaceBindingFailed) {
        ctx.preparing = true;
        const initial = ctx.rangeCapture;
        void initial
          .prepare()
          .then((ready) => {
            if (!active(ctx)) return;
            if (!ready || !initial.current()) {
              ctx.surfaceBindingFailed = true;
              ctx.error = 'StaleFontNameSelection';
            } else ctx.observation = initial.observation;
          })
          .catch((error) => {
            if (active(ctx)) ctx.error = error instanceof Error ? error.message : String(error);
          })
          .finally(() => {
            ctx.preparing = false;
            if (active(ctx)) {
              notify(() => render(ctx));
              if (active(ctx)) notify(options.onPresentationChange);
            }
          });
      }
      render(ctx);
      notify(options.onPresentationChange);
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        unsubscribe();
      } finally {
        close(false);
      }
    },
  };
}

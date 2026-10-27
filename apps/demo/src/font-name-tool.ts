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
  state: ReturnType<HeadlessEditor['getEditorState']>;
  observation: FontNameObservation;
  catalog: ReadonlyMap<CharacterFontLanguage, readonly string[]>;
  view?: FontNameView;
  language: CharacterFontLanguage | null;
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
  const stale = (ctx: Context) => editor.getEditorState() !== ctx.state;
  const sameIdentity = (ctx: Context) => {
    const latest = editor.getEditorState();
    return latest.documentId === ctx.state.documentId && latest.generation === ctx.state.generation;
  };
  const sameDocument = (ctx: Context) =>
    editor.getEditorState().status === 'ready' && sameIdentity(ctx);
  const close = (restore: boolean) => {
    const previous = context;
    context = undefined;
    notify(() => previous?.view?.dispose());
    if (
      restore &&
      previous &&
      context === undefined &&
      !disposed &&
      sameDocument(previous) &&
      editor.getEditorState().selection != null
    )
      notify(options.onClose);
    if (!disposed) notify(options.onPresentationChange);
  };
  const invalid = (ctx: Context): string | null => {
    if (!ctx.language) return 'SelectFontLanguage';
    try {
      characterFontNameArgs(ctx.language, ctx.draft);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'InvalidFontName';
    }
  };
  const changed = (ctx: Context) => {
    if (!ctx.language) return false;
    const value = ctx.observation.fontNames[ctx.language];
    return value.kind !== 'single' || value.name !== ctx.draft;
  };
  const render = (ctx: Context) => {
    if (!active(ctx)) return;
    const reason = ctx.language
      ? ctx.observation.fontNameAvailableReasons[ctx.language]
      : 'SelectFontLanguage';
    ctx.view?.update({
      languages,
      values: ctx.observation.fontNames,
      reasons: ctx.observation.fontNameAvailableReasons,
      language: ctx.language,
      draft: ctx.draft,
      suggestions: ctx.language ? (ctx.catalog.get(ctx.language) ?? []) : [],
      pending: ctx.pending,
      refreshRequired: ctx.refreshRequired,
      stale: stale(ctx),
      error: ctx.error,
      canApply:
        !ctx.pending &&
        !ctx.refreshRequired &&
        !stale(ctx) &&
        ctx.observation.target !== null &&
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
    if (!active(ctx) || ctx.pending || ctx.refreshRequired || ctx.view?.isComposing()) return;
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
    if (
      !ctx.observation.target ||
      ctx.observation.fontNameAvailableReasons[language] !== null ||
      !changed(ctx)
    )
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
      const latest = api.observe(editor.getEditorState());
      if (latest.fontNameAvailableReasons[language] !== null) {
        ctx.error = latest.fontNameAvailableReasons[language];
        return;
      }
      if (!active(ctx) || stale(ctx)) {
        ctx.error = 'StaleFontNameSelection';
        return;
      }
      const result = await editor.dispatchCommand(api.command, { target, language, name });
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
    presentation() {
      return {
        enabled: !disposed && !context?.pending && editor.getEditorState().status === 'ready',
        reason: context?.pending ? 'FontNamePending' : null,
      };
    },
    open() {
      if (disposed || editor.getEditorState().status !== 'ready') return false;
      if (context) {
        context.view?.show();
        return true;
      }
      const state = editor.getEditorState();
      let observation: FontNameObservation;
      let catalog: Context['catalog'];
      try {
        observation = api.observe(state);
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
        state,
        observation,
        catalog,
        language: null,
        draft: '',
        pending: false,
        refreshRequired: false,
        error: null,
      };
      context = ctx;
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
          if (!languageSet.has(value)) {
            ctx.error = 'InvalidCharacterFontLanguage';
            render(ctx);
            return;
          }
          ctx.language = value as CharacterFontLanguage;
          const current = observation.fontNames[ctx.language];
          ctx.draft = current.kind === 'single' && current.name !== null ? current.name : '';
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

import { getSelectionFormatting, type HeadlessEditor } from "@hwpjs/core";
import type {
  createFormattingBridge,
  FormattingDialogObservation,
  FormattingDialogPatch,
} from "./formatting-bridge.ts";
import {
  createFormattingDialogView,
  type FormattingDialogField,
} from "./formatting-dialog-view.ts";
import type { DemoAction, DemoCommand, ActionAvailability } from "./shell-contract.ts";
type State = ReturnType<HeadlessEditor["getEditorState"]>;
export interface FormattingDialogControllerOptions {
  readonly root: HTMLElement;
  readonly port: Pick<ReturnType<typeof createFormattingBridge>, "captureDialog" | "applyDialog">;
  readonly getState: () => State;
  readonly subscribe: (listener: (state: State) => void) => () => void;
  readonly onStatus: (message: string) => void;
  readonly onClose?: () => void;
  readonly onPresentationChange?: () => void;
  /** Dedicated unit boundary. Production always uses the common DOM view. */
  readonly createView?: typeof createFormattingDialogView;
}
/** Frozen-target dialog lifecycle. It never writes selection or calls Native directly. */
export function createFormattingDialogController({
  root,
  port,
  getState,
  subscribe,
  onStatus,
  onClose,
  onPresentationChange,
  createView = createFormattingDialogView,
}: FormattingDialogControllerOptions) {
  let closed = false,
    pending = false,
    stale = false,
    epoch = 0;
  let observation: FormattingDialogObservation | undefined,
    view: ReturnType<typeof createFormattingDialogView> | undefined;
  let properties: { size?: number; bold?: boolean; italic?: boolean } = {},
    alignment: string | undefined;
  const sameRange = (
    a: ReturnType<typeof getSelectionFormatting>["target"],
    b: ReturnType<typeof getSelectionFormatting>["target"],
  ) =>
    !!a &&
    !!b &&
    a.owner === b.owner &&
    a.section === b.section &&
    a.paragraph === b.paragraph &&
    a.startUnit === b.startUnit &&
    a.endUnit === b.endUnit;
  const canRestore = (captured: FormattingDialogObservation) => {
    const latest = getState();
    return (
      !closed &&
      latest.status === "ready" &&
      latest.documentId === captured.state.documentId &&
      latest.generation === captured.state.generation &&
      sameRange(captured.formatting.target, getSelectionFormatting(latest).target) &&
      !root.ownerDocument.querySelector("dialog:modal")
    );
  };
  const notify = () => {
    if (!closed) onPresentationChange?.();
  };
  const close = (restore: boolean) => {
    const captured = observation;
    epoch++;
    view?.destroy();
    view = undefined;
    observation = undefined;
    properties = {};
    alignment = undefined;
    stale = false;
    notify();
    if (restore && captured && canRestore(captured)) onClose?.();
  };
  const dismiss = () => {
    if (view?.isComposing()) return;
    if (pending) {
      view?.setStatus("확인을 접수했습니다. 적용 결과를 기다려주세요.");
      return;
    }
    close(true);
  };
  const fieldChanged = (
    field: FormattingDialogField,
    value: number | boolean | string | undefined,
  ) => {
    if (!observation || pending || stale || closed) return;
    if (field === "alignment")
      alignment =
        value === undefined || value === observation.fields.alignment.value
          ? undefined
          : String(value);
    else if (value === undefined || value === observation.fields[field].value)
      delete properties[field];
    else (properties as Record<string, unknown>)[field] = value;
    view?.setStatus("확인을 누르면 변경한 항목을 적용합니다.");
  };
  const apply = async () => {
    if (closed || pending || stale || !view || !observation || view.isComposing()) return;
    const currentEpoch = epoch,
      captured = observation;
    pending = true;
    view.setPending(true);
    view.setStatus("고정한 대상에 적용 중…");
    const patch: FormattingDialogPatch =
      captured.kind === "character"
        ? { kind: "character", properties: { ...properties } }
        : { kind: "paragraph", ...(alignment === undefined ? {} : { alignment }) };
    try {
      const request = port.applyDialog(captured, patch);
      notify();
      const answer = await request;
      if (closed || epoch !== currentEpoch) return;
      if (answer.kind === "unchanged") {
        onStatus("변경한 서식이 없습니다.");
        close(true);
        return;
      }
      if (answer.kind === "rejected") {
        view?.setStatus(answer.error);
        if (getState() !== captured.state) {
          stale = true;
          view?.setStale("선택 또는 문서 상태가 바뀌었습니다. 닫고 다시 열어주세요.");
        }
        return;
      }
      const result = answer.result;
      if (result.status === "committed-with-snapshot" || result.status === "known-no-op") {
        onStatus(
          result.status === "known-no-op"
            ? "서식이 이미 같습니다."
            : "고정한 선택 범위에 서식을 적용했습니다.",
        );
        close(true);
      } else {
        view?.setStatus(result.error ?? result.status);
        if (result.status === "committed-refresh-required" || getState() !== captured.state) {
          stale = true;
          view?.setStale("적용 결과를 다시 조회해야 합니다. 닫고 문서 상태를 확인해주세요.");
        }
      }
    } catch (error) {
      if (!closed && epoch === currentEpoch)
        view?.setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      pending = false;
      if (!closed && epoch === currentEpoch) {
        view?.setPending(false);
        notify();
      }
    }
  };
  const unsubscribe = subscribe((state) => {
    if (closed || pending || !view || !observation || state === observation.state) return;
    stale = true;
    view.setStale("선택 또는 문서 상태가 바뀌었습니다. 닫고 다시 열어주세요.");
    notify();
  });
  const presentation = (): Partial<Record<DemoCommand, ActionAvailability>> => {
    const captured = port.captureDialog("character");
    const reason = closed
      ? "FormattingDialogDisposed"
      : view
        ? "FormattingDialogOpen"
        : captured.state.status !== "ready"
          ? "EditorNotReady"
          : !captured.formatting.target
            ? "MissingSelection"
            : undefined;
    // A readonly/caret target may open an honest disabled observation dialog.
    return {
      "character-properties": { enabled: !reason, reason },
      "paragraph-properties": { enabled: !reason, reason },
    };
  };
  return {
    presentation,
    action(action: DemoAction): boolean {
      if (action.command !== "character-properties" && action.command !== "paragraph-properties")
        return false;
      if (closed) return true;
      if (view) {
        view.focus();
        return true;
      }
      if (root.ownerDocument.querySelector("dialog:modal")) {
        onStatus("다른 대화상자를 먼저 닫아주세요.");
        return true;
      }
      if (!presentation()[action.command]?.enabled) {
        onStatus(presentation()[action.command]?.reason ?? "MissingSelection");
        return true;
      }
      observation = port.captureDialog(
        action.command === "character-properties" ? "character" : "paragraph",
      );
      epoch++;
      stale = false;
      properties = {};
      alignment = undefined;
      view = createView(root, {
        observation,
        onField: fieldChanged,
        onApply: () => {
          void apply();
        },
        onDismiss: dismiss,
      });
      view.show();
      notify();
      return true;
    },
    dispose() {
      if (closed) return;
      closed = true;
      unsubscribe();
      close(false);
    },
  };
}

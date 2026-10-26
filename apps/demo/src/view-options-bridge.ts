import type { DemoHost } from "./demo-controller.ts";
import type { DemoAction, DemoCommand, ActionAvailability } from "./shell-contract.ts";
/** Paint preferences only. No editor, selection, runtime or save port is held here. */
export function createViewOptionsBridge({
  getHost,
  onStatus,
}: {
  getHost: () => DemoHost | undefined;
  onStatus: (message: string) => void;
}) {
  let closed = false;
  const observe = () => {
    try {
      const host = getHost(),
        value = host?.getDisplayOptions?.();
      return host?.setDisplayOptions && typeof value?.paragraphMarks === "boolean"
        ? { host, value }
        : null;
    } catch {
      return null;
    }
  };
  return {
    presentation(ready: boolean): Partial<Record<DemoCommand, ActionAvailability>> {
      const current = observe();
      const reason = closed
        ? "종료된 보기 도구입니다."
        : !ready
          ? "문서를 먼저 열어주세요."
          : !current
            ? "Canvas 표시 정책이 연결되지 않았습니다."
            : undefined;
      return {
        "toggle-paragraph-marks": {
          enabled: !reason,
          reason,
          pressed: reason ? undefined : current!.value.paragraphMarks,
        },
      };
    },
    action(action: DemoAction): boolean {
      if (action.command !== "toggle-paragraph-marks") return false;
      if (closed) return true;
      const current = observe();
      if (!current) {
        onStatus("Canvas 표시 상태를 확인할 수 없습니다.");
        return true;
      }
      try {
        if (current.host.setDisplayOptions!({ paragraphMarks: !current.value.paragraphMarks }))
          current.host.focus?.();
        else onStatus("문단 부호 표시 설정을 적용하지 못했습니다.");
      } catch (error) {
        onStatus(error instanceof Error ? error.message : String(error));
      }
      return true;
    },
    dispose() {
      closed = true;
    },
  };
}

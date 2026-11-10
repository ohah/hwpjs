import type { DemoHost } from './demo-controller.ts';
import type { DemoAction, DemoCommand, ActionAvailability } from './shell-contract.ts';
/** 표시 설정만 소유하며 편집·선택·런타임·저장 포트는 소유하지 않습니다. */
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
      return host?.setDisplayOptions && typeof value?.paragraphMarks === 'boolean'
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
        ? '종료된 보기 도구입니다.'
        : !ready
          ? '문서를 먼저 열어주세요.'
          : !current
            ? 'Canvas 표시 정책이 연결되지 않았습니다.'
            : undefined;
      const marksReason =
        reason ??
        (typeof current?.value.formattingMarks === 'boolean'
          ? undefined
          : '조판 부호 표시 정책이 연결되지 않았습니다.');
      const paragraphReason =
        reason ??
        (current?.value.formattingMarks === true
          ? '조판 부호를 끄면 문단 부호를 따로 설정할 수 있습니다.'
          : undefined);
      const gridReason =
        reason ??
        (typeof current?.value.showTableGrid === 'boolean'
          ? undefined
          : '표 격자 표시 정책이 연결되지 않았습니다.');
      return {
        'toggle-grid': {
          enabled: !gridReason,
          reason: gridReason,
          pressed: gridReason ? undefined : current!.value.showTableGrid,
        },
        'toggle-marks': {
          enabled: !marksReason,
          reason: marksReason,
          pressed: marksReason ? undefined : current!.value.formattingMarks,
        },
        'toggle-paragraph-marks': {
          enabled: !paragraphReason,
          reason: paragraphReason,
          pressed: reason
            ? undefined
            : current!.value.paragraphMarks || current!.value.formattingMarks === true,
        },
      };
    },
    action(action: DemoAction): boolean {
      if (
        action.command !== 'toggle-paragraph-marks' &&
        action.command !== 'toggle-marks' &&
        action.command !== 'toggle-grid'
      )
        return false;
      if (closed) return true;
      const current = observe();
      if (
        !current ||
        (action.command === 'toggle-marks' && typeof current.value.formattingMarks !== 'boolean') ||
        (action.command === 'toggle-grid' && typeof current.value.showTableGrid !== 'boolean')
      ) {
        onStatus('Canvas 표시 상태를 확인할 수 없습니다.');
        return true;
      }
      if (action.command === 'toggle-paragraph-marks' && current.value.formattingMarks === true) {
        onStatus('조판 부호를 끄면 문단 부호를 따로 설정할 수 있습니다.');
        return true;
      }
      try {
        const next = {
          ...current.value,
          ...(action.command === 'toggle-grid'
            ? { showTableGrid: !current.value.showTableGrid }
            : action.command === 'toggle-marks'
              ? { formattingMarks: !current.value.formattingMarks }
              : { paragraphMarks: !current.value.paragraphMarks }),
        };
        if (current.host.setDisplayOptions!(next)) {
          current.host.focus?.();
          if (action.command === 'toggle-marks' && next.formattingMarks)
            onStatus('조판 부호 일부 표시: 본문과 원본 표 셀의 공백·탭·줄바꿈을 표시합니다.');
        } else onStatus('표시 설정을 적용하지 못했습니다.');
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

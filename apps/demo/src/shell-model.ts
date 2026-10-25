import type { ActionAvailability, DemoCommand, DemoShellState } from "./shell-contract.ts";
import { resolveCommandSupport, type CommandSupportContext } from "./command-support.ts";
export function actionAvailability(state: DemoShellState, command: DemoCommand, connected: boolean, context: CommandSupportContext = {}): ActionAvailability {
  return resolveCommandSupport(command, {
    ...context, busy: state.busy || context.busy,
    // A generic onAction callback is not evidence of a per-command bridge.
    connected: connected && state.actions?.[command] !== undefined,
    availability: state.actions?.[command],
  });
}
export function openAvailability(value: ActionAvailability | undefined, busy: boolean | undefined, connected: boolean): ActionAvailability {
  if (!connected) return { enabled: false, reason: "파일 열기 연결이 아직 제공되지 않았습니다." };
  if (busy) return { enabled: false, reason: "진행 중인 작업이 끝난 뒤 사용하세요." };
  return value?.enabled === true ? value : { enabled: false, reason: value?.reason || "현재 파일을 열 수 없습니다." };
}
export function demoRoute(path: string): string {
  // Same-origin absolute paths, including query-based actual example routes.
  if (!path.startsWith("/") || path.startsWith("//") || /[\\\s\u0000-\u001f]/.test(path) || path.includes("#")) throw new TypeError("InvalidDemoRoute");
  return path;
}
export function fontSizePoints(value: string): number | null {
  if (!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(value)) return null;
  const points = Number(value);
  return Number.isFinite(points) && points > 0 && points <= 4096 ? points : null;
}

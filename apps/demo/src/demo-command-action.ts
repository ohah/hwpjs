import { DEMO_COMMANDS } from './command-support.ts';
import type { DemoAction, DemoCommand } from './shell-contract.ts';
const commandIds: ReadonlySet<string> = new Set(DEMO_COMMANDS);
function knownCommand(value: string): value is DemoCommand {
  return commandIds.has(value);
}
/** command만 가진 메뉴/단축키는 추가 수치 payload를 위조하지 않는다. */
export function demoCommandAction(command: string): DemoAction | null {
  if (!knownCommand(command) || command === 'set-font-size' || command === 'set-zoom') return null;
  if (command === 'font-name') return { command };
  return { command };
}

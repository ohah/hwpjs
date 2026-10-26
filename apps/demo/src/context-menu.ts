import type { DemoAction, DemoCommand, DemoShellState } from "./shell-contract.ts";
import { DEMO_COMMAND_REGISTRY } from "./command-support.ts";
import { actionAvailability } from "./shell-model.ts";
// @ts-ignore Shared accessible menu implementation; permissions stay in the public API bridge.
import { createDocumentContextMenu } from "../../../web/preview/document-context-menu.mjs";

type ContextCommand = Exclude<DemoCommand, "set-font-size" | "set-zoom">;
const commands: readonly ContextCommand[] = [
  "undo",
  "redo",
  "cut",
  "copy",
  "paste",
  "find",
  "replace",
  "bold",
  "italic",
  "underline",
  "strike",
  "character-properties",
  "paragraph-properties",
  "object-properties",
  "word-count",
];
export function mountDemoContextMenu(options: {
  root: HTMLElement;
  getState: () => DemoShellState;
  execute: (action: DemoAction) => void | Promise<void>;
  subscribe: (listener: () => void) => () => void;
  onError: (error: unknown) => void;
}) {
  const ids = new Set<string>(commands);
  return createDocumentContextMenu({
    document: options.root.ownerDocument,
    targets: [options.root],
    commandIds: [...commands],
    registry: {
      commands: () => {
        const state = options.getState();
        return commands.map((id) => {
          const value = actionAvailability(state, id, true);
          return {
            id,
            label: DEMO_COMMAND_REGISTRY[id].label,
            enabled: value.enabled,
            reason: value.reason,
            pressed: value.pressed === undefined ? undefined : String(value.pressed),
          };
        });
      },
      execute: (id: string) => {
        if (!ids.has(id)) return;
        try {
          void Promise.resolve(options.execute({ command: id as ContextCommand })).catch(
            options.onError,
          );
        } catch (error) {
          options.onError(error);
        }
      },
      subscribe: options.subscribe,
    },
  });
}

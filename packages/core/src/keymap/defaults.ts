import defaults from "./defaults.json";
import { parseKeymapConfig } from "./config.ts";
/** Single JSON source for the default command bindings and their localized names. */
export const DEFAULT_KEYMAP = parseKeymapConfig(defaults);

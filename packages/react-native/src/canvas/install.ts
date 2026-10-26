import { Platform, TurboModuleRegistry } from 'react-native';
import type { NativeJsiContextBinding } from './context-port.ts';
declare global {
  var hwpNativeCanvasBinding: NativeJsiContextBinding | undefined;
}
/** RN installs this module's JSI bindings into the current Hermes runtime. */
export function getNativeCanvasBinding(): NativeJsiContextBinding {
  if (Platform.OS !== 'ios') throw Error('HwpJSCanvasIOSOnly');
  TurboModuleRegistry.getEnforcing('HwpCanvasContext');
  const binding = globalThis.hwpNativeCanvasBinding;
  if (
    !binding ||
    binding.contextProtocol !== 'hwpjs.native-context/1' ||
    typeof binding.createContextPort !== 'function'
  )
    throw Error('NativeCanvasBindingNotInstalled');
  return binding;
}

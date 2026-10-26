import React, { useRef } from 'react';
import {
  Platform,
  requireNativeComponent,
  TurboModuleRegistry,
  type ViewProps,
} from 'react-native';
const Surface =
  Platform.OS === 'ios'
    ? requireNativeComponent<ViewProps & { surfaceId: string }>('HwpNativeCanvas')
    : null;
declare global {
  var __hwpNativeCanvasCreateHost: undefined | ((surfaceId: string) => unknown);
}
let nextSurface = 0;
/** Explicit source-consumer component. Mounting never claims full layout/IME. */
export function NativeCanvasView({
  onHost,
  ...props
}: ViewProps & { onHost: (host: unknown) => void }) {
  if (Platform.OS !== 'ios' || !Surface) throw Error('HwpJSCanvasIOSOnly');
  const identity = useRef('hwp-native-canvas-' + ++nextSurface).current;
  const initialized = useRef(false);
  return (
    <Surface
      {...props}
      surfaceId={identity}
      onLayout={(event) => {
        props.onLayout?.(event);
        if (initialized.current) return;
        TurboModuleRegistry.getEnforcing('HwpNativeCanvasData');
        if (!globalThis.__hwpNativeCanvasCreateHost) throw Error('CanvasHostNotInstalled');
        initialized.current = true;
        onHost(globalThis.__hwpNativeCanvasCreateHost(identity));
      }}
    />
  );
}

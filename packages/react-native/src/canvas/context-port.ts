import type { NativeContextPort } from './context-protocol.ts';
import { NativeBackendUnavailableError } from '../native/transport.ts';

/** Explicit product JSI binding: raw format-native port, no display projection. */
export interface NativeJsiContextBinding {
  readonly contextProtocol: 'hwpjs.native-context/1';
  createContextPort(): NativeContextPort;
}
export function createNativeContextPort(binding?: NativeJsiContextBinding): NativeContextPort {
  if (!binding) throw new NativeBackendUnavailableError();
  if (
    binding.contextProtocol !== 'hwpjs.native-context/1' ||
    typeof binding.createContextPort !== 'function'
  )
    throw Error('NativeContextProtocolMismatch');
  // C++ captures immutable native tokens and copies input before enqueue. Tokens
  // stay inside this port/provider; never serialize HostObjects into core DTOs.
  return binding.createContextPort();
}

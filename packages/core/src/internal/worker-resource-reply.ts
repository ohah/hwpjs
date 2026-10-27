import type { RuntimeReply } from '../contracts.ts';
import { isOwnedImmutableObservation } from '../state/owned.ts';

/** 소유 관측의 copy-on-access 버퍼만 전송하며 Native backing은 건드리지 않습니다. */
export function workerResourceReply(
  id: number,
  requestKind: string,
  reply: RuntimeReply,
): {
  envelope: { id: number; reply: RuntimeReply };
  transfer?: ArrayBuffer[];
} {
  if (
    !isOwnedImmutableObservation(reply) ||
    reply.kind !== requestKind ||
    !['picture-bytes', 'table-background-bytes'].includes(reply.kind) ||
    reply.error !== undefined ||
    typeof Object.getOwnPropertyDescriptor(reply, 'bytes')?.get !== 'function'
  )
    return { envelope: { id, reply } };

  // ownObservation의 getter는 숨겨진 backing과 분리된 새 사본을 반환합니다.
  // 여기서 한 번만 읽고 wire 객체를 만들므로 postMessage가 getter를 다시 읽지 않습니다.
  const wire = { ...reply };
  const bytes = wire.bytes;
  if (
    bytes instanceof Uint8Array &&
    bytes.buffer instanceof ArrayBuffer &&
    bytes.byteOffset === 0 &&
    bytes.byteLength === bytes.buffer.byteLength
  )
    return { envelope: { id, reply: wire }, transfer: [bytes.buffer] };
  return { envelope: { id, reply: wire } };
}

/** 기존 호스트 descriptor 판정의 타입 경계다. Native 권한을 발급하지 않는다. */
export const HOST_EPOCH_KEYS: readonly ['geometryMeasurementEpoch', 'resourceProviderEpoch'];
export type HostEpochKey = (typeof HOST_EPOCH_KEYS)[number];
/** 부재는 undefined, descriptor 불일치·예외는 null, 성공은 호스트의 원 반환값이다. */
export function createHostEpochReaders(
  environment: object,
): Readonly<Record<HostEpochKey, () => unknown>>;

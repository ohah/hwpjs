# EMF+ SetRenderingOrigin record

## 범위와 단일 출처

`src/image/emf/emf_plus_set_rendering_origin.zig`는 MS-EMFPLUS 2.3.6.6의 EmfPlusSetRenderingOrigin wire 구조를 소유합니다. 공통 `emf_plus_record.zig`가 12바이트 record 머리와 comment 내부 framing을 담당하고, 전용 parser는 고정 payload와 signed 좌표만 해석합니다. stream과 상위 EMF framing은 payload 필드 배치를 다시 구현하지 않습니다.

Type은 `0x401d`, Size는 정확히 20, DataSize와 실제 data slice는 각각 정확히 8바이트여야 합니다. `x`, `y`는 little-endian signed i32이며 최솟값과 최댓값을 포함한 전체 범위를 보존합니다. Flags는 SHOULD zero이지만 MUST be ignored이므로 모든 u16을 승인하고 원값을 반환합니다.

## stream 연결과 미지원 경계

`emf_plus_stream.zig`는 record를 전용 parser로 검증한 뒤 유효 record 수를 보고합니다. payload 오류와 집계 overflow는 comment 전체 상태를 원복하고, 실제 EMF comment 경로도 같은 parser를 통과합니다.

명세상 rendering origin은 hatch brush와 8/16-bpp dither pattern에 적용됩니다. 현재 계층은 그래픽 replay state, hatch/dither rasterization, Save/Restore 상호작용, 렌더링과 저장을 구현하지 않습니다. 단순 wire 파싱과 report count를 상태 적용 완료로 확대하지 않습니다. 로컬 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 출력과의 동등성도 주장하지 않습니다.

## 검증 기록

합성 fixture는 i32 양 끝, 서로 다른 x/y 값, 비zero Flags, 0~7바이트 모든 잘림과 9바이트 초과, 독립 Size/DataSize/slice 불일치, 잘못된 RecordType, stream 정상·payload 오류·count overflow 원자성과 실제 EMF framing 연결을 검사합니다.

RecordType, Size, DataSize, 실제 slice, 비zero Flags 거부, Flags 반환 손실, x/y 순서 교환, stream routing, payload parser 우회, report 대상과 overflow를 각각 망가뜨린 11개 유효 의미 변이를 독립 복사본에 주입했습니다. 변이·모드마다 local/global cache를 분리하고 120초 watchdog을 적용한 Debug·ReleaseSafe·ReleaseFast 총 33/33회를 모두 검출했습니다. 33개 로그를 별도로 재분류해 모두 assertion 또는 expected-error 실패이며 컴파일 오류·panic·시간 초과가 없음을 확인했습니다. 결과와 로그는 `/tmp/hwpjs-emfplus-set-rendering-origin-mutants.9kcBpK`입니다.

최종 제품 트리의 전체 `audit`를 Debug·ReleaseSafe·ReleaseFast 순서로 실행했습니다. 세 모드 모두 40/40 단계와 1,716/1,716 테스트(네이티브 1,677, 차트 31, WMF 8), HWP 감사 8,905,827 checks, WASM imports 0으로 통과했습니다. 로그는 `/tmp/hwpjs-emfplus-set-rendering-origin-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.

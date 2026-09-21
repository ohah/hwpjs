# EMF+ SetTextContrast record

## 범위와 단일 출처

`src/image/emf/emf_plus_set_text_contrast.zig`는 MS-EMFPLUS 2.3.6.7의 EmfPlusSetTextContrast record를 소유합니다. Type은 `0x4020`, Size는 정확히 12, DataSize와 실제 data slice는 0이어야 합니다.

Flags 하위 12비트는 gamma correction 값에 1000을 곱한 TextContrast이고 허용 범위는 1000–2200을 양 끝 포함합니다. 상위 4비트는 reserved이며 MUST be ignored이므로 어떤 조합도 승인하고 전체 Flags 원값을 보존합니다. 범위 상수와 추출은 전용 parser 한 곳에만 둡니다.

MS-EMFPLUS 2.3.8의 terminal-server payload에도 TextContrast라는 2바이트 필드가 있지만 그 범위는 0–12이고 단위도 이 property record와 다릅니다. 이름만 같다는 이유로 두 계약을 합치거나 보정하지 않습니다.

## stream 연결과 미지원 경계

`emf_plus_stream.zig`는 전용 parser 검증 뒤 유효 record 수를 보고합니다. range·payload·집계 오류는 comment 전체 상태를 원복하고 실제 EMF framing도 같은 경로를 사용합니다.

tracked stream은 [공용 property 상태](emf-plus-property-state.md)에 값을 적용하고 Save/Container 수명주기와 report에 연결합니다. 실제 gamma correction, glyph rasterization과 저장은 미구현입니다. 로컬 HWP corpus에는 EMF+ signature 표본이 없어 한컴 텍스트 출력과의 동등성도 주장하지 않습니다.

## 검증 기록

합성 fixture는 1000·1500·2200, 범위 밖 999·2201·4095, 모든 reserved bits set, 잘못된 RecordType, 독립 Size/DataSize/slice 불일치, stream 정상·range 오류·count overflow 원자성과 실제 EMF framing 연결을 검사합니다.

RecordType, Size/DataSize/실제 slice, 12비트 mask, 하한·상한 각각의 완화와 강화, Flags 반환, reserved bits 거부, stream routing, payload parser 우회, report 대상과 overflow를 각각 망가뜨린 15개 유효 의미 변이를 독립 복사본에 주입했습니다. 변이·모드별 local/global cache와 120초 watchdog 아래 Debug·ReleaseSafe·ReleaseFast 총 45/45회를 모두 검출했습니다. 45개 로그를 재분류해 모두 assertion 또는 expected-error 실패이며 컴파일 오류·panic·시간 초과가 없음을 확인했습니다. 결과는 `/tmp/hwpjs-emfplus-set-text-contrast-mutants.BRAFpR`입니다.

최종 제품 트리의 전체 `audit`를 Debug·ReleaseSafe·ReleaseFast 순서로 실행했습니다. 세 모드 모두 40/40 단계와 1,730/1,730 테스트(네이티브 1,691, 차트 31, WMF 8), HWP 감사 8,905,827 checks, WASM imports 0으로 통과했습니다. 로그는 `/tmp/hwpjs-emfplus-set-text-contrast-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.

# EMF+ SetInterpolationMode record

## 범위와 단일 출처

`src/image/emf/emf_plus_set_interpolation_mode.zig`는 MS-EMFPLUS 2.3.6.4의 EmfPlusSetInterpolationMode record를 조립합니다. `emf_plus_interpolation_mode.zig`는 MS-EMFPLUS 2.1.1.16의 InterpolationMode 0~7을 소유하며 record parser는 enum domain을 복제하지 않습니다.

Type은 `0x4021`, Size는 정확히 12, DataSize와 실제 data slice는 0이어야 합니다. Flags low byte가 InterpolationMode이고 high byte는 reserved입니다. reserved bits는 MUST be ignored이므로 모두 승인하고 전체 Flags 원값을 보존합니다. enum은 Default 0, LowQuality 1, HighQuality 2, Bilinear 3, Bicubic 4, NearestNeighbor 5, HighQualityBilinear 6, HighQualityBicubic 7만 승인합니다.

공식 3.2.32.3과 3.2.32.13의 예제는 모두 Flags `0x0007`을 HighQualityBicubic으로 명시합니다. 따라서 low byte를 이동 없이 직접 해석합니다.

## stream 연결과 미지원 경계

`emf_plus_stream.zig`는 전용 parser를 호출한 뒤 유효 record 수를 보고합니다. enum·payload·집계 오류는 comment 전체 상태를 원복하고 실제 EMF framing도 같은 경로를 사용합니다.

Default/LowQuality/HighQuality 별칭을 해당 구체 모드로 정규화하지 않고 wire enum을 그대로 보존합니다. tracked stream은 [공용 property 상태](emf-plus-property-state.md)와 Save/Container 수명주기에 값을 적용합니다. 실제 image scaling, resampling filter, color-space 처리와 저장은 미구현입니다. 로컬 HWP corpus에는 EMF+ signature 표본이 없어 한컴 렌더링과의 동등성도 주장하지 않습니다.

## 검증 기록

합성 fixture는 여덟 InterpolationMode, 모든 reserved bits set, 공식 Flags `0x0007`, enum 8·255, 잘못된 RecordType, 독립 Size/DataSize/slice 불일치, stream 정상·enum 오류·count overflow 원자성과 실제 EMF framing 연결을 검사합니다.

InterpolationMode domain, RecordType, Size/DataSize/실제 slice, 잘못된 1비트 shift, high-byte 오독, Flags 반환, reserved bits 거부, stream routing, payload parser 우회, report 대상과 overflow를 각각 망가뜨린 13개 유효 의미 변이를 독립 복사본에 주입했습니다. 변이·모드별 local/global cache와 120초 watchdog 아래 Debug·ReleaseSafe·ReleaseFast 총 39/39회를 모두 검출했습니다. 39개 로그를 재분류해 모두 assertion 또는 expected-error 실패이며 컴파일 오류·panic·시간 초과가 없음을 확인했습니다. 결과는 `/tmp/hwpjs-emfplus-set-interpolation-mode-mutants.0WXIsp`입니다.

최종 제품 트리의 전체 `audit`를 Debug·ReleaseSafe·ReleaseFast 순서로 실행했습니다. 세 모드 모두 40/40 단계와 1,735/1,735 테스트(네이티브 1,696, 차트 31, WMF 8), HWP 감사 8,905,827 checks, WASM imports 0으로 통과했습니다. 로그는 `/tmp/hwpjs-emfplus-set-interpolation-mode-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.

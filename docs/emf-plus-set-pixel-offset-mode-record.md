# EMF+ SetPixelOffsetMode record

## 범위와 단일 출처

`src/image/emf/emf_plus_set_pixel_offset_mode.zig`는 MS-EMFPLUS 2.3.6.5의 EmfPlusSetPixelOffsetMode record를 조립합니다. `emf_plus_pixel_offset_mode.zig`는 MS-EMFPLUS 2.1.1.25의 PixelOffsetMode 0~4를 소유하며 record parser는 enum domain을 복제하지 않습니다.

Type은 `0x4022`, Size는 정확히 12, DataSize와 실제 data slice는 0이어야 합니다. Flags low byte가 PixelOffsetMode이고 high byte는 reserved입니다. reserved bits는 MUST be ignored이므로 모두 승인하고 전체 Flags 원값을 보존합니다. enum은 Default 0, HighSpeed 1, HighQuality 2, None 3, Half 4만 승인합니다.

공식 3.2.32.4와 3.2.32.14의 예제는 모두 Flags `0x0003`을 PixelOffsetModeNone으로 명시합니다. 따라서 low byte를 이동 없이 직접 해석합니다.

## stream 연결과 미지원 경계

`emf_plus_stream.zig`는 전용 parser를 호출한 뒤 유효 record 수를 보고합니다. enum·payload·집계 오류는 comment 전체 상태를 원복하고 실제 EMF framing도 같은 경로를 사용합니다.

Default/HighSpeed/HighQuality 별칭을 None/Half로 정규화하지 않고 wire enum을 그대로 보존합니다. 실제 pixel-center 이동, rasterization, graphics state replay, Save/Restore와 저장은 미구현입니다. 로컬 HWP corpus에는 EMF+ signature 표본이 없어 한컴 렌더링과의 동등성도 주장하지 않습니다.

## 검증 기록

합성 fixture는 다섯 PixelOffsetMode, 모든 reserved bits set, 공식 Flags `0x0003`, enum 5·255, 잘못된 RecordType, 독립 Size/DataSize/slice 불일치, stream 정상·enum 오류·count overflow 원자성과 실제 EMF framing 연결을 검사합니다.

13개 의미 변이(enum domain, RecordType, Size/DataSize/slice, low-byte shift/high-byte 오독, Flags 원값 손실, reserved 거부, stream 오라우팅, parser 오류 우회, report 오집계, wrapping overflow)를 Debug·ReleaseSafe·ReleaseFast에서 독립 실행했습니다. 총 39/39를 테스트 의미 실패로 검출했고 생존·무효·timeout·panic은 각각 0입니다. 로그는 `/tmp/hwpjs-emfplus-set-pixel-offset-mode-mutants.qZRC5g`에 있습니다.

변경 소스를 고정한 뒤 Debug·ReleaseSafe·ReleaseFast 전체 `audit`를 순차 실행했습니다. 각 모드는 40/40 단계와 1,740/1,740 테스트(공통 native 1,701, 별도 chart 31, WMF 8), HWP/WASM 8,905,827회 검사와 imports 0을 통과했습니다. CFB 12,000 변이도 traps 0입니다. 로그는 `/tmp/hwpjs-emfplus-set-pixel-offset-mode-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.

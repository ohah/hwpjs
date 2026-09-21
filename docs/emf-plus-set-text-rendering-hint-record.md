# EMF+ SetTextRenderingHint record

## 범위와 단일 출처

`src/image/emf/emf_plus_set_text_rendering_hint.zig`는 MS-EMFPLUS 2.3.6.8의 EmfPlusSetTextRenderingHint record를 조립합니다. `emf_plus_text_rendering_hint.zig`는 MS-EMFPLUS 2.1.1.31의 TextRenderingHint 0~5를 소유하며 record parser는 enum domain을 복제하지 않습니다. 공통 record framing은 `emf_plus_record.zig`가 담당합니다.

Type은 `0x401f`, Size는 정확히 12, DataSize와 실제 data slice는 0이어야 합니다. Flags의 low byte가 TextRenderingHint이고 high byte는 reserved입니다. reserved bits는 MUST be ignored이므로 모두 승인하고 전체 Flags 원값을 보존합니다. TextRenderingHint는 SystemDefault 0, SingleBitPerPixelGridFit 1, SingleBitPerPixel 2, AntialiasGridFit 3, Antialias 4, ClearTypeGridFit 5만 승인합니다.

공식 3.2.32.5와 3.2.32.15의 두 예제는 Flags `0x0005`를 ClearTypeGridFit으로 명시합니다. 따라서 low byte를 직접 해석하며 1비트 이동하지 않습니다. 참고 구현의 서로 다른 해석보다 공식 wire 예제를 우선합니다.

## stream 연결과 미지원 경계

`emf_plus_stream.zig`는 전용 parser를 호출한 뒤 유효 record 수를 보고합니다. enum·payload·집계 오류는 comment 전체 상태를 원복하고 실제 EMF framing도 같은 경로를 사용합니다.

tracked stream은 [공용 property 상태](emf-plus-property-state.md)에 wire enum을 적용하고 Save/Container 수명주기와 report에 연결합니다. 실제 glyph hinting, ClearType subpixel 처리, 플랫폼 글꼴 설정과 저장은 미구현입니다. 로컬 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 텍스트 출력과의 동등성도 주장하지 않습니다.

## 검증 기록

합성 fixture는 여섯 TextRenderingHint, 모든 reserved bits set, 공식 Flags `0x0005`, enum 6·255, 잘못된 RecordType, 독립 Size/DataSize/slice 불일치, stream 정상·enum 오류·count overflow 원자성과 실제 EMF framing 연결을 검사합니다.

TextRenderingHint domain, RecordType, Size/DataSize/실제 slice, 잘못된 1비트 shift, high-byte 오독, Flags 반환, reserved bits 거부, stream routing, payload parser 우회, report 대상과 overflow를 각각 망가뜨린 13개 유효 의미 변이를 독립 복사본에 주입했습니다. 변이·모드별 local/global cache와 120초 watchdog 아래 Debug·ReleaseSafe·ReleaseFast 총 39/39회를 모두 검출했습니다. 39개 로그를 재분류해 모두 assertion 또는 expected-error 실패이며 컴파일 오류·panic·시간 초과가 없음을 확인했습니다. 결과는 `/tmp/hwpjs-emfplus-set-text-rendering-hint-mutants.r2C75C`입니다.

최종 제품 트리의 전체 `audit`를 Debug·ReleaseSafe·ReleaseFast 순서로 실행했습니다. 세 모드 모두 40/40 단계와 1,726/1,726 테스트(네이티브 1,687, 차트 31, WMF 8), HWP 감사 8,905,827 checks, WASM imports 0으로 통과했습니다. 로그는 `/tmp/hwpjs-emfplus-set-text-rendering-hint-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.

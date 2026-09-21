# EMF+ SetAntiAliasMode record

## 범위와 단일 출처

`src/image/emf/emf_plus_set_anti_alias_mode.zig`는 MS-EMFPLUS 2.3.6.1의 EmfPlusSetAntiAliasMode record를 조립합니다. `emf_plus_smoothing_mode.zig`는 MS-EMFPLUS 2.1.1.27의 SmoothingMode 0~5를 소유하며 다른 property record가 이 enum을 다시 정의하지 않습니다. 공통 record framing은 `emf_plus_record.zig`에 둡니다.

Type은 `0x401e`, Size는 정확히 12, DataSize와 실제 data slice는 0이어야 합니다. Flags의 bit 0은 A이며 set이면 anti-aliasing 권고가 켜지고 clear이면 꺼집니다. bits 1~7은 SmoothingMode, bits 8~15는 reserved입니다. reserved bits는 MUST be ignored이므로 어떤 값도 승인하고 전체 Flags 원값을 보존합니다. SmoothingMode는 정의된 Default 0, HighSpeed 1, HighQuality 2, None 3, AntiAlias8x4 4, AntiAlias8x8 5만 승인하며 6~127은 거부합니다.

## stream 연결과 미지원 경계

`emf_plus_stream.zig`는 전용 parser를 호출한 뒤 유효 record 수를 보고합니다. enum·payload·집계 오류는 comment 전체 상태를 원복하고 실제 EMF comment framing도 같은 경로를 사용합니다.

이 record의 A bit는 명세상 SHOULD 동작이며 SmoothingMode와 별도 값으로 보존합니다. 두 값을 임의로 일치시키거나 보정하지 않습니다. tracked stream은 [공용 property 상태](emf-plus-property-state.md)와 Save/Container 수명주기에 두 값을 적용합니다. 실제 text/curve rasterization과 저장은 미구현입니다. 로컬 HWP corpus에는 EMF+ signature 표본이 없어 한컴 출력과의 동등성도 주장하지 않습니다.

## 검증 기록

합성 fixture는 여섯 SmoothingMode와 A 양쪽 조합, 모든 reserved bits set, enum 6·127, 잘못된 RecordType, 독립 Size/DataSize/slice 불일치, stream 정상·enum 오류·count overflow 원자성과 실제 EMF framing 연결을 검사합니다.

SmoothingMode domain, RecordType, Size/DataSize/실제 slice, smoothing shift, A bit, Flags 반환, reserved bits 거부, stream routing, payload parser 우회, report 대상과 overflow를 각각 망가뜨린 13개 유효 의미 변이를 독립 복사본에 주입했습니다. 변이·모드별 local/global cache와 120초 watchdog 아래 Debug·ReleaseSafe·ReleaseFast 총 39/39회를 모두 검출했습니다. 채택 로그는 assertion 또는 expected-error 실패이며 컴파일 오류·panic·시간 초과가 없습니다. 기본 결과는 `/tmp/hwpjs-emfplus-set-anti-alias-mode-mutants.9pUwAp`, 교체 enum 결과는 `/tmp/hwpjs-emfplus-set-anti-alias-mode-mutants.jkM3rF`입니다.

첫 enum 상한 변이는 값 6으로 `@enumFromInt`를 호출해 Debug·ReleaseSafe safety panic을 만들었으므로 폐기했습니다. 6을 기존 AntiAlias8x8로 잘못 보정하는 유효 의미 결함으로 교체하고 세 모드 모두 expected-error 실패로 다시 확인했습니다.

최종 제품 트리의 전체 `audit`를 Debug·ReleaseSafe·ReleaseFast 순서로 실행했습니다. 세 모드 모두 40/40 단계와 1,721/1,721 테스트(네이티브 1,682, 차트 31, WMF 8), HWP 감사 8,905,827 checks, WASM imports 0으로 통과했습니다. 로그는 `/tmp/hwpjs-emfplus-set-anti-alias-mode-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.

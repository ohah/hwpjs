# EMF+ Clear record

## 범위와 단일 출처

`src/image/emf/emf_plus_clear.zig`는 [MS-EMFPLUS](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/5f92c789-64f2-46b5-9ed4-15a9bb0946c6) 2.3.4.1 EmfPlusClear의 정확한 16바이트 record 계약과 Color를 소유합니다. 공통 `emf_plus_record.zig`가 12바이트 머리와 Size/DataSize framing을, `emf_plus_argb.zig`가 Color의 little-endian 읽기와 Blue/Green/Red/Alpha 배치를 소유합니다. Clear parser는 이 두 규칙을 복제하지 않습니다.

`emf_plus_stream.zig`는 Clear를 실제 EMF+ comment 경로에서 호출하고 유효 record 수를 보고합니다. 상위 `framing.zig`는 기존 comment routing만 소유하며 Clear payload를 다시 해석하지 않습니다.

## 표현과 검증

Clear의 Type은 0x4009, Size는 16, DataSize와 실제 data slice는 각각 정확히 4바이트여야 합니다. 공개 parser는 iterator가 만든 정상 Record뿐 아니라 수동 Record에도 세 크기 축을 독립적으로 검사합니다. Flags는 SHOULD zero이지만 MUST be ignored이므로 모든 u16을 승인하고 원값을 보존합니다. Color는 공통 ARGB reader를 사용하며 색공간 변환이나 실제 화면 지우기는 이 wire 계층의 범위가 아닙니다.

단위 fixture는 서로 다른 네 채널, raw u32, 비zero Flags, 0~3바이트 잘림과 5바이트 초과, 독립적인 Size/DataSize/slice 불일치, 잘못된 RecordType을 검사합니다. Stream fixture는 Header→Clear→EOF 정상 경로, 잘못된 Clear의 comment 전체 원자성, count overflow 원자성을 검사합니다. 실제 EMF framing fixture도 Clear가 stream 보고서까지 전달되는지 확인합니다.

## 적대적 검증 기록

RecordType 검사 제거, Size/DataSize/slice 길이 검사 각각 제거, 비zero Flags 거부, Flags 손실, Color 손실, stream 종류 routing 제거, stream의 payload parser 우회, count wrapping, 상위 framing routing 누락의 11개 유효 의미 결함을 독립 복사본에 주입했습니다. 새로운 local/global cache를 사용한 Debug·ReleaseSafe·ReleaseFast 33/33회에서 모두 검출했습니다.

첫 실행에서는 `emf_plus_stream.zig`가 `image/root.zig`의 lazy export로만 연결되어 stream test filter가 실제 테스트를 수집하지 않았고 세 변이의 9회가 생존했습니다. `src/root.zig`에 stream 테스트 루트를 명시한 뒤 전체 배치를 처음부터 다시 실행했습니다. 상위 framing 연결 제거의 최초 변이는 컴파일 오류였으므로 결과에서 제외하고, EMF+ comment를 private일 때만 잘못 라우팅하는 유효 동작 결함으로 교체해 세 모드에서 검출했습니다. 유효 복사본은 `/tmp/hwpjs-emfplus-clear-mutants.KBc6IQ`, 로그는 `/tmp/hwpjs-clear-mutation-<변이>-<모드>.log`와 교체 변이의 `framing_route_skipped-valid` 로그입니다.

현재 corpus에는 EMF+ signature가 없어 실제 한컴 Clear 표본이나 렌더링 결과를 관측하지 못했습니다. 구현 범위는 공식 wire 구조, stream/framing 연결과 합성·변이 검증이며 그래픽 상태 적용이나 재직렬화를 뜻하지 않습니다.

최종 제품 트리의 전체 `audit`를 Debug·ReleaseSafe·ReleaseFast 순서로 실행했습니다. 세 모드 모두 40/40 단계와 1,634/1,634 테스트(네이티브 1,595, 차트 31, WMF 8), HWP 감사 8,905,827 checks, WASM imports 0으로 통과했습니다. 로그는 `/tmp/hwpjs-emfplus-clear-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.

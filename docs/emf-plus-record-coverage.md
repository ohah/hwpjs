# EMF+ RecordType wire 지원 매트릭스

## 단일 출처와 분류

`src/image/emf/emf_plus_record_type.zig`는 공식 연속 범위 `0x4001..0x403A`의 58개 RecordType 값과 숫자 대응을 소유합니다. `src/image/emf/emf_plus_record_support.zig`는 각 enum 값의 현재 wire 정책을 exhaustive `switch`로 한 번만 분류하고 `emf_plus_stream.zig`가 이 정책을 사용합니다.

정책은 다음 세 가지입니다.

- `wire_validated` 54개: record별 payload parser·고정 control 검사·Object/Comment 처리 중 하나가 stream에 연결되어 있습니다.
- `opaque_preserved` 1개: `StrokeFillPath (0x4037)`는 공식 개별 payload 정의가 없어 공통 envelope 뒤 Flags와 data를 원문 보존하고 수만 집계합니다.
- `forbidden` 3개: `MultiFormatStart/Section/End (0x4005..0x4007)`는 공식 reserved·MUST NOT이므로 stream이 payload와 무관하게 거부합니다.

새 RecordType이 enum에 추가되면 정책 switch도 명시적으로 갱신해야 컴파일됩니다. 숫자 범위에서 정책을 추론하는 런타임 fallback이나 이름 기반 휴리스틱은 사용하지 않습니다. 문서는 58행 대응표를 다시 복제하지 않고 이 코드 정책과 각 record 계약 문서로 연결합니다.

## 완료로 세지 않는 범위

`wire_validated`는 해당 record의 wire payload·참조·stream 상태 검사를 뜻할 뿐 graphics 동작 재생을 뜻하지 않습니다. [GetDC 뒤 일반 EMF record 구간](emf-plus-get-dc-interleaving.md)은 framing에서 관측·집계하지만 실제 playback surface에 적용하지 않습니다. world/page transform, [보수적 clip state](emf-plus-clip-state.md), [정확한 terminal-server rectangle 배열](emf-plus-ts-clip-state.md)과 [여덟 property state](emf-plus-property-state.md)의 snapshot은 별도 계층에서 일부 재생하지만 일반 clip geometry, drawing rasterization, text shaping, image resampling과 저장은 후속 범위입니다.

`opaque_preserved`도 payload 지원이 아닙니다. `StrokeFillPath`의 Pen/Brush/Path 배치를 추정하거나 현재 객체를 임의로 연결하지 않습니다. 로컬 지원 HWP corpus의 EMF+ signature 표본은 0개이므로 54개 wire 정책은 합성 fixture와 공식 구조 대조 결과이며 실제 한컴 출력 동등성 주장이 아닙니다.

## 공식 근거

- [MS-EMFPLUS RecordType Enumeration](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/abffcb71-1b31-414f-b032-f1e00c57a48a)
- [MS-EMFPLUS Record Types](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/0597197d-20f5-4c55-a185-260d7bec7a11)
- [EMF+ record stream](emf-plus-record-stream.md)
- [StrokeFillPath opaque 관측](emf-plus-stroke-fill-path-record.md)
- [reserved MultiFormat와 private Comment](emf-plus-comment-records.md)

## 검증 기록

독립 숫자 oracle은 `0x4001..0x403A`를 전부 순회해 `0x4005..0x4007`만 forbidden, `0x4037`만 opaque, 나머지는 wire-validated인지 검사하고 정책별 `54/1/3`, 전체 58을 확인합니다. 기존 stream·framing 테스트는 세 reserved 값 거부와 StrokeFillPath 원문 보존·집계, 각 개별 record parser 연결을 검사합니다.

다섯 관점의 적대적 검토로 (1) 공식 58개 enum 값과 연속 범위, (2) reserved MUST NOT 세 값, (3) StrokeFillPath 문서 공백과 opaque 경계, (4) exhaustive 정책 SSOT와 stream 실제 사용, (5) wire 검증·replay·실파일 동등성의 분리를 대조합니다.

세 reserved 분류, StrokeFillPath opaque 분류, 일반 Header·FillClosedCurve 분류, stream 정책 입력과 forbidden 비교를 각각 훼손한 8종 의미 변이를 독립 복사본과 모드별 새 cache에서 실행했습니다. Debug, ReleaseSafe, ReleaseFast의 24/24 실행이 모두 컴파일 오류·panic·timeout이 아닌 실제 테스트 실패로 검출됐고 임시 복사본·cache·실행기는 제거했습니다.

최종 `zig build audit --summary all`, `-Doptimize=ReleaseSafe`, `-Doptimize=ReleaseFast`는 각 모드에서 40/40 step과 1883/1883 test를 통과했습니다. 모드별 구성은 native 1844, chart ownership 31, WMF contents 8이며, 각 실행은 8,905,827 checks, imports 0과 CFB 12,000 mutation의 traps 0을 기록했습니다.

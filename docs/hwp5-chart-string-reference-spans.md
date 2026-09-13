# 차트 String 참조 span

## 계약

`chart/font.zig`의 `Font.name_start/name_end`와 `chart/text_block_body.zig`의 `Body.text_start/text_end`는 각 String 위치가 원본 Contents에서 차지한 반개방 구간 `[start, end)`입니다. 기존 객체 재참조는 u32 object ID만 소비하므로 4바이트이고, 새 객체 정의는 ID와 inline String 정의 전체를 포함합니다. nullable 본문의 null도 sentinel 4바이트를 보존합니다. 값은 `Contents.source` 기준 offset이며 대응 값·도입 상태와 같은 파싱 시점에 한 번만 결정합니다.

객체 참조 경계의 SSOT는 이미 계산되는 `object_table.Reference.start/end`입니다. Font와 TextBlock은 조립 결과가 그 경계를 잃지 않도록 전달하며 별도 바이트 검색이나 값 기반 위치 추정을 하지 않습니다. null과 독립 inline 경로는 객체 Reference가 없으므로 reader cursor가 경계를 소유합니다. 객체 정의 자체를 바꾸는 API는 [String 객체 편집](hwp5-chart-string-edit.md)이 소유하고, 원본 구간 적용은 [span patch writer](hwp5-chart-patch-writer.md)가 소유합니다.

## 실제 fixture 검증

SHA-256 고정 9,876바이트 Contents에서 새로 도입되는 Legend Font 이름 span이 4바이트보다 크고 시작 u32가 String object ID인지 확인합니다. 이미 존재하는 주축 Font 이름은 `name_introduced == false`, span 길이 4바이트이며 해당 u32가 같은 object ID인지 확인합니다. 전체 반환 필드 계약은 `tests/hwp5/chart-observed-field-contract.zig`가 필드 누락·순서 변경을 컴파일 단계에서 감지합니다.

## 적대적 검증

참조 시작을 1바이트 뒤로 이동, 끝을 1바이트 앞으로 이동, inline 정의 끝을 시작+4로 축소한 세 변이를 Debug·ReleaseSafe·ReleaseFast에서 각각 컴파일·실행했습니다. 9개 조합은 모두 컴파일에 성공한 뒤 실제 fixture assertion 실패로 거부됐으며 컴파일 실패나 trap은 결과로 세지 않았습니다.

## 미구현 범위

span 보존 자체는 참조를 수정하거나 새 object/type ID를 할당하지 않습니다. 이를 사용하는 writer는 [String 참조 분리](hwp5-chart-string-fork.md)입니다. Font 밖의 String 참조 구조는 이미 자체 `Reference`를 보존하는 경우만 현재 span을 노출합니다.

# 전체 Contents 반환 필드 계약

## 목적

개별 wire 대조가 많아져도 제품 struct에 새 필드가 추가됐을 때 기존 검사가 조용히 통과하면 SSOT가 아닙니다. `tests/hwp5/chart-observed-field-contract.zig`는 mode 336의 선택된 Contents 조립에서 도달하는 제품 struct 45개의 필드 이름과 선언 순서를 컴파일 시점에 고정합니다. 전체 조립 probe가 이 계약을 직접 호출하므로 정규 audit의 WASM 컴파일 경로에 포함됩니다.

필드 목록은 **변경 감지 계약**입니다. 목록에 있다는 사실만으로 해당 필드 값이 독립 wire와 대조된다고 주장하지 않습니다. 값 대조는 `chart-observed-contents-probe.zig`와 주제별 공통 serializer, 기대값은 `chart-observed-contents-oracle.mjs`와 주제별 독립 oracle이 소유합니다. 새 필드 추가 시 계약 목록만 갱신해서는 안 되며 값 대조 또는 명시적 제외 근거를 함께 갱신해야 합니다.

allocator, source, options, HashMap 저장소처럼 파일의 의미 필드가 아닌 소유권·원본·한도·구현 필드도 구조 변경 감지를 위해 목록에는 포함합니다. 이들을 바이너리 반환 wire에 넣거나 HWP 필드라고 해석하지 않습니다. source와 String이 빌리는 입력 및 table이 소유한 이름의 수명 계약은 [원본 바이트 보존](hwp5-chart-source-preservation.md), [Contents 조립](hwp5-chart-observed-contents.md), [사전 엔트리 대조](hwp5-chart-observed-tables.md)가 소유합니다.

## 적대적 검증

임시 제품 코어 복사본에서 다음 두 변형을 각각 실행했습니다.

- 최상위 `Contents`에 기본값을 가진 새 필드 추가.
- 중첩 `TextFormat`에 기본값을 가진 새 필드 추가.

두 경우 모두 기존 생성 코드가 새 필드를 명시하지 않아도 컴파일될 수 있는 형태입니다. Debug·ReleaseSafe·ReleaseFast 총 6건 모두 field contract의 `observed chart field contract count changed` 진단으로 컴파일 실패했습니다. 정상 소스는 ReleaseSafe probe를 컴파일하고 실제 43개 Contents의 정상·변형 1,452건 및 기본 거부 946건을 통과했습니다. 임시 로그는 `/tmp/hwpjs-field-schema-mutant.*` 아래에 있으며 영구 보존을 보장하지 않습니다.

컴파일 실패가 목적인 schema 계약 검증이며, 반환값 결함 주입처럼 런타임 실패를 요구하는 검사가 아닙니다. 반대로 일반 제품 컴파일 오류를 계약 검출로 세지 않고 위 전용 진단이 존재하는지 확인했습니다.

## 한계

현재 계약은 선택된 Contents 조립 그래프의 제품 결과 struct를 대상으로 합니다. 함수 지역 변수, Options의 개별 필드, 독립 조사 전용 JS 객체, 아직 제품 파서가 지원하지 않는 차트 배치는 대상이 아닙니다. 필드 순서 변경은 감지하지만 의미 변경이나 잘못된 값은 주제별 oracle·결함 주입으로 검증해야 합니다. 전체 HWP 문서 모델이나 저장 포맷의 필드 완전성 계약도 아닙니다.

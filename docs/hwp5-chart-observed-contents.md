# 명시적 배치의 Contents 조립

## 범위

`chart/observed_contents.zig`의 `readObservedV6`는 개별 관측 코어를 전체 Contents의 선택 배치로 연결합니다. 자동 형식 인식·범용 객체 그래프·렌더링·편집·저장 API가 아닙니다. 알려지지 않은 필드를 의미값으로 바꾸거나 오류 뒤 다른 배치로 재시도하지 않습니다.

필수 `Layout`은 primary_axis_count, line_item_count, Series별 series_point_counts를 받습니다. 반환값은 이 선택 배열을 빌리지 않습니다. 실제 표본의 네 축·두 선 항목·각 Point 개수는 시험 입력의 선택이며 제품 자동 판정 기본값이 아닙니다. 각 하위 코어의 빈 초기 배열·동일 word 등 기존 지원 제한은 유지됩니다.

최종 Tail 뒤 바이트가 남으면 UnexpectedChartTrailingBytes입니다. 정확한 EOF가 전체 필드 의미나 ID 그래프 완전성의 증거는 아닙니다.

## 책임·소유권

- `initial_objects.zig`: Grid 셀·Backdrop·Footnote의 확인된 초기 객체 등록 순서. 기존 Legend 시험 Prefix와 제품 조립이 공유합니다. root/grid 원시 word는 ID로 추정하지 않습니다.
- `contents_prefix.zig`: Grid → raw26/Backdrop → Footnote → 초기 객체 목록 → Legend. Grid·타입 목록·객체 목록을 소유합니다.
- `observed_contents.zig`: Plot → Light → 선택 개수의 주축 → Surface → nullable 제목 축 → 원시 line_word → 선택 선 항목 → PostLine → 선택 Series → Title 본문 → Tail. 모든 결과와 원시 필드를 반환합니다.

문자열은 원본 Contents를 빌리므로 반환 객체를 사용하는 동안 원본을 유지해야 합니다. 타입 이름은 Grid의 타입 목록이 소유합니다. 전체 결과는 Series/Point, 선 항목 배열, 주축 배열, Light 원소, 초기 Prefix 순서로 정리합니다. 각 할당 직후 실패 해제를 등록하며 미완성 축·선 항목은 추가 소유 할당이 없는 값이므로 배열 저장 공간만 해제합니다.

축·선 항목 한도는 조립 진입점이 검사하고, Series 개수·Point 한도는 기존 SeriesCollection과 공유하는 validateCounts로 사전 검사합니다. 나머지 바이트·셀·타입·문자열·객체·광원 한도는 각 소유 모듈의 Options로 전달합니다.

## 현재 검증 상태

비공개 mode 336과 `chart-observed-contents-smoke.mjs`로 최초 연결을 확인했습니다. ReleaseSafe WASM에서 실제 43개 차트의 EOF·타입/객체/문자열 총계·축/선/Series/Point/광원 개수·Grid 전이와 Tail의 raw26이 독립 조사 결과와 일치했습니다. 후행 바이트·마지막 바이트 잘림·객체 한도 부족 129건을 기대한 Error와 이름으로 거부하고 원본 재파싱을 대조했습니다.

Series 한도 사전검사 공통화 후 ReleaseSafe WASM을 재빌드해 위 초기 43/129 대조를 다시 통과했습니다. 기존 SeriesCollection native 검사(root 포함) 5/5개도 세 모드에서 통과했습니다.

입력 바이트 한도 검사를 추가한 기본 smoke도 같은 ReleaseSafe WASM으로 다시 실행해 정상 43건·거부 172건을 확인했습니다(후행 바이트, 마지막 바이트 잘림, 객체 한도, 입력 바이트 한도 각각 43건).

동일 검사 함수의 `allCuts: true` 실행은 실제 43개 차트의 382,411개 모든 잘림을 검사했습니다. 가능한 경우 Contents extent를 잘린 길이로 갱신하여 내부 실패 경로까지 도달시켰습니다. 모든 잘림은 UnexpectedEnd이며 원본 재파싱도 대조했습니다. 후행 바이트·객체 한도·입력 바이트 한도까지 합산한 ReleaseSafe 거부는 382,540건, 정상 대조는 43건입니다. 이 검사는 여전히 반환 필드 전체의 대조는 아닙니다.

Point가 포함된 실제 표본(SHA-256 `2e56516aabde4ff7cb73f946860e83c345d0944b0c11e0322f09b739cac1d56a`, 9,876바이트, Series별 Point 4/4/4)을 임시 native 검증에 사용했습니다. `/tmp/hwpjs-observed-ownership.EZn018/ownership.zig`는 정상 할당 해제, OOM 주입, 모든 잘림·후행 바이트 오류, 아홉 초기/후반 한도 오류를 검사하며 네 테스트가 Debug·ReleaseSafe·ReleaseFast에서 통과했습니다. safety=true·명시적 할당 잔량 0을 검사하고, 문자열이 원본을 빌리는지와 원시 구간이 복사되는지도 확인했습니다. 원본 파일을 수정하지 않았으며 추출 hex는 임시 경로에만 있습니다.

동일 임시 표본으로 해제 누락 7종을 세 모드에서 검사했습니다. 21개 모두 컴파일 성공 후 실제 테스트 실패·종료 코드 1이었으며, 일반 할당자의 명시적 잔량 검사에서 다음 비영 값이 세 모드 동일하게 검출됐습니다. OOM 검사 실패나 컴파일 오류를 이 해제 누락 검출로 대신 세지 않았습니다.

| 제거한 해제 | 남은 바이트 |
|---|---:|
| 정상 Series/Point | 7,248 |
| 정상 주축 배열 | 3,872 |
| 정상 선 항목 배열 | 128 |
| 정상 Light | 80 |
| 정상 초기 Prefix | 12,859 |
| 실패 시 초기 Prefix | 4,644 |
| 실패 시 Series/Point | 7,248 |

로그는 같은 임시 폴더의 `*-{Debug,ReleaseSafe,ReleaseFast}.log`이며 대응하는 21개 compile.log는 비어 있습니다.

### Series·Title 반환값 대조 확장

mode 336의 최초 88바이트 집계 뒤에 기존 SeriesCollection·Title 시험 wire를 연결했습니다. 개별 probe의 결과 직렬화를 공통 함수로 분리했으며 전체 조립이 실제 반환한 객체를 전달합니다. 원본을 다시 파싱해 반환값을 대신 만들지 않습니다. 문자열·Point·Label·Format·Picture·Series raw106·Title Section/Backdrop 등 기존 wire가 표현하던 값을 함께 대조합니다. 각 중첩 구조의 모든 end 필드까지 검사한다고 주장하지 않습니다.

JS 기대 wire도 기존 독립 관측 결과의 조립 함수로 분리했습니다. 객체·타입·저장 문자열 총계는 조회 시점의 scope를 명시적으로 받습니다. 개별 파서의 종료 scope와 전체 Tail까지 읽은 scope를 혼동하지 않습니다. `chart-observed-contents-oracle.mjs`가 전체 선택 배치와 기대값 연결을 소유합니다. 제품 Zig serializer에서 기대값을 생성하지 않습니다.

ReleaseSafe 실측:

- 실제 43개 차트와 각 차트의 Series trailer·Title Section 원시 필드 변형 43개, 합계 정상 86건 일치. 후행 바이트·마지막 잘림·객체/입력 한도 거부 172건 통과.
- 확장된 반환 wire로 모든 잘림 382,411건을 다시 검사했습니다. 한도·후행 바이트를 합친 거부는 382,540건이며 각 거부 뒤 원본 반환 wire도 재대조했습니다.
- 기존 SeriesCollection 검사는 정상 172건·거부 148,209건(43차트, Series 213개, Point 16개), Title 검사는 정상 301건·거부 15,386건 통과.
- HEAD의 두 기존 JS oracle과 리팩터 후 결과를 43개씩 비교하여 기대 wire·관측 필드/Map·입력 wire가 86건 모두 같음을 확인했습니다.
- 반환 wire의 8개 위치 변조와 같은 기대 오류 메시지를 가진 RuntimeError/TypeError/RangeError 3종이 AssertionError로 검출됐습니다. 변조 위치가 잘못된 검사 자체의 오류는 검출 성공으로 세지 않습니다.

기본 86/172 대조와 위 검사기 방어 검사는 정규 WASM audit에도 연결했습니다. 모든 잘림 실행은 이 기본 대조와 별도입니다. 변경을 고정한 세 모드 전체 audit를 순차 실행해 종료 코드 0을 확인했습니다. Debug·ReleaseSafe·ReleaseFast 각각 단계 32/32, native 1,089/1,089(코어 1,085 + 소유권 4), WASM checks 8,902,901, imports 0으로 통과했습니다. 로그는 `/tmp/hwpjs-observed-fields-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.

반환 구조와 wire를 직접 비교했을 때 다음 확장이 남습니다. Series의 `section.end`·`suffix.end`는 기존 wire에 없어 전체 조립에서도 아직 별도 대조하지 않습니다. Grid/Footnote/Legend, Plot/Light, 주축/보조축, Surface, 선 항목과 `line_word`, PostLine의 개별 필드 및 Tail List/Window의 식별자·word도 mode 336에서는 아직 전체 대조하지 않습니다(일부 개수와 원시 구간만 비교). 테이블 총계 일치 역시 개별 엔트리 일치를 대신하지 않습니다. 기존 개별 모듈 검사의 통과를 이 전체 조립 반환값 검사의 완료로 대신하지 않습니다.

### 축 배치의 실제 표본 편향

전체 audit를 실행하는 동안 원본을 변경하지 않고 `axesOracle`·`nullableTitleOracle`로 43개 Contents의 축 분기를 다시 집계했습니다. 이는 독립 관측의 입력 분포이며 아직 mode 336의 축 반환 필드 검증 실적은 아닙니다.

| 관측 항목 | 주축 172개 | 보조축 43개 |
|---|---:|---:|
| Scale 존재 | 69 | 0 |
| Tail 추가 구간 존재 | 6 | 0 |
| null 제목 | 0 | 43 |
| 빈 문자열 제목 | 0 | 0 |
| 기존 font-name 문자열 참조 | 172 | 43 |
| 기존 제목 문자열 참조 | 0 | 0 |

따라서 이 표본만 반복해도 빈 제목, 제목 alias, 보조축의 비-null 제목·Scale·추가 Tail 조합은 검증되지 않습니다. 다음 전체 조립 검사는 재사용 가능한 `chart-axes-probe.zig`의 결과 전용 serialize와 독립 `axisWire`를 연결하고, 표본에 없는 분기를 명시적인 변형/합성 입력으로 따로 다뤄야 합니다. Light·선 항목·PostLine은 현재 개별 probe에서 파싱과 출력이 결합돼 있으므로 결과 직렬화 책임을 먼저 분리합니다. 이 연결 계획을 이미 구현된 검사로 계산하지 않습니다.

추가 일회성 ReleaseSafe 검사에서는 기존 보조축 검사와 같은 방식으로 각 표본의 null 제목을 기존 font-name 참조, 새 빈 문자열, 새 원시 문자열 `ff 80 00`으로 각각 바꿨습니다. 길이가 바뀔 때 Contents extent도 갱신했습니다. 세 종류 각 43건이 전체 조립을 통과하고 현재 mode 336 wire와 독립 기대값이 일치했으며 원본 43건도 재대조했습니다. 입력 Buffer만 변경했으며 원본 파일과 audit 중인 소스·테스트는 수정하지 않았습니다. 이 129개 변형은 downstream 오프셋·집계·Series/Title 유지 확인이며, 아직 wire에 없는 보조축 제목 반환값 자체의 검증이나 정규 audit 연결 완료는 아닙니다.

### 저장소의 지속적인 소유권 회귀 검사

임시 native 검사의 네 테스트를 `tests/hwp5/chart-observed-ownership.zig`로 옮겨 정규 audit에 연결했습니다. 실행 명령은 [개발·검증 명령](development-commands.md)에 둡니다. 현재 소스로 Debug·ReleaseSafe·ReleaseFast 각각 빌드 단계 10/10, native 4/4, JS 생성기 2/2 통과를 확인했습니다.

이 연결 이후 전체 코어 단위 테스트 1,085/1,085와 ReleaseSafe 제품 빌드 5/5도 통과했습니다. 별도 소유권 테스트 네 개는 이 코어 단위 테스트 수에 포함되지 않습니다. Zig 포맷·변경 JS 구문·diff 공백 검사도 통과했습니다. 후속 세 모드 전체 audit 결과는 위 반환값 대조 확장 절에 기록했습니다.

- `chart-observed-fixture.mjs`는 기존 corpus의 Contents를 위 SHA-256으로 선택하고 독립 JS oracle의 Point 개수 4/4/4를 확인합니다. 원본을 수정하거나 다른 배치로 조용히 대체하지 않습니다.
- `chart-native-fixture-module.mjs`는 바이트를 불활성 `\\xHH` 문자열로 인코딩합니다. 생성 모듈은 빌드 캐시에만 저장하며 원본 표본 바이너리나 추출 hex를 저장소에 추가하지 않습니다.
- 생성기 테스트는 256가지 바이트의 왕복 일치, 결정성, 입력 변경과 출력의 분리, 빈/과대 입력, sparse 배열, 잘못된 개수와 코드 삽입 모양의 문자열 거부를 검사합니다.
- 빌드의 stdout 캡처에는 `.zig` 확장자를 명시합니다. 외부 corpus와 JS oracle 변경이 오래된 캡처 캐시에 가려지지 않도록 생성 명령을 매번 실행합니다.

모든 반환 필드 대조, 다양한 배치의 native 회귀 확장, 배치 개수/한도 전달 변형, 클래스·ID 등의 모든 실패 경로, 그 밖의 결함 주입은 아직 남아 있습니다. 위 표본 하나의 통과를 모든 배치의 소유권 검증 완료로 해석하지 않습니다. 이 파트는 명시적 배치의 조립과 현재 wire/소유권 검사이며 전체 문서 검증 완료가 아닙니다.

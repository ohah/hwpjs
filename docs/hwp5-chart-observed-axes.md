# 전체 Contents의 축 반환값 대조

## 범위와 책임

[명시적 배치 조립](hwp5-chart-observed-contents.md)의 mode 336 시험 출력에 주축 배열 순서와 보조축을 추가했습니다. `chart-axes-probe.zig`의 결과 전용 serialize와 독립 `chart-axes-oracle.mjs`의 axisWire를 재사용합니다. 개별 축 종료 시점이 아닌 전체 Contents 종료 시점의 객체·문자열 총계를 명시적으로 전달합니다. 제품 파서의 배치 판정이나 지원 형식을 바꾼 작업은 아닙니다.

추가 대조는 축 ID/end/raw82, 제목 TextBlock/Font/String, Scale 유무·배열·ValueBlock, Tail 유무·원시 구간/end를 기존 wire 수준으로 검사합니다. 전체 조립 반환 객체를 직접 직렬화하며 입력을 다시 파싱한 결과로 대신하지 않습니다. ValueBlock 내부 Reference/label의 start/end는 아래 후속 절에서 연결했습니다.

## 표본 밖의 분기

- `chart-axis-title-variants.mjs`: null 보조축 제목을 기존 font-name 참조, 새 빈 문자열, 새 원시 문자열 `ff 80 00`으로 바꾸는 시험 생성기입니다. 기존 개별 보조축 검사와 전체 조립 검사가 공유합니다.
- `chart-axis-tail-variant.mjs`: selector 0·추가 Tail 없음 전제를 확인한 뒤 selector 1과 24바이트 `a5` 구간을 삽입합니다. 실제 파일에서 발견했다는 뜻이 아닌, 지원된 선택 배치의 합성 입력입니다.
- 전체 조립 검사는 null 및 세 제목 변형 각각에 추가 Tail을 조합합니다. 원시 필드 변형에서도 배치 selector는 유지하고, 소비되는 원시값은 실제 반환 wire와 대조합니다.

원본 파일은 수정하지 않습니다. 길이가 달라진 메모리 입력의 Contents extent도 갱신합니다. 보조축의 Scale 있는 배치 등 아직 조합하지 않은 분기는 남아 있습니다.

## 실측

ReleaseSafe 전체 조립 probe에서 실제 차트 43개를 기반으로 정상·변형 430건과 기본 오류 172건이 통과했습니다. 모든 잘림 실행도 정상·변형 430건, 잘림 382,411건, 한도·후행 바이트 포함 오류 382,540건을 통과했습니다. 오류 뒤 원본 반환 wire를 다시 대조합니다.

기존 개별 보조축 검사는 정상 301건·오류 12,298건입니다. 당시 HEAD의 검사 함수와 공통 생성기 추출 후 함수를 같은 WASM으로 실행하고 호출 mode·limit·입력 길이·바이트를 순서대로 해시했습니다. 24,897개 호출과 결과가 일치했으며 SHA-256은 `df785011c0a9bbe54d203ef2f2b690cdc9795e19b41060e38c6bc7e7c31a21ec`입니다. 첫 비교 시 임시 data-module의 상위 상대 import를 해결하지 못한 실행은 제외하고, 모든 상대 import를 절대 경로로 해석한 뒤 성공을 확인했습니다.

## 적대적 검증

임시 디렉터리 `/tmp/hwpjs-axis-return-mutants.tbcElm`에 코어 소스 복사본과 mode 336만 노출하는 작은 시험 bridge를 만들었습니다. 원래 제품 소스는 변경하지 않았습니다. 다음 10개 소스 변형을 Debug·ReleaseSafe·ReleaseFast에서 검사했습니다.

| 변형 | 개수 |
|---|---:|
| 전체 주축 raw82 삭제 | 1 |
| 주축 Scale 삭제 | 1 |
| 주축 추가 Tail 삭제 | 1 |
| 보조축 제목을 강제로 null 처리 | 1 |
| 주축 0/1/2/3 각각의 raw82 삭제 | 4 |
| 보조축 raw82 삭제 | 1 |
| 보조축 추가 Tail 삭제 | 1 |

30건 모두 컴파일 성공 후 실제 대조에서 ERR_ASSERTION·종료 코드 1로 실패했습니다. 컴파일 실패나 임의 trap을 검출 성공으로 대신하지 않았습니다. 정상 코어와 같은 작은 bridge는 세 모드 각각 정상·변형 430건, 기본 오류 172건을 통과했습니다. 각 변형의 `*.compile.log`와 실행 `*.log`는 위 임시 경로에 있습니다.

기존 검사기 방어 검사도 동일 메시지의 호스트 예외 3종과 출력 바이트 변조 8종을 검출했습니다. 이 축 확장은 정규 audit가 호출하는 smoke에 연결됐으며 후속 누적 세 모드 전체 audit도 통과했습니다. 최종 수치와 로그는 [사전 엔트리 대조](hwp5-chart-observed-tables.md)가 소유합니다.

## 후속: ValueBlock 참조 위치

기존 공통 ValueBlock wire는 reference·label의 값과 `introduced`는 대조했지만 각 `ObjectTable.Reference`/`ValueReference`가 반환한 `start`·`end`를 빠뜨렸습니다. `chart-value-block-probe.zig`와 독립 `chart-value-block-oracle.mjs`에 네 위치 필드를 추가해 개별 ValueBlock 검사와 전체 축 조립 검사가 같은 계약을 사용합니다.

개별 probe는 잘라낸 ValueBlock 본문의 0 기준 위치, 전체 조립은 Contents의 절대 위치를 반환합니다. oracle의 기존 `start` 인자를 네 필드에도 적용하여 좌표계를 명시적으로 변환합니다. 최초 실행에서 이 변환 누락으로 실제/기대 위치가 달랐고, 제품 오류로 세지 않고 oracle을 수정한 뒤 두 경계를 각각 재검증했습니다.

ReleaseSafe에서 실제 차트 경로 43개, ValueBlock 69개(숫자 reference 2개)의 개별 검사는 정상 276건·거부 25,326건을 통과했습니다. 전체 조립은 정상·변형 1,452건·기본 거부 946건, 모든 잘림 382,411개 위치와 기타 오류를 합친 거부 383,314건을 통과했습니다. 검사기 방어의 호스트 예외 3종·반환 바이트 변조 8종도 검출했습니다.

임시 코어 복사본에서 주축 Scale의 non-null reference start/end 및 필수 label start/end를 각각 변경했습니다. Debug·ReleaseSafe·ReleaseFast 총 12건 모두 컴파일 종료 코드 0 뒤 실제 wire 대조의 `ERR_ASSERTION`·실행 종료 코드 1로 검출했습니다. 최초 두 번의 임시 결함 컴파일은 Zig 단일문장 `for/if` 문법 오류였으며 검출 실적으로 세지 않았습니다. 수정한 로그는 `/tmp/hwpjs-value-reference-mutants.izmT6i`에 있습니다.

이 문단 작성 당시와 달리 현재 TextFormat 코어는 코드 String의 `code_start/code_end`도 보존합니다. [TextFormat 계약](hwp5-chart-text-format.md)대로 필수/nullable 반환 경로와 공통 ValueBlock wire는 이 값을 독립 oracle과 대조하며, 전체 축 조립도 ValueBlock wire를 재사용합니다. 반면 ValueBlock 자체의 `format_start/format_end`는 제품 구조에 존재하지만 현재 축 wire에서 별도 수치로 비교하지 않습니다. 따라서 위치 필드 전부가 동적 대조를 통과했다는 뜻은 아닙니다.

위 `/tmp` 변이 디렉터리·호출 해시·모든 잘림 및 세 모드 전체 audit 수치는 당시의 검증 이력입니다. 현재 검증에서 재실행하지 않은 항목을 현행 통과로 소급하지 않습니다. 공개 문서 모델·편집·저장은 이 시험 mode의 반환값 대조 범위가 아닙니다.

## 2026-09-28 재검증

현재 ReleaseSafe probe mode 336과 독립 `observedContentsCase`를 다시 실행해 실파일 43개 기반 정상·변형 1,452건, 예상 거부 946건을 대조했습니다. 이번 기본 실행의 잘림은 각 표본 마지막 1바이트씩 43건입니다. 검사기 자체의 호스트 예외 3종·반환 바이트 변조 8종도 모두 탐지했습니다. 과거 382,411개 모든 잘림이나 24,897개 호출 해시 동치, 10종 소스 변이·TextFormat span 변이는 다시 수행하지 않았습니다. 현재 ReleaseSafe HWP5 전체 감사 10/10 단계·8,905,855회 검사가 통과했지만, 이는 축 wire에 없는 `format_start/format_end`의 값 대조를 증명하지 않습니다.
